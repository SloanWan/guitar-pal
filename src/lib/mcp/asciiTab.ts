import type { BeatSlot, FingerpickPattern, NoteEffects } from "@/lib/fingerpickTypes";
import { DURATION_TICKS } from "@/lib/fingerpickEdit";
import { indexPattern, spanCovers, type PatternIndex } from "@/lib/fingerpickIndex";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { EFFECT_STACK_ORDER, SPAN_DEFS, techniqueDef } from "@/lib/techniqueRegistry";

/**
 * A pattern written out as ASCII tab, for the model to read back (#308).
 *
 * This is a preview, not a storage format: it is what a tool result shows so
 * the model can check what the app made of its draft, and what `read_share`
 * hands back alongside the structured bars. Column width follows duration —
 * a slot gets two characters per shortest note value in the pattern, so an
 * eighth is twice as wide as a sixteenth — which is the convention a pasted
 * tab's spacing reading assumes, and what a reader's eye expects.
 *
 * The marks are the technique registry's: a link's mark before the fret
 * (`h7`), an effect's after it (`7~`, `7tr`), a tie as `(7)`, a bend as tab
 * writes it (`7b9`), a span as a labelled line below the strings and a hit
 * as its letter on a line above.
 */

/** String letters, index 0 = high e, as the editor holds them. */
const STRING_LETTERS = ["e", "B", "G", "D", "A", "E"] as const;

/** Widest a slot is written, whatever its duration: a whole note over 32nds would otherwise run 64 columns. */
const MAX_SLOT_WIDTH = 16;
const MIN_SLOT_WIDTH = 2;

/** The spans the writer draws as lines below, in the registry's order. */
const BRACKET_KINDS = SPAN_DEFS.filter((def) => def.ascii?.line).map((def) => ({
	kind: def.kind as "palmMute" | "letRing" | "slur",
	label: def.ascii!.line!,
}));

function shortestTicks(pattern: FingerpickPattern): number {
	let shortest = DURATION_TICKS.whole;
	for (const measure of pattern.measures) {
		for (const slot of measure.slots) shortest = Math.min(shortest, DURATION_TICKS[slot.duration]);
	}
	return shortest;
}

/**
 * A bend after its fret, the way tab writes it: `7b9` bends fret 7 up to the
 * pitch of 9, `7b8r` lets it back down, `7pb9` is bent before the pick, and
 * a quarter bend has no fret to name so it is written `b¼`.
 */
function bendText(bend: NonNullable<NoteEffects["bend"]>, fret: number): string {
	const target = bend.semitones === 0.5 ? "¼" : String(fret + Math.round(bend.semitones));
	return `${bend.pre ? "pb" : "b"}${target}${bend.release ? "r" : ""}`;
}

/** What one string shows in one slot: the fret with its marks, or nothing. */
function noteText(s: BeatSlot["strings"][number], isRest: boolean | undefined): string {
	if (isRest || s.fret === null) return s.muted && !isRest ? "x" : "";
	if (s.muted) return "x";
	let before = "";
	let fret = String(s.fret);
	if (s.link?.kind === "tie") fret = `(${s.fret})`;
	else if (s.link) before = techniqueDef(s.link.kind)?.ascii?.before ?? "";
	let after = "";
	const effects = s.effects ?? {};
	for (const kind of EFFECT_STACK_ORDER) {
		const value = effects[kind];
		if (value === undefined) continue;
		if (kind === "bend") after += bendText(effects.bend!, s.fret);
		else if (kind === "vibrato") after += effects.vibrato!.wide ? "~~" : "~";
		else {
			const marks = techniqueDef(kind)?.ascii;
			if (marks?.before) before += marks.before;
			else if (marks?.after) after += marks.after;
		}
	}
	return `${before}${fret}${after}`;
}

/** Whether any played string in the slot is under a span of this kind. */
function slotUnder(index: PatternIndex, slot: BeatSlot, kind: "palmMute" | "letRing" | "slur"): boolean {
	return !slot.isRest && slot.strings.some((s, i) => s.fret !== null && spanCovers(index, slot.id, kind, i));
}

function pad(text: string, width: number): string {
	return text + "-".repeat(Math.max(0, width - text.length));
}

function padSpace(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - text.length));
}

/**
 * Six lines, high e first, `|` between bars — plus a chord line above when any
 * slot carries a chord mark, a hit line above when any slot is slapped or
 * tapped (the registry's letter over the column), and a `P.M.` / `let ring`
 * line below for the brackets, each run written as its label and dashes to
 * the run's end. Every string line has the same length, so the text keeps the
 * rhythm when read in a mono font.
 */
export function patternToAsciiTab(pattern: FingerpickPattern): string {
	const unit = shortestTicks(pattern);
	const index = indexPattern(pattern);
	const lines: string[] = STRING_LETTERS.map((letter) => `${letter}|`);
	let chordLine = "  ";
	let anyChord = false;
	let hitLine = "  ";
	let anyHit = false;
	const brackets = BRACKET_KINDS.map((b) => ({ ...b, line: "  ", any: false, inRun: false }));

	for (const measure of pattern.measures) {
		for (const slot of measure.slots) {
			const texts = slot.strings.map((s) => noteText(s, slot.isRest));
			const chord = slot.chord ? chordAbbreviation(slot.chord) : "";
			if (chord) anyChord = true;
			const hit = slot.percussion ? (techniqueDef(slot.percussion.kind)?.ascii?.above ?? "") : "";
			if (hit) anyHit = true;
			const byDuration = Math.round(DURATION_TICKS[slot.duration] / unit) * MIN_SLOT_WIDTH;
			// A bracket label starting here must fit its column too.
			const labelWidths = brackets.map((b) => (slotUnder(index, slot, b.kind) && !b.inRun ? b.label.length : 0));
			const widest = Math.max(...texts.map((t) => t.length), chord.length, hit.length, ...labelWidths) + 1;
			const width = Math.max(MIN_SLOT_WIDTH, Math.min(MAX_SLOT_WIDTH, byDuration), widest);
			texts.forEach((t, i) => {
				lines[i] += pad(t, width);
			});
			chordLine += padSpace(chord, width);
			hitLine += padSpace(hit, width);
			for (const b of brackets) {
				const has = slotUnder(index, slot, b.kind);
				if (has) {
					b.any = true;
					b.line += b.inRun ? "-".repeat(width) : pad(b.label, width);
				} else {
					b.line += " ".repeat(width);
				}
				b.inRun = has;
			}
		}
		lines.forEach((_, i) => {
			lines[i] += "|";
		});
		chordLine += " ";
		hitLine += " ";
		for (const b of brackets) {
			b.line += " ";
			b.inRun = false;
		}
	}

	const above = [...(anyChord ? [chordLine.trimEnd()] : []), ...(anyHit ? [hitLine.trimEnd()] : [])];
	const below = brackets.filter((b) => b.any).map((b) => b.line.trimEnd());
	return [...above, ...lines, ...below].join("\n");
}
