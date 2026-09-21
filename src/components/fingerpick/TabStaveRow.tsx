"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Renderer, TabStave, Voice, Formatter, Beam, Barline, StemmableNote } from "vexflow";

import { Measure } from "@/lib/fingerpickTypes";
import {
	beamGroupsFor,
	fingerpickToVexFlow,
	type ChordLabel,
	type RollMark,
} from "@/lib/fingerpickToVexFlow";
import { isBrush, strokeDirection, type Stroke } from "@/lib/fingerpickTypes";
import { slotPitchLabels, splitPitchLabel, type SlotPitchLabel } from "@/lib/fingerpickPitch";

// Layout constants — not props because they are fixed design decisions, not data.
// CLEF_WIDTH: the left offset that gives the "TAB" clef glyph room (~30 px needed).
export const CLEF_WIDTH = 15;
// A stable default so the effect does not re-run for callers that pass no meter.
const DEFAULT_TIME_SIGNATURE: [number, number] = [4, 4];
// Extra pixels appended to svgWidth so the 1px end-barline stroke is not clipped at the SVG boundary.
const BARLINE_CLIP_MARGIN = 3;
const RIGHT_PAD = 15;
const SVG_HEIGHT = 200;
const STAVE_Y = 10;
// Baseline of a chord symbol above the stave's top line — the line the measure
// number sits on, which the stave already leaves room for (the number is at the
// barline, the symbol over a note, so the two never meet).
const CHORD_BASELINE_OFFSET = 14;
const CHORD_FONT = {
	family: '"JetBrains Mono", ui-monospace, monospace',
	size: "11pt",
	weight: "bold",
};
// Room a chord symbol needs over its note so two changes in one measure don't collide.
const CHORD_LABEL_EXTRA_WIDTH = 28;
// The chord line's shape view: a shape strip sits over each symbol, placed from
// the symbol's baseline upwards. The stave already leaves room above its top
// line (VexFlow's space-above-staff); headroom is added only for what a strip
// needs beyond that.
// Air between the strip's bottom edge and the symbol's cap height.
const CHORD_DIAGRAM_GAP = 15;
// The symbol's own height above its baseline, cleared before the strip starts.
const CHORD_SYMBOL_HEIGHT = 12;
// Air kept above the strip so it never touches the row's top edge.
const CHORD_DIAGRAM_TOP_PAD = 4;
// Least air between two chord symbols on the line; a later symbol is pushed
// right of the one before it rather than drawn over it.
const CHORD_LABEL_GAP = 6;
// Shapes that would overlap stack into lanes above one another instead of
// being pushed off their notes — a shape has to sit where its chord starts.
const CHORD_DIAGRAM_LANE_GAP = 4;
const CHORD_DIAGRAM_MAX_LANES = 3;
const TAB_GLYPH_WIDTH = 40;
const TECHNIQUE_CONNECTOR_PAD = 20;
const MIN_MEASURE_WIDTH = 120;
const HO_PO_EXTRA_WIDTH = 25;
// Extra room for a repeat-begin (|:) / repeat-end (:|) barline's thick line + dots.
const REPEAT_BARLINE_EXTRA_WIDTH = 14;
// A roll arrow sits left of its note; a slot needs this much more so it never
// runs into the previous note's numbers.
const ROLL_EXTRA_WIDTH = 10;
// Roll arrow geometry: how far left of the fret numbers it sits, the wave's
// half-width and wavelength, and the arrowhead's size.
const ROLL_X_OFFSET = 8;
const ROLL_AMPLITUDE = 1.6;
const ROLL_WAVELENGTH = 6;
const ROLL_HEAD = 4;
// The pitch column: the sounding pitch written under each note, one label per
// played string, stacked top → bottom in string order like the stave. It sits
// under the stems and beams (which reach ~42 px below the bottom line), so the
// first baseline is this far below the stave's bottom line.
const PITCH_FIRST_BASELINE = 54;
const PITCH_LINE_HEIGHT = 11;
// Jianpu octave dots sit over and under the digit, so a row that has any
// starts lower (the top dots clear the beams), is set with taller lines, and
// keeps more air under its last one.
const PITCH_FIRST_BASELINE_DOTTED = 64;
const PITCH_LINE_HEIGHT_DOTTED = 17;
const PITCH_DOT_RADIUS = 1.1;
// First dot's distance from the digit (cap height above the baseline, the
// baseline itself below), and the pitch between stacked dots.
const PITCH_DOT_GAP = 3;
const PITCH_DOT_PITCH = 3.2;
const PITCH_DIGIT_CAP_HEIGHT = 8;
const PITCH_FONT = {
	family: '"JetBrains Mono", ui-monospace, monospace',
	size: "8pt",
};
// A mono glyph at 8pt is 0.6 em of 10.67 px; the layout has no canvas to ask.
const PITCH_LABEL_CHAR_WIDTH = 6.4;
// Least air between two neighbouring labels.
const PITCH_LABEL_GAP = 6;
// Descender and air under the last label, so the column never touches the row below.
const PITCH_BOTTOM_PAD = 6;
const PITCH_BOTTOM_PAD_DOTTED = 12;

interface TabStaveRowProps {
	/** One "row" worth of measures rendered into a single VexFlow context. */
	measures: Measure[];
	/** The pattern's meter: sets the voice and how eighths beam (by quarter, or by dotted quarter in 6/8). Default 4/4. */
	timeSignature?: [number, number];
	/** Measure number for the first measure in this row (1-indexed). */
	startMeasureNumber?: number;
	/** 0-indexed global measure index for this row's first measure; enables cursor data attributes. */
	startMeasureIndex?: number;
	/** Per-measure stave widths in the same order as `measures`, computed by the greedy layout pass. */
	measureWidths: number[];
	/**
	 * Draw a shape over each chord symbol. Called for every chord mark in the
	 * row once the notes are placed, with the mark's measure (row-local index
	 * plus `startMeasureIndex`) and slot; whatever it returns is laid over the
	 * stave at the symbol's x. Given, the stave leaves headroom for it.
	 */
	chordDiagram?: (label: ChordLabel & { measureIndex: number }) => ReactNode;
	/** Rendered size of what `chordDiagram` draws, so the stave can reserve room for it. */
	chordDiagramSize?: { width: number; height: number };
	/**
	 * Strings whose fret number at a slot should be coloured as "outside the
	 * chord shape" (fingerpick order, 0 = high e). Called per note once drawn;
	 * the numbers are recoloured in place after the theme pass.
	 */
	offShapeStrings?: (measureIndex: number, slotIndex: number) => readonly number[];
	/**
	 * Write the sounding pitch under every played fret: given a string
	 * (fingerpick order, 0 = high e) and its written fret, the label to draw.
	 * Given, the stave grows footroom for the column.
	 */
	pitchLabel?: (stringIndex: number, fret: number) => string;
}

/** Where a chord mark landed after formatting, for the diagram overlay. */
interface ChordAnchor {
	key: string;
	x: number;
	/** Top edge of the diagram, in the SVG's (= the wrapper's) pixel space. */
	y: number;
	label: ChordLabel & { measureIndex: number };
}

/** A chord symbol placed on the line, before overlap is resolved. */
interface PlacedLabel {
	label: ChordLabel;
	measureIndex: number | undefined;
	/** The note's x — where the symbol wants to be. */
	noteX: number;
	/** Where it ends up after being pushed clear of the one before. */
	x: number;
	width: number;
	/** The shape's left edge — the note's x, unless the row's edge is nearer. */
	diagramX: number;
	/** Which stacking lane the shape (if any) goes in; 0 is the lowest. */
	lane: number;
}

/**
 * Resolve overlaps on one row's chord line. Symbols are pushed right just far
 * enough to clear the previous one; shapes, which must stay over their notes,
 * are assigned lanes greedily — the lowest lane whose last shape they clear.
 * Returns the number of lanes used, so the caller can make room for them.
 */
function layoutChordLine(labels: PlacedLabel[], diagramWidth: number, rightLimit: number): number {
	labels.sort((a, b) => a.noteX - b.noteX);
	let prevRight = -Infinity;
	const laneRight: number[] = [];
	for (const item of labels) {
		item.x = Math.max(item.noteX, prevRight + CHORD_LABEL_GAP);
		prevRight = item.x + item.width;
		if (diagramWidth > 0) {
			// Shapes stay over their notes, pulled in only at the row's right edge.
			item.diagramX = Math.min(item.noteX, rightLimit - diagramWidth);
			let lane = laneRight.findIndex((right) => right + CHORD_DIAGRAM_LANE_GAP <= item.diagramX);
			if (lane === -1) lane = Math.min(laneRight.length, CHORD_DIAGRAM_MAX_LANES - 1);
			item.lane = lane;
			laneRight[lane] = item.diagramX + diagramWidth;
		}
	}
	// Nothing may run off the row's right edge: pull the tail back in, each
	// symbol keeping its gap from the one after it.
	let nextLeft = rightLimit;
	for (let i = labels.length - 1; i >= 0; i--) {
		const item = labels[i];
		item.x = Math.min(item.x, nextLeft - item.width);
		nextLeft = item.x - CHORD_LABEL_GAP;
	}
	return diagramWidth > 0 ? Math.max(1, laneRight.length) : 0;
}

// VexFlow's SVG backend emits colors as literal presentation attributes
// (black stave lines/fret numbers, a white occlusion patch behind each fret
// number) inherited from the root <svg>'s fill="black"/stroke="black" — it has
// no theme awareness. This walks the finished render and overwrites those
// attributes with theme-aware custom properties, per the design system's
// .sline/.fnum/.clef/.tech/.tech-arc token map. Runs after every draw() call;
// never touches note construction, layout, or the data-* cursor attributes.
function applyStaveTheme(svgEl: SVGSVGElement): void {
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stave > path").forEach((el) => {
		el.setAttribute("stroke", "var(--line-strong)");
	});
	svgEl.querySelectorAll<SVGRectElement>("g.vf-stavebarline > rect").forEach((el) => {
		el.setAttribute("fill", "var(--line-strong)");
	});
	// Repeat barlines (|: / :|) draw their dots as filled <path>/<circle> elements inside
	// the barline group — hardcoded black by VexFlow. Track theme so they show in dark mode.
	svgEl
		.querySelectorAll<SVGElement>("g.vf-stavebarline path, g.vf-stavebarline circle")
		.forEach((el) => el.setAttribute("fill", "var(--line-strong)"));
	svgEl.querySelectorAll<SVGTextElement>("g.vf-clef text").forEach((el) => {
		el.setAttribute("fill", "var(--ink-faint)");
	});
	svgEl.querySelectorAll<SVGGElement>("g.vf-tabnote").forEach((noteGroup) => {
		// A fret number masks the stave line through it with a halo hugging its
		// own strokes, not with VexFlow's white box behind it: the box is a
		// surface-coloured square, and anything drawn behind the stave — the
		// playhead and its glow — shows it as a pale patch while passing under.
		// The halo hides only the line where the glyph is, and stays invisible
		// on its own because it is the surface's colour.
		noteGroup.querySelectorAll("text").forEach((el) => {
			el.setAttribute("fill", "var(--ink)");
			el.setAttribute("stroke", "var(--workspace-bg)");
			el.setAttribute("stroke-width", "3");
			el.setAttribute("stroke-linejoin", "round");
			el.setAttribute("paint-order", "stroke fill");
		});
		noteGroup.querySelectorAll("rect").forEach((el) => el.setAttribute("fill", "none"));
	});
	// Chord symbols on the chord line — written by this component, grouped so they
	// can carry the brand colour rather than the plain-text ink.
	svgEl.querySelectorAll<SVGTextElement>("g.vf-chord-label text").forEach((el) => {
		el.setAttribute("fill", "var(--denim-accent)");
	});
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stem path").forEach((el) => {
		el.setAttribute("stroke", "var(--ink)");
	});
	// Rest glyphs are StaveNotes (g.vf-stavenote), not tabnotes; VexFlow draws the rest
	// as a path with hardcoded black fill. Track theme ink so rests stay visible in dark
	// mode (and match fret-number ink in light mode).
	svgEl
		.querySelectorAll<SVGElement>("g.vf-stavenote path, g.vf-stavenote text")
		.forEach((el) => el.setAttribute("fill", "var(--ink)"));
	svgEl.querySelectorAll<SVGPathElement>("g.vf-beam path").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	svgEl.querySelectorAll<SVGTextElement>("g.vf-tuplet text").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	// Tie / hammer-on / pull-off connectors: closed filled arc shapes (stroke: none).
	svgEl.querySelectorAll<SVGPathElement>("g.vf-stavetie path").forEach((el) => {
		el.setAttribute("fill", "var(--ink)");
	});
	// Slide connectors and measure-number/technique-annotation text are all
	// emitted as bare elements directly under <svg> (VexFlow opens no group
	// for them). Slides are the only ungrouped <path fill="none">; technique
	// letters (H/P/sl./staccato/accent/…) are ungrouped <text> without a
	// local font-size, while measure numbers (TabStave.setMeasure) are
	// ungrouped <text> at the fixed 8pt VexFlow uses for that label.
	Array.from(svgEl.children).forEach((child) => {
		if (child.tagName === "path" && child.getAttribute("fill") === "none") {
			child.setAttribute("stroke", "var(--ink)");
		} else if (child.tagName === "text") {
			const isMeasureNumber = child.getAttribute("font-size") === "8pt";
			child.setAttribute("fill", isMeasureNumber ? "var(--ink-faint)" : "var(--ink)");
		}
	});
}

/** The width a pitch label takes on the stave, for the layout pass (no canvas there). */
export function pitchLabelWidth(text: string): number {
	return splitPitchLabel(text).base.length * PITCH_LABEL_CHAR_WIDTH;
}

// No DOM side-effects — Formatter.preCalculateMinTotalWidth operates on Tickable objects only.
export function computeMeasureMinWidth(
	notes: StemmableNote[],
	isFirstInRow: boolean,
	techniqueCount: number,
	repeatBarlineCount: number = 0,
	chordLabelCount: number = 0,
	/** Width of the shape drawn over each symbol in the shape view; 0 = names only. */
	chordDiagramWidth: number = 0,
	rollCount: number = 0,
	/** Per note, the widest pitch label under it (px, `pitchLabelWidth`); empty when the column is off. */
	pitchLabelWidths: readonly number[] = [],
): number {
	const voice = new Voice({ numBeats: 4, beatValue: 4 }).setMode(Voice.Mode.SOFT);
	voice.addTickables(notes);
	const notesWidth = new Formatter().preCalculateMinTotalWidth([voice]);
	const raw =
		(isFirstInRow ? TAB_GLYPH_WIDTH : 0) +
		notesWidth +
		TECHNIQUE_CONNECTOR_PAD +
		techniqueCount * HO_PO_EXTRA_WIDTH +
		repeatBarlineCount * REPEAT_BARLINE_EXTRA_WIDTH +
		// Shapes stack into lanes rather than spreading out, so a shape needs only
		// enough room for a third of its width per change (three lanes).
		chordLabelCount * Math.max(CHORD_LABEL_EXTRA_WIDTH, Math.ceil(chordDiagramWidth / 3) + 4) +
		rollCount * ROLL_EXTRA_WIDTH +
		pitchLabelExtraWidth(notesWidth, notes.length, pitchLabelWidths) +
		RIGHT_PAD;
	return Math.max(MIN_MEASURE_WIDTH, raw);
}

/**
 * How much wider a measure has to be for its pitch labels not to collide. At
 * the minimum width a note gets its share of `notesWidth` (VexFlow's own
 * measure); a label wider than that, plus its gap, is a shortfall. Width added
 * to a measure is then shared out by the formatter over every note in it,
 * labelled or not, so the shortfall is scaled up by that share to land where
 * it is needed — dense sixteenths in a three-character style stay legible.
 */
function pitchLabelExtraWidth(
	notesWidth: number,
	noteCount: number,
	pitchLabelWidths: readonly number[],
): number {
	if (noteCount === 0) return 0;
	const noteOwnWidth = notesWidth / noteCount;
	let labelled = 0;
	let shortfall = 0;
	for (const w of pitchLabelWidths) {
		if (w <= 0) continue;
		labelled++;
		shortfall += Math.max(0, w + PITCH_LABEL_GAP - noteOwnWidth);
	}
	return labelled > 0 ? (shortfall * noteCount) / labelled : 0;
}

/**
 * Write a note's pitch labels under the stave, centred on the note's x like
 * its fret numbers, one line per string from the top. Raw SVG rather than a
 * VexFlow `Annotation`: an annotation's y rides on the note's own strings, so
 * a low-string note would put its label somewhere else than a high-string
 * one, and `GhostNote` skips modifiers altogether.
 */
function drawPitchColumn(
	svgEl: SVGSVGElement,
	x: number,
	firstBaseline: number,
	lineHeight: number,
	labels: readonly SlotPitchLabel[],
): void {
	const ns = "http://www.w3.org/2000/svg";
	const g = document.createElementNS(ns, "g");
	g.setAttribute("class", "vf-pitch");
	labels.forEach((label, i) => {
		const baseline = firstBaseline + i * lineHeight;
		// A held string's label is fainter, as its fret number is.
		const fill = label.tied ? "var(--ink-faint)" : "var(--ink-dim)";
		const { base, dotsAbove, dotsBelow } = splitPitchLabel(label.text);
		const text = document.createElementNS(ns, "text");
		text.setAttribute("x", String(x));
		text.setAttribute("y", String(baseline));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("font-family", PITCH_FONT.family);
		text.setAttribute("font-size", PITCH_FONT.size);
		text.setAttribute("fill", fill);
		text.textContent = base;
		g.appendChild(text);
		// Jianpu octave dots, drawn as circles rather than left to the font: a
		// mono face has no combining marks to speak of, and the dots have to
		// stack. They sit over the digit itself, not over an accidental.
		const digitX = x + ((base.length - 1) * PITCH_LABEL_CHAR_WIDTH) / 2;
		const dot = (cy: number) => {
			const c = document.createElementNS(ns, "circle");
			c.setAttribute("cx", String(digitX));
			c.setAttribute("cy", String(cy));
			c.setAttribute("r", String(PITCH_DOT_RADIUS));
			c.setAttribute("fill", fill);
			g.appendChild(c);
		};
		for (let k = 0; k < dotsAbove; k++) {
			dot(baseline - PITCH_DIGIT_CAP_HEIGHT - PITCH_DOT_GAP - k * PITCH_DOT_PITCH);
		}
		for (let k = 0; k < dotsBelow; k++) {
			dot(baseline + PITCH_DOT_GAP + k * PITCH_DOT_PITCH);
		}
	});
	svgEl.appendChild(g);
}

/**
 * Draw a stroke arrow beside a note, from the note's first played string to its
 * last, with the arrowhead at the end the hand travels towards: a wave for a
 * roll, a straight line for a brush (the notation's slow / fast pair). An arrow
 * pointing up reads low → high pitch, which is our "*-down". Exactly the played
 * span — no half-line padding, no glyph rounding — so it never reaches a string
 * the slot does not play.
 */
function drawRoll(
	svgEl: SVGSVGElement,
	x: number,
	yTop: number,
	yBottom: number,
	stroke: Stroke,
): void {
	const ns = "http://www.w3.org/2000/svg";
	const g = document.createElementNS(ns, "g");
	g.setAttribute("class", "vf-roll");
	const headAtTop = strokeDirection(stroke) === "down";
	// Leave the arrowhead's own height out of the shaft so the tip lands on the line.
	const shaftTop = headAtTop ? yTop + ROLL_HEAD : yTop;
	const shaftBottom = headAtTop ? yBottom : yBottom - ROLL_HEAD;
	let d = `M ${x} ${shaftTop}`;
	if (isBrush(stroke)) {
		d += ` L ${x} ${shaftBottom}`;
	} else {
		let y = shaftTop;
		let side = 1;
		while (y < shaftBottom) {
			const nextY = Math.min(shaftBottom, y + ROLL_WAVELENGTH / 2);
			d += ` Q ${x + side * ROLL_AMPLITUDE * 2} ${(y + nextY) / 2} ${x} ${nextY}`;
			y = nextY;
			side = -side;
		}
	}
	const shaft = document.createElementNS(ns, "path");
	shaft.setAttribute("d", d);
	shaft.setAttribute("fill", "none");
	shaft.setAttribute("stroke", "var(--ink)");
	shaft.setAttribute("stroke-width", isBrush(stroke) ? "1.4" : "1");
	g.appendChild(shaft);
	const head = document.createElementNS(ns, "path");
	const tipY = headAtTop ? yTop : yBottom;
	const baseY = headAtTop ? yTop + ROLL_HEAD : yBottom - ROLL_HEAD;
	head.setAttribute("d", `M ${x} ${tipY} L ${x - ROLL_HEAD / 2 - 0.5} ${baseY} L ${x + ROLL_HEAD / 2 + 0.5} ${baseY} Z`);
	head.setAttribute("fill", "var(--ink)");
	g.appendChild(head);
	svgEl.appendChild(g);
}

export default function TabStaveRow({
	measures,
	timeSignature = DEFAULT_TIME_SIGNATURE,
	startMeasureNumber,
	startMeasureIndex,
	measureWidths,
	chordDiagram,
	chordDiagramSize,
	offShapeStrings,
	pitchLabel,
}: TabStaveRowProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [anchors, setAnchors] = useState<ChordAnchor[]>([]);
	const showDiagrams = chordDiagram !== undefined;
	const diagramHeight = showDiagrams ? (chordDiagramSize?.height ?? 0) : 0;

	useEffect(() => {
		const div = containerRef.current;
		if (!div || measures.length === 0 || measureWidths.length === 0) return;

		let rafId: number | undefined;
		let cancelled = false;

		// `lanes` is how many shape lanes to leave room for; the first pass
		// assumes one and re-renders if the chord line turns out to need more.
		const renderToWidth = (lanes = 1) => {
			if (cancelled) return;
			div.innerHTML = "";

			// SVG width = CLEF_WIDTH + stave content + margin so the end-barline isn't clipped.
			const svgWidth =
				CLEF_WIDTH + measureWidths.reduce((a, b) => a + b, 0) + BARLINE_CLIP_MARGIN;

			// Room above the stave's top line that VexFlow gives for free, against
			// what the strips, their gap and the symbol need; the shortfall is headroom.
			const freeAbove =
				new TabStave(0, 0, 100).getYForLine(0) + STAVE_Y - CHORD_BASELINE_OFFSET;
			const stackHeight = diagramHeight * lanes + CHORD_DIAGRAM_LANE_GAP * (lanes - 1);
			const wanted =
				stackHeight + CHORD_DIAGRAM_GAP + CHORD_SYMBOL_HEIGHT + CHORD_DIAGRAM_TOP_PAD;
			const headroom = showDiagrams ? Math.max(0, wanted - freeAbove) : 0;
			const staveY = STAVE_Y + headroom;
			// Footroom for the pitch column: the tallest stack in the row sets how
			// far past the stave's usual bottom the SVG has to reach.
			const pitchStacks = pitchLabel
				? measures.map((m) => m.slots.map((slot) => slotPitchLabels(slot, pitchLabel)))
				: [];
			const rowLabels = pitchStacks.flat();
			const tallestStack = Math.max(0, ...rowLabels.map((labels) => labels.length));
			const dotted = rowLabels.some((labels) =>
				labels.some((l) => {
					const { dotsAbove, dotsBelow } = splitPitchLabel(l.text);
					return dotsAbove + dotsBelow > 0;
				}),
			);
			const pitchLineHeight = dotted ? PITCH_LINE_HEIGHT_DOTTED : PITCH_LINE_HEIGHT;
			const pitchBaselineOffset = dotted ? PITCH_FIRST_BASELINE_DOTTED : PITCH_FIRST_BASELINE;
			const pitchFirstBaseline =
				new TabStave(0, 0, 100).getYForLine(5) + STAVE_Y + pitchBaselineOffset;
			const footroom =
				tallestStack > 0
					? Math.max(
							0,
							pitchFirstBaseline +
								(tallestStack - 1) * pitchLineHeight +
								(dotted ? PITCH_BOTTOM_PAD_DOTTED : PITCH_BOTTOM_PAD) -
								SVG_HEIGHT,
						)
					: 0;
			const renderer = new Renderer(div, Renderer.Backends.SVG);
			renderer.resize(svgWidth, SVG_HEIGHT + headroom + footroom);
			const ctx = renderer.getContext();
			const nextAnchors: ChordAnchor[] = [];
			const placed: PlacedLabel[] = [];
			ctx.setFont({ family: '"JetBrains Mono", ui-monospace, monospace', size: "10pt" });

			// Draw staves, accumulating x from per-measure widths.
			let staveX = CLEF_WIDTH;
			const staves = measures.map((measure, i) => {
				const w = measureWidths[i];
				const stave = new TabStave(staveX, staveY, w);
				staveX += w;
				if (i === 0) {
					stave.addTabGlyph();
				} else if (!measure.repeatStart) {
					stave.setBegBarType(Barline.type.NONE);
				}
				// Repeat barlines: |: on the left, :| on the right (coexist with the
				// first measure's TAB clef glyph).
				if (measure.repeatStart) stave.setBegBarType(Barline.type.REPEAT_BEGIN);
				if (measure.repeatEnd) stave.setEndBarType(Barline.type.REPEAT_END);
				const measNum =
					startMeasureNumber !== undefined ? startMeasureNumber + i : undefined;
				if (measNum !== undefined) stave.setMeasure(measNum);
				stave.setContext(ctx);
				stave.draw();
				// Play-count label above the end-repeat barline. Per notation convention only
				// shown when it plays more than the implicit twice (×2 is the default :| meaning).
				const times = measure.repeatTimes ?? 2;
				if (measure.repeatEnd && times > 2) {
					ctx.fillText(`×${times}`, stave.getX() + w - 22, staveY + 6);
				}
				return stave;
			});

			// Write note-area bounds for the cursor measure-highlight overlay.
			if (startMeasureIndex !== undefined) {
				const svgEl = div.querySelector("svg");
				if (svgEl) {
					staves.forEach((stave, i) => {
						const g = startMeasureIndex + i;
						svgEl.setAttribute(`data-stave-${g}-x`, String(stave.getNoteStartX()));
						svgEl.setAttribute(
							`data-stave-${g}-w`,
							String(stave.getNoteEndX() - stave.getNoteStartX()),
						);
					});
				}
			}

			// Format and draw notes for each measure against its own stave.
			const drawn: {
				measure: Measure;
				notes: StemmableNote[];
				noteStrings: number[][];
				noteSlots: number[];
				rolls: RollMark[];
				stave: TabStave;
			}[] = [];
			measures.forEach((measure, i) => {
				const { notes, connectors, tuplets, chordLabels, rolls, noteStrings, noteSlots } =
					fingerpickToVexFlow(measure);
				drawn.push({ measure, notes, noteStrings, noteSlots, rolls, stave: staves[i] });
				const voice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] }).setMode(
					Voice.Mode.SOFT,
				);
				voice.addTickables(notes);
				const noteWidth = staves[i].getNoteEndX() - staves[i].getNoteStartX() - 10;
				new Formatter().joinVoices([voice]).format([voice], noteWidth);
				const beams = Beam.applyAndGetBeams(voice, -1, beamGroupsFor(timeSignature));
				voice.draw(ctx, staves[i]);
				connectors.forEach((c) => c.setContext(ctx).draw());
				beams.forEach((b) => b.setContext(ctx).draw());
				tuplets.forEach((t) => t.setContext(ctx).draw());

				// Chord symbols want the x of the note where the chord changes (known
				// only now, after formatting); they are drawn once the whole row is
				// placed, so neighbours can be kept clear of each other.
				if (chordLabels.length > 0) {
					ctx.save();
					ctx.setFont(CHORD_FONT);
					chordLabels.forEach((chordLabel) => {
						const noteX = notes[chordLabel.noteIndex].getAbsoluteX();
						placed.push({
							label: chordLabel,
							measureIndex: startMeasureIndex === undefined ? undefined : startMeasureIndex + i,
							noteX,
							x: noteX,
							width: ctx.measureText(chordLabel.label).width,
							diagramX: noteX,
							lane: 0,
						});
					});
					ctx.restore();
				}

				if (startMeasureIndex !== undefined) {
					const globalMeasureIdx = startMeasureIndex + i;
					// The cursor looks notes up by the SLOT they came from, which is not
					// the note's index once a grace slot produces no note of its own.
					notes.forEach((note, j) => {
						const el = note.getSVGElement();
						if (el) {
							el.setAttribute("data-measure-index", String(globalMeasureIdx));
							el.setAttribute("data-slot-index", String(noteSlots[j]));
						}
					});
				}
			});

			// The chord line, laid out row-wide. More lanes than this pass left room
			// for means one more pass with the right headroom; the staves all share
			// a y, so the baseline is the first one's.
			const lanesUsed = layoutChordLine(
				placed,
				showDiagrams ? (chordDiagramSize?.width ?? 0) : 0,
				svgWidth - BARLINE_CLIP_MARGIN,
			);
			if (lanesUsed > lanes && lanes < CHORD_DIAGRAM_MAX_LANES) {
				renderToWidth(Math.min(lanesUsed, CHORD_DIAGRAM_MAX_LANES));
				return;
			}
			if (placed.length > 0) {
				const baseline = staves[0].getYForLine(0) - CHORD_BASELINE_OFFSET;
				ctx.save();
				ctx.setFont(CHORD_FONT);
				ctx.openGroup("chord-label");
				placed.forEach((item) => {
					ctx.fillText(item.label.label, item.x, baseline);
					if (showDiagrams && item.measureIndex !== undefined) {
						const lift = (diagramHeight + CHORD_DIAGRAM_LANE_GAP) * item.lane;
						nextAnchors.push({
							key: `${item.measureIndex}:${item.label.slotIndex}`,
							x: item.diagramX,
							y: Math.max(
								0,
								baseline - CHORD_SYMBOL_HEIGHT - CHORD_DIAGRAM_GAP - diagramHeight - lift,
							),
							label: { ...item.label, measureIndex: item.measureIndex },
						});
					}
				});
				ctx.closeGroup();
				ctx.restore();
			}

			const svgEl = div.querySelector("svg");
			if (svgEl) applyStaveTheme(svgEl);

			// Roll arrows, from each rolled note's first played string to its last.
			if (svgEl) {
				drawn.forEach(({ notes, noteStrings, rolls, stave }) => {
					rolls.forEach(({ noteIndex, stroke }) => {
						const strings = noteStrings[noteIndex];
						// One string is nothing to sweep across (the scheduler skips it too).
						if (strings.length < 2) return;
						const ys = strings.map((stringIndex) => stave.getYForLine(stringIndex));
						drawRoll(
							svgEl,
							notes[noteIndex].getAbsoluteX() - ROLL_X_OFFSET,
							Math.min(...ys),
							Math.max(...ys),
							stroke,
						);
					});
				});
			}

			// The pitch column, one stack per note, under the stems.
			if (svgEl && pitchStacks.length > 0) {
				const firstBaseline = staves[0].getYForLine(5) + pitchBaselineOffset;
				drawn.forEach(({ notes, noteSlots }, i) => {
					notes.forEach((note, j) => {
						const labels = pitchStacks[i][noteSlots[j]];
						if (!labels || labels.length === 0) return;
						drawPitchColumn(svgEl, note.getAbsoluteX(), firstBaseline, pitchLineHeight, labels);
					});
				});
			}

			// A tied note's second number is drawn lighter: the string is not struck
			// again there, only held. After the theme pass so the colour sticks. A
			// TabNote draws one <text> per position, in position order, before any
			// modifier text — so the number for a string is found by its position.
			drawn.forEach(({ measure, notes, noteStrings, noteSlots }) => {
				notes.forEach((note, j) => {
					const slot = measure.slots[noteSlots[j]];
					if (!slot) return;
					const el = note.getSVGElement();
					if (!el) return;
					const texts = el.querySelectorAll("text");
					noteStrings[j].forEach((stringIndex, pos) => {
						const sf = slot.strings[stringIndex];
						if (sf.tied && !sf.muted) texts[pos]?.setAttribute("fill", "var(--ink-dim)");
					});
				});
			});

			// Off-shape fret numbers likewise, and they win over the tied tint.
			if (offShapeStrings && startMeasureIndex !== undefined) {
				drawn.forEach(({ notes, noteStrings, noteSlots }, i) => {
					const measureIndex = startMeasureIndex + i;
					notes.forEach((note, j) => {
						const off = offShapeStrings(measureIndex, noteSlots[j]);
						if (off.length === 0) return;
						const el = note.getSVGElement();
						if (!el) return;
						const texts = el.querySelectorAll("text");
						off.forEach((stringIndex) => {
							const pos = noteStrings[j].indexOf(stringIndex);
							if (pos >= 0) texts[pos]?.setAttribute("fill", "var(--off-shape)");
						});
					});
				});
			}
			// Same anchors → same state, so a resize that moved nothing re-renders nothing.
			setAnchors((prev) =>
				prev.length === nextAnchors.length &&
				prev.every(
					(a, k) =>
						a.key === nextAnchors[k].key &&
						a.x === nextAnchors[k].x &&
						a.y === nextAnchors[k].y,
				)
					? prev
					: nextAnchors,
			);
		};

		// Initial render; ResizeObserver re-renders on container size changes.
		rafId = requestAnimationFrame(() => renderToWidth());
		const observer = new ResizeObserver(() => {
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => renderToWidth());
		});
		observer.observe(div);

		return () => {
			cancelled = true;
			observer.disconnect();
			if (rafId !== undefined) cancelAnimationFrame(rafId);
			div.innerHTML = "";
		};
	}, [
		measures,
		timeSignature,
		startMeasureNumber,
		startMeasureIndex,
		measureWidths,
		showDiagrams,
		diagramHeight,
		chordDiagramSize?.width,
		offShapeStrings,
		pitchLabel,
	]);

	return (
		<div className="relative w-full">
			<div ref={containerRef} className="font-mono w-full" />
			{/* Shapes over the chord symbols. Laid over the SVG rather than drawn
			    into it: the diagram is a React component with its own markup and
			    theme, and the anchors only exist once VexFlow has placed the notes. */}
			{chordDiagram &&
				anchors.map((anchor) => (
					<div
						key={anchor.key}
						className="pointer-events-none absolute"
						style={{ left: anchor.x - 2, top: anchor.y }}
					>
						{chordDiagram(anchor.label)}
					</div>
				))}
		</div>
	);
}
