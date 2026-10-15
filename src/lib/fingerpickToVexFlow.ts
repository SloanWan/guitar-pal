import {
	TabNote,
	TabNotePosition,
	TabTie,
	TabSlide,
	Tuplet,
	Fraction,
	GhostNote,
	Stem,
	StaveNote,
	StemmableNote,
	GraceTabNote,
	GraceNoteGroup,
	Element as VexElement,
	Annotation,
	AnnotationVerticalJustify,
	Tremolo,
	Vibrato,
	Bend,
} from "vexflow";

import {
	type Measure,
	type Duration,
	type EffectKind,
	type LinkKind,
	type NoteEffects,
	type PercussionKind,
	type SpanKind,
	type StringFret,
	type Stroke,
} from "@/lib/fingerpickTypes";
import { chordSymbolLabel } from "@/lib/fingerpickChords";
import { TRIPLET_GROUP_SIZE, tripletGroups } from "@/lib/fingerpickEdit";
import { indexPattern, slurredInside, type PatternIndex } from "@/lib/fingerpickIndex";
import { WHAMMY_SEMITONES } from "@/lib/fingerpickExpression";
import { isCompound, type Meter } from "@/lib/strumMeter";
import type { ChordRef } from "@/lib/strumPatterns";
import { EFFECT_STACK_ORDER, techniqueDef } from "@/lib/techniqueRegistry";

/**
 * An empty slot's spacer. VexFlow places a tuplet bracket from each member's
 * stem, and a rest counts as a member — a GhostNote is a rest with no stem, so
 * an empty triplet slot (a bar just filled from the "All" row) threw from
 * `Tuplet.draw`. Answering with the stave's top line keeps the bracket where
 * the sounding notes put it; beams still see a rest and break around it.
 */
class SilentNote extends GhostNote {
	getStemDirection(): number {
		return Stem.UP;
	}

	getStemExtents(): { topY: number; baseY: number } {
		const y = this.checkStave().getYForLine(0);
		return { topY: y, baseY: y };
	}
}

export const VEX_DURATION: Record<Duration, string> = {
	whole: "w",
	half: "h",
	quarter: "q",
	"dotted-quarter": "qd",
	eighth: "8",
	"dotted-eighth": "8d",
	// Tuplet notes use the underlying undivided duration; the Tuplet wrapper
	// adjusts tick values for correct Formatter spacing and draws the bracket.
	"eighth-triplet": "8",
	sixteenth: "16",
	"sixteenth-triplet": "16",
	"32nd": "32",
};

/**
 * A chord symbol to write above the stave, at the note where the chord changes.
 *
 * Not a VexFlow modifier on purpose: `ChordSymbol` is skipped by `GhostNote.draw`
 * (an empty slot can start a chord too) and `Annotation` hangs its height off
 * the note's own y, so symbols would ride up and down with the strings played.
 * The renderer writes these itself at a fixed line above the stave, using the
 * formatted note's x.
 */
export interface ChordLabel {
	/** Index into `notes` of the note the symbol sits over. */
	noteIndex: number;
	/** The slot carrying the mark (a grace slot's mark reports the grace slot). */
	slotIndex: number;
	chord: ChordRef;
	label: string;
}

/**
 * A roll (arpeggiated chord) to draw beside a note. Not a VexFlow `Stroke`
 * modifier: that one pads the arrow half a line past the outermost played
 * strings and rounds its wiggle up to a whole glyph, so it visibly spills onto
 * strings the slot does not play. The renderer draws the arrow itself, exactly
 * between the note's first and last played string.
 *
 * Notation convention, kept from the previous VexFlow rendering: an arrow
 * pointing UP means low → high pitch, i.e. our "roll-down".
 */
export interface RollMark {
	/** Index into `notes` of the note the roll belongs to. */
	noteIndex: number;
	stroke: Stroke;
}

/**
 * How the stave beams a bar: by the meter's beat. A simple meter beams each
 * quarter (3/4 is 2+2+2 eighths), a compound one each dotted quarter (6/8 is
 * 3+3). Passed to `Beam.applyAndGetBeams`.
 */
export function beamGroupsFor(timeSignature: Meter): Fraction[] {
	return isCompound(timeSignature) ? [new Fraction(3, 8)] : [new Fraction(1, 4)];
}

// ─── Bends ───────────────────────────────────────────────────────────────────

export type BendArrow = "up" | "down";

/**
 * What a bend technique draws over its note: an arrow phrase for VexFlow's
 * `Bend` (up = bend, down = release) and, for the pre-bend family, a "PB"
 * label — the string is already bent when picked, so there is no rise to draw.
 * VexFlow-free so it can be unit-tested without a canvas.
 */
export interface BendMark {
	phrase: { type: BendArrow; text: string }[];
	preBendLabel?: string;
}

/** The height label guitar tab writes over a bend arrow, from `bendTarget` semitones. */
export function bendHeightLabel(semitones: number | undefined): string {
	const st = semitones === undefined || !(semitones > 0) ? 2 : semitones;
	if (st === 2) return "Full";
	if (st === 1) return "1/2";
	if (st === 0.5) return "1/4";
	if (st === 1.5) return "1 1/2";
	return `${st}`;
}

/** The mark a bend effect draws: the arrow phrase and, for a pre-bend, its label. */
export function bendMarkForEffect(bend: NonNullable<NoteEffects["bend"]>): BendMark {
	const height = bendHeightLabel(bend.semitones);
	if (bend.pre) {
		return {
			phrase: bend.release ? [{ type: "down", text: "" }] : [],
			preBendLabel: `PB ${height}`,
		};
	}
	return { phrase: bend.release ? [{ type: "up", text: height }, { type: "down", text: "" }] : [{ type: "up", text: height }] };
}

/** How many notes carry each width-hungry modifier (see `VexFlowRenderData.expression`). */
export interface ExpressionCounts {
	bends: number;
	vibratos: number;
	wideVibratos: number;
}

// ─── Brackets ────────────────────────────────────────────────────────────────

export type BracketKind = "palm-mute" | "let-ring";

const BRACKET_OF_SPAN: Partial<Record<SpanKind, BracketKind>> = { palmMute: "palm-mute", letRing: "let-ring" };

/** A slur's segment in the measure: one tie-shaped arc over its numbers (a `TabTie` in `connectors`), the inner link arcs left out. */
export interface SlurSegment {
	fromNoteIndex: number;
	toNoteIndex: number;
	continuesBefore?: boolean;
	continuesAfter?: boolean;
}

/**
 * A dashed bracket over a run of notes: "P.M." for palm mute, "let ring" for
 * let ring. Not a VexFlow modifier — the renderer draws it from the first
 * note's x to the last note's x once the measure is formatted, like rolls.
 * A span that crosses a barline is one bracket per measure: `continuesBefore`
 * says the run began in an earlier measure (the label is repeated only at a
 * row's start), `continuesAfter` that it goes on (no closing tick).
 */
export interface BracketSpan {
	kind: BracketKind;
	/** Index into `notes` of the first and last note under the bracket. */
	fromNoteIndex: number;
	toNoteIndex: number;
	continuesBefore?: boolean;
	continuesAfter?: boolean;
}

/**
 * The measure's segment of every palm-mute / let-ring span, from the pattern
 * index: runs of consecutive slots the span covers, one bracket per run and
 * kind. A grace slot has no note of its own and neither starts nor breaks a
 * run; a rest, an empty slot or an uncovered note ends it.
 */
export function bracketSpans(
	measure: Measure,
	slotNoteIndex: readonly (number | null)[],
	index: PatternIndex,
): BracketSpan[] {
	return spanSegments(measure, slotNoteIndex, index, (kind) => BRACKET_OF_SPAN[kind] !== undefined).map((seg) => ({
		kind: BRACKET_OF_SPAN[seg.spanKind]!,
		fromNoteIndex: seg.fromNoteIndex,
		toNoteIndex: seg.toNoteIndex,
		...(seg.continuesBefore && { continuesBefore: true }),
		...(seg.continuesAfter && { continuesAfter: true }),
	}));
}

/** The measure's slur segments, the same walk as the brackets. */
export function slurSegments(measure: Measure, slotNoteIndex: readonly (number | null)[], index: PatternIndex): SlurSegment[] {
	return spanSegments(measure, slotNoteIndex, index, (kind) => kind === "slur").map((seg) => ({
		fromNoteIndex: seg.fromNoteIndex,
		toNoteIndex: seg.toNoteIndex,
		...(seg.continuesBefore && { continuesBefore: true }),
		...(seg.continuesAfter && { continuesAfter: true }),
	}));
}

interface SpanSegment {
	spanKind: SpanKind;
	fromNoteIndex: number;
	toNoteIndex: number;
	continuesBefore: boolean;
	continuesAfter: boolean;
}

/**
 * Runs of consecutive slots each span of a wanted kind covers, as note
 * indexes: one segment per run and span. A grace slot has no note of its own
 * and neither starts nor breaks a run; a rest, an empty slot or an uncovered
 * note ends it.
 */
function spanSegments(
	measure: Measure,
	slotNoteIndex: readonly (number | null)[],
	index: PatternIndex,
	wanted: (kind: SpanKind) => boolean,
): SpanSegment[] {
	const out: SpanSegment[] = [];
	const spans = measure.slots.length > 0 ? spansTouching(measure, index) : [];
	const inMeasure = new Set(measure.slots.map((slot) => slot.id));
	for (const span of spans) {
		if (!wanted(span.kind)) continue;
		const kind = span.kind;
		const members = index.spanMembers.get(span.id) ?? [];
		const memberSet = new Set(members);
		const firstMember = members[0];
		const lastMember = members[members.length - 1];
		let from: number | null = null;
		let to: number | null = null;
		let continuesBefore = false;
		let continuesAfter = false;
		const close = () => {
			if (from !== null && to !== null) {
				out.push({ spanKind: kind, fromNoteIndex: from, toNoteIndex: to, continuesBefore, continuesAfter });
			}
			from = null;
			to = null;
			continuesBefore = false;
			continuesAfter = false;
		};
		measure.slots.forEach((slot, i) => {
			const noteIndex = slotNoteIndex[i];
			if (noteIndex === null || noteIndex === undefined) return;
			// This span's own coverage (not any span of its kind): its members, on its strings.
			const covered =
				!slot.isRest &&
				memberSet.has(slot.id) &&
				slot.strings.some((sf, stringIndex) => (sf.fret !== null || sf.muted) && (!span.strings || span.strings.includes(stringIndex)));
			if (!covered) {
				close();
				return;
			}
			if (from === null) {
				from = noteIndex;
				continuesBefore = firstMember !== undefined && !inMeasure.has(firstMember);
			}
			to = noteIndex;
			continuesAfter = lastMember !== undefined && !inMeasure.has(lastMember);
		});
		close();
	}
	return out;
}

/** The spans with a member in this measure, in the pattern's order. */
function spansTouching(measure: Measure, index: PatternIndex): PatternIndex["spansByMeasure"][number] {
	const pos = index.slotPos.get(measure.slots[0].id);
	return pos ? (index.spansByMeasure[pos.measure] ?? []) : [];
}

// ─── Marks on a note ──────────────────────────────────────────────────────────

const MARK_FONT = "Geist Mono, monospace";

const above = (text: string): Annotation =>
	new Annotation(text).setVerticalJustification(AnnotationVerticalJustify.TOP);
const aboveMono = (text: string): Annotation => above(text).setFont(MARK_FONT, 10);

/**
 * What each effect draws on its note, in the registry's stacking order. A
 * kind with no entry here draws nothing (its registry `render` flag is false);
 * a bend and the ghost note are handled apart, as they touch the number.
 */
const EFFECT_MARKS: Partial<Record<EffectKind, (note: TabNote, effects: NoteEffects, counts: ExpressionCounts) => void>> = {
	vibrato: (note, effects, counts) => {
		const wide = effects.vibrato?.wide === true;
		if (wide) counts.wideVibratos++;
		else counts.vibratos++;
		// Vibrato's constructor measures its glyph through the canvas API; without
		// one (jsdom / SSR) the mark is skipped — it draws in a browser.
		try {
			const vib = new Vibrato();
			if (wide) vib.setVibratoWidth(40);
			note.addModifier(vib);
		} catch {
			// No canvas context.
		}
	},
	harmonic: (note, effects) => {
		const type = effects.harmonic?.type;
		note.addModifier(aboveMono(type === "natural" ? "N.H." : type === "pinch" ? "P.H." : "A.H."));
	},
	tap: (note) => note.addModifier(aboveMono("T")),
	trill: (note) => note.addModifier(aboveMono("tr~~~")),
	tremolo: (note, effects) => {
		const speed = effects.tremolo?.speed;
		note.addModifier(new Tremolo(speed === "8th" ? 1 : speed === "16th" ? 2 : 3));
	},
	pick: (note, effects) => note.addModifier(above(effects.pick?.direction === "up" ? "V" : "⊓")),
	accent: (note) => note.addModifier(above(">")),
	staccato: (note) => note.addModifier(above(".")),
	whammy: (note, effects, counts) => {
		// "w/bar" over the note; the dashed dive / pull line is the renderer's (`whammies`).
		counts.bends++;
		note.addModifier(aboveMono("w/bar"));
	},
	scrape: (note) => note.addModifier(aboveMono("P.S.")),
};

/** A slide into or out of a note, drawn by the renderer as a short slanted line beside the number. */
export interface SlideMark {
	noteIndex: number;
	stringIndex: number;
	side: "in" | "out";
	/** Where the pitch comes from (in) or goes to (out). */
	direction: "below" | "above";
}

/** A whammy-bar dive or pull: a dashed line from the note at the bar's depth, labelled in semitones. */
export interface WhammyMark {
	noteIndex: number;
	kind: "dive" | "pull";
	label: string;
}

type TieNotes = ConstructorParameters<typeof TabTie>[0];

/** A shift slide: the slanted line without the "sl." a legato slide carries (the target is picked again). */
class ShiftSlide extends TabSlide {
	constructor(notes: TieNotes, direction: number) {
		super(notes, direction);
		this.text = "";
	}
}

/** The connector a link draws from the previous note on its string. */
const LINK_CONNECTORS: Record<LinkKind, (notes: TieNotes, sf: StringFret, prevFret: number | null) => TabTie | TabSlide> = {
	tie: (notes) => new TabTie(notes),
	hammer: (notes) => TabTie.createHammeron(notes),
	pull: (notes) => TabTie.createPulloff(notes),
	slide: (notes, sf, prevFret) => {
		const down = prevFret !== null && sf.fret !== null && sf.fret < prevFret;
		if (sf.link?.kind === "slide" && sf.link.picked) return new ShiftSlide(notes, down ? TabSlide.SLIDE_DOWN : TabSlide.SLIDE_UP);
		return down ? TabSlide.createSlideDown(notes) : TabSlide.createSlideUp(notes);
	},
};

/**
 * Every kind the converter and the stave draw: the links (as connectors or
 * lead-in arcs), the effects with a mark, the spans drawn as brackets and the
 * hits drawn over their column. The registry's `render` flags are tested
 * against this list.
 */
export const RENDER_KINDS: ReadonlySet<string> = new Set([
	...Object.keys(LINK_CONNECTORS),
	"bend",
	"ghost",
	...Object.keys(EFFECT_MARKS),
	"slideIn",
	"slideOut",
	...Object.keys(BRACKET_OF_SPAN),
	"slur",
	"slap",
	"thumbSlap",
	"bodyTap",
]);

/** A hit over a note's column, drawn by the renderer with the registry's letter. */
export interface HitMark {
	noteIndex: number;
	kind: PercussionKind;
	label: string;
}

/** A link into the measure's first note from the note before the barline, drawn as a half arc. */
export interface LeadIn {
	noteIndex: number;
	stringIndex: number;
	kind: LinkKind;
}

/** What the converter needs beyond the measure: where the pattern's spans lie, and what comes before the measure. */
export interface RenderContext {
	index: PatternIndex;
}

export interface VexFlowRenderData {
	notes: StemmableNote[];
	connectors: Array<TabTie | TabSlide>;
	tuplets: Tuplet[];
	chordLabels: ChordLabel[];
	rolls: RollMark[];
	/** Palm-mute and let-ring brackets, drawn by the renderer over their runs. */
	brackets: BracketSpan[];
	/** Hits (slap, thumb slap, body tap), drawn by the renderer over their notes. */
	hits: HitMark[];
	/** Notes whose bend is held into the next note: a dashed line from each to the note after. */
	holds: number[];
	/** Links into the measure's first note from across the barline, drawn as half arcs. */
	leadIns: LeadIn[];
	/** Slides into / out of a note, drawn as short slanted lines beside the number. */
	slideMarks: SlideMark[];
	/** Whammy-bar dives and pulls, drawn as dashed lines from the note. */
	whammies: WhammyMark[];
	/** Notes with a pick scrape: a heavy diagonal across the strings at the note. */
	scrapes: number[];
	/** Slur spans' segments, drawn as one curve each over their notes. */
	slurs: SlurSegment[];
	/**
	 * Notes carrying a pitch-expression modifier drawn beside the number: a bend
	 * arrow with its label, a vibrato squiggle, a wide one. Each needs extra
	 * width that the formatter's own minimum does not include.
	 */
	expression: ExpressionCounts;
	/**
	 * Per note (index-aligned with `notes`), the string each of its positions
	 * was written for, in the order the positions — and so VexFlow's fret-number
	 * elements — are drawn. Empty for rests and silent slots. Lets a renderer
	 * find "the number for string 3 of this note" after the fact.
	 */
	noteStrings: number[][];
	/** Slot index of each note (index-aligned with `notes`); grace slots produce no note. */
	noteSlots: number[];
}

// Pure, deterministic mapping from a Measure to VexFlow note objects.
// No DOM access — VexFlow note constructors are DOM-free.
//
// `context` carries the pattern's index, which says where the spans lie and
// what comes before the measure's first note. Without it (a measure on its
// own: a preview, a test) the measure is read as its own pattern, so only
// the spans it carries itself are known.
export function fingerpickToVexFlow(measure: Measure, context?: RenderContext): VexFlowRenderData {
	const index: PatternIndex =
		context?.index ?? indexPattern({ id: "", name: "", bpm: 0, timeSignature: [4, 4], measures: [measure] });
	const notes: StemmableNote[] = [];
	// posIndexMaps[noteIdx].get(stringIdx) = index in that TabNote's positions array.
	// Indexed parallel to notes[], not to measure.slots[].
	const posIndexMaps: Map<number, number>[] = [];
	// Maps slot index → notes[] index (null for grace-note slots).
	const slotNoteIndex: (number | null)[] = [];
	let pendingGraceNotes: GraceTabNote[] = [];
	const chordLabels: ChordLabel[] = [];
	const rolls: RollMark[] = [];
	const hits: HitMark[] = [];
	const holds: number[] = [];
	const slideMarks: SlideMark[] = [];
	const whammies: WhammyMark[] = [];
	const scrapes: number[] = [];
	const expression: ExpressionCounts = { bends: 0, vibratos: 0, wideVibratos: 0 };
	// A chord marked on a grace-note slot has no note of its own to sit over; it
	// is written at the note the grace resolves into.
	let pendingChord: { slotIndex: number; chord: ChordRef } | null = null;
	const writeChordOver = (noteIdx: number) => {
		if (pendingChord === null) return;
		chordLabels.push({
			noteIndex: noteIdx,
			slotIndex: pendingChord.slotIndex,
			chord: pendingChord.chord,
			label: chordSymbolLabel(pendingChord.chord),
		});
		pendingChord = null;
	};

	for (let slotIdx = 0; slotIdx < measure.slots.length; slotIdx++) {
		const slot = measure.slots[slotIdx];
		const duration = VEX_DURATION[slot.duration];
		if (slot.chord) pendingChord = { slotIndex: slotIdx, chord: slot.chord };

		if (slot.isGraceNote) {
			// Collect as a pending modifier; does not produce a standalone Voice tickable.
			const gracePositions: TabNotePosition[] = [];
			slot.strings.forEach((sf, stringIdx) => {
				if (sf.fret === null && !sf.muted) return;
				const fret: number | string = sf.muted ? "x" : (sf.fret ?? 0);
				gracePositions.push({ str: stringIdx + 1, fret });
			});
			if (gracePositions.length > 0) {
				const gtn = new GraceTabNote({ positions: gracePositions, duration: "8" });
				// GraceTabNote.fontScale = 2/3 exists in VexFlow metrics but
				// TabNote.drawPositions() renders fret text via per-position Element
				// objects typed as 'TabNote.text' — fontScale is never applied there.
				// Scale each fret element's font manually to match the 2/3 intent.
				// GraceTabNote has no stem, so there is no acciaccatura slash to add;
				// GraceNoteGroup's showSlur param handles the optional tie arc only.
				type GtnPrivate = { fretElement: VexElement[]; width: number };
				const priv = gtn as unknown as GtnPrivate;
				priv.fretElement.forEach((el) => el.setFontSize(6));
				priv.width = priv.fretElement.reduce((max, el) => Math.max(max, el.getWidth()), 0);
				pendingGraceNotes.push(gtn);
			}
			slotNoteIndex.push(null);
			continue;
		}

		if (slot.isRest) {
			pendingGraceNotes = [];
			const noteIdx = notes.length;
			if (slot.percussion) hits.push(hitMark(noteIdx, slot.percussion.kind));
			// A rest renders a VISIBLE glyph, not an invisible GhostNote spacer. On a tab
			// stave a StaveNote rest draws the standard rest symbol; the "b/4" key parks it
			// mid-stave. The rest keeps the slot's real duration, so the symbol matches the
			// note value it replaces (VexFlow appends "r" to the duration/dots string, e.g.
			// "8r" for an eighth rest, "qdr" for a dotted-quarter rest).
			notes.push(new StaveNote({ keys: ["b/4"], duration: `${duration}r` }));
			posIndexMaps.push(new Map());
			slotNoteIndex.push(noteIdx);
			writeChordOver(noteIdx);
			continue;
		}

		const positions: TabNotePosition[] = [];
		const posMap = new Map<number, number>();

		slot.strings.forEach((sf, stringIdx) => {
			const isPlayed = sf.fret !== null || sf.muted;
			if (!isPlayed) return;
			posMap.set(stringIdx, positions.length);
			// A ghost note is written in parentheses, a harmonic in angle brackets, a dead one as x.
			const fret: number | string = sf.muted
				? "x"
				: sf.effects?.ghost
					? `(${sf.fret ?? 0})`
					: sf.effects?.harmonic
						? `<${sf.fret ?? 0}>`
						: (sf.fret ?? 0);
			positions.push({ str: stringIdx + 1, fret });
			// Slides into and out of the note belong to the string they are on.
			if (sf.effects?.slideIn) slideMarks.push({ noteIndex: notes.length, stringIndex: stringIdx, side: "in", direction: sf.effects.slideIn.from });
			if (sf.effects?.slideOut) slideMarks.push({ noteIndex: notes.length, stringIndex: stringIdx, side: "out", direction: sf.effects.slideOut.to });
		});

		if (positions.length === 0) {
			pendingGraceNotes = [];
			const noteIdx = notes.length;
			if (slot.percussion) hits.push(hitMark(noteIdx, slot.percussion.kind));
			notes.push(new SilentNote({ duration }));
			posIndexMaps.push(new Map());
			slotNoteIndex.push(noteIdx);
			writeChordOver(noteIdx);
			continue;
		}

		const tabNote = new TabNote({ positions, duration }, true);
		if (pendingGraceNotes.length > 0) {
			tabNote.addModifier(new GraceNoteGroup(pendingGraceNotes));
			pendingGraceNotes = [];
		}

		// The slot's marks: each effect once, whichever of its strings carries it,
		// in the registry's stacking order. A bend draws its arrow phrase and, for
		// a pre-bend, a label; a held bend is also reported for the hold line.
		const effects: NoteEffects = {};
		slot.strings.forEach((sf) => {
			if (sf.fret === null && !sf.muted) return;
			for (const [kind, value] of Object.entries(sf.effects ?? {}) as [EffectKind, NoteEffects[EffectKind]][]) {
				if (value !== undefined && effects[kind] === undefined) (effects as Record<string, unknown>)[kind] = value;
			}
		});
		for (const kind of EFFECT_STACK_ORDER) {
			if (effects[kind] === undefined) continue;
			if (kind === "bend") {
				const mark = bendMarkForEffect(effects.bend!);
				expression.bends++;
				if (effects.bend!.hold) holds.push(notes.length);
				if (mark.preBendLabel) {
					// Right-justified so the label ends at the note and a release arrow
					// drawn to its right does not run through the text.
					tabNote.addModifier(aboveMono(mark.preBendLabel).setJustification(Annotation.HorizontalJustify.RIGHT));
				}
				// Bend's constructor measures its label text through the canvas API, like
				// Vibrato; without one (jsdom / SSR) skip the arrow — it draws in a browser.
				if (mark.phrase.length > 0) {
					try {
						tabNote.addModifier(
							new Bend(mark.phrase.map((p) => ({ type: p.type === "up" ? Bend.UP : Bend.DOWN, text: p.text }))).setFont(MARK_FONT, 10),
						);
					} catch {
						// No canvas context.
					}
				}
				continue;
			}
			EFFECT_MARKS[kind]?.(tabNote, effects, expression);
			if (kind === "whammy") {
				const w = effects.whammy!;
				const semitones = w.semitones ?? WHAMMY_SEMITONES;
				whammies.push({ noteIndex: notes.length, kind: w.kind, label: `${w.kind === "dive" ? "-" : "+"}${semitones}` });
			}
			if (kind === "scrape") scrapes.push(notes.length);
		}
		if (slot.percussion) hits.push(hitMark(notes.length, slot.percussion.kind));

		const noteIdx = notes.length;
		// Slot-level roll (arpeggiated chord): one right-hand action spanning the
		// slot's played strings, gaps included. Drawn by the renderer (see RollMark).
		if (slot.stroke) rolls.push({ noteIndex: noteIdx, stroke: slot.stroke });
		notes.push(tabNote);
		posIndexMaps.push(posMap);
		slotNoteIndex.push(noteIdx);
		writeChordOver(noteIdx);
	}

	const connectors: Array<TabTie | TabSlide> = [];
	const leadIns: LeadIn[] = [];

	// A link on the measure's first note reaches back across the barline: there
	// is no note here to tie it to, so the renderer draws a half arc into it.
	const firstNoteSlot = measure.slots.findIndex((slot, i) => !slot.isRest && !slot.isGraceNote && slotNoteIndex[i] !== null);
	if (firstNoteSlot >= 0 && context) {
		const slot = measure.slots[firstNoteSlot];
		const at = index.slotOrder.indexOf(slot.id);
		const before = at > 0 && !measure.slots.some((s) => s.id === index.slotOrder[at - 1]);
		const noteIdx = slotNoteIndex[firstNoteSlot];
		if (before && noteIdx !== null && noteIdx !== undefined) {
			slot.strings.forEach((sf, stringIndex) => {
				if (sf.link && (sf.fret !== null || sf.muted) && posIndexMaps[noteIdx].has(stringIndex)) {
					leadIns.push({ noteIndex: noteIdx, stringIndex, kind: sf.link.kind });
				}
			});
		}
	}

	for (let i = 1; i < measure.slots.length; i++) {
		const slot = measure.slots[i];
		if (slot.isRest || slot.isGraceNote) continue;

		const currNoteIdx = slotNoteIndex[i];
		if (currNoteIdx === null || currNoteIdx === undefined) continue;

		// Walk back to find the nearest preceding non-grace slot.
		let prevSlotIdx = i - 1;
		while (prevSlotIdx >= 0 && slotNoteIndex[prevSlotIdx] === null) prevSlotIdx--;
		if (prevSlotIdx < 0) continue;
		const prevNoteIdx = slotNoteIndex[prevSlotIdx];
		if (prevNoteIdx === null || prevNoteIdx === undefined) continue;

		const prevNote = notes[prevNoteIdx];
		const currNote = notes[currNoteIdx];
		const prevPosMap = posIndexMaps[prevNoteIdx];
		const currPosMap = posIndexMaps[currNoteIdx];

		slot.strings.forEach((sf, stringIdx) => {
			if (!sf.link || (sf.fret === null && !sf.muted)) return;
			// Inside a slur the curve says legato: a hammer or pull draws no arc of its own.
			if ((sf.link.kind === "hammer" || sf.link.kind === "pull") && slurredInside(index, slot.id, stringIdx)) return;

			const prevIdx = prevPosMap.get(stringIdx);
			const currIdx = currPosMap.get(stringIdx);
			if (prevIdx === undefined || currIdx === undefined) return;

			const tieNotes: TieNotes = {
				firstNote: prevNote,
				lastNote: currNote,
				firstIndexes: [prevIdx],
				lastIndexes: [currIdx],
			};
			const prevFret = measure.slots[prevSlotIdx].strings[stringIdx].fret;
			connectors.push(LINK_CONNECTORS[sf.link.kind](tieNotes, sf, prevFret));
		});
	}

	// A slur: one arc over the numbers from the segment's first note to its
	// last, drawn the way a tie is — between the positions, inside the tab —
	// on the highest string the span covers at each end. A segment that runs
	// on past the barline (or in from before it) is tied to the stave's edge,
	// which is how VexFlow draws a tie with one note missing.
	const slurs = slurSegments(measure, slotNoteIndex, index);
	for (const seg of slurs) {
		const span = spansTouching(measure, index).find((s) => s.kind === "slur");
		const onSpan = (stringIdx: number) => !span?.strings || span.strings.includes(stringIdx);
		const topPosition = (noteIdx: number): number | undefined => {
			const posMap = posIndexMaps[noteIdx];
			const strings = [...posMap.keys()].filter(onSpan).sort((a, b) => a - b);
			return strings.length > 0 ? posMap.get(strings[0]) : undefined;
		};
		const fromPos = topPosition(seg.fromNoteIndex);
		const toPos = topPosition(seg.toNoteIndex);
		if (fromPos === undefined || toPos === undefined) continue;
		const single = seg.fromNoteIndex === seg.toNoteIndex;
		if (single && !seg.continuesBefore && !seg.continuesAfter) continue;
		const tie = new TabTie({
			firstNote: single && seg.continuesBefore ? undefined : notes[seg.fromNoteIndex],
			lastNote: single && !seg.continuesBefore ? undefined : notes[seg.toNoteIndex],
			firstIndexes: [fromPos],
			lastIndexes: [toPos],
		});
		// A tie's arc is drawn for two neighbours; a slur over a run rises with
		// its length, or it reads as a line along the numbers.
		const reach = Math.max(1, seg.toNoteIndex - seg.fromNoteIndex);
		tie.renderOptions.cp1 = 9 + 3 * reach;
		tie.renderOptions.cp2 = 11 + 4 * reach;
		connectors.push(tie);
	}

	// One Tuplet per triplet group — the same grouping the editor brackets and
	// edits by (`tripletGroups`), so the stave and the grid never disagree on
	// which three notes belong together. The Tuplet adjusts tick values so the
	// Formatter spaces the measure correctly and draws the bracket above the staff.
	const tuplets: Tuplet[] = [];
	for (const group of tripletGroups(measure.slots)) {
		const notesInGroup: StemmableNote[] = [];
		for (let k = group.start; k < group.start + TRIPLET_GROUP_SIZE; k++) {
			const noteIdx = slotNoteIndex[k];
			if (noteIdx !== null && noteIdx !== undefined) notesInGroup.push(notes[noteIdx]);
		}
		if (notesInGroup.length === TRIPLET_GROUP_SIZE) tuplets.push(new Tuplet(notesInGroup));
	}

	const noteStrings = posIndexMaps.map((posMap) =>
		[...posMap.entries()].sort((a, b) => a[1] - b[1]).map(([stringIdx]) => stringIdx),
	);
	const noteSlots = slotNoteIndex.flatMap((noteIdx, slotIdx) =>
		noteIdx === null ? [] : [slotIdx],
	);
	return {
		notes,
		connectors,
		tuplets,
		chordLabels,
		rolls,
		brackets: bracketSpans(measure, slotNoteIndex, index),
		hits,
		holds,
		leadIns,
		slideMarks,
		whammies,
		scrapes,
		slurs,
		expression,
		noteStrings,
		noteSlots,
	};
}

function hitMark(noteIndex: number, kind: PercussionKind): HitMark {
	return { noteIndex, kind, label: techniqueDef(kind)?.ascii?.above ?? techniqueDef(kind)?.glyph ?? "" };
}
