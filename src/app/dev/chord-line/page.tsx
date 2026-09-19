"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TabStaveRow, {
	computeMeasureMinWidth,
	CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import ChordShapeStrip, { CHORD_STRIP_ASPECT } from "@/components/fingerpick/ChordShapeStrip";
import Fader from "@/components/ui/Fader";
import { fingerpickToVexFlow, type ChordLabel } from "@/lib/fingerpickToVexFlow";
import type { BeatSlot, Duration, Measure, StringFret } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { chordVoicingToVexChords } from "@/lib/chordVoicing";
import { vexChordDefToSVGProps } from "@/components/chords/ChordDiagram";
import { chordRegionEnd, heldButUnplucked } from "@/lib/fingerpickChords";

/**
 * Chord-line stress lab: chord changes as dense as the model allows — every
 * 32nd note, long names, changes right at measure edges — in both the names
 * and the shapes view, with the shape size pushed to its limit. What to look
 * for: symbols never overlap (later ones are pushed right), shapes never
 * overlap (they stack into lanes above their notes), and nothing runs into
 * the next measure. Voicings are fixed here so the page needs no database.
 */

const ROW_TRAILING_PAD = 15;
const SHAPE_MIN = 40;
const SHAPE_MAX = 140;

// A few shapes to draw, keyed by chord symbol — all open-position, one barre.
const SHAPES: Record<string, ChordVoicing> = {
	"C major": { id: "c", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" },
	"A minor": { id: "am", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x02210", fingers: "002310" },
	"G 7": { id: "g7", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "320001", fingers: "320001" },
	"F major": { id: "f", label: null, start_fret: 1, barre_fret: 1, capo: true, frets: "133211", fingers: "134211" },
	"F# m7b5": { id: "fs", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "2x2210", fingers: "203410" },
	"Bb maj7": { id: "bb", label: null, start_fret: 6, barre_fret: 1, capo: true, frets: "1x2231", fingers: "104231" },
};
const REFS: Record<string, ChordRef> = {
	"C major": { root: "C", suffix: "major" },
	"A minor": { root: "A", suffix: "minor" },
	"G 7": { root: "G", suffix: "7" },
	"F major": { root: "F", suffix: "major" },
	"F# m7b5": { root: "F#", suffix: "m7b5" },
	"Bb maj7": { root: "Bb", suffix: "maj7" },
};
const keyOf = (ref: ChordRef) => `${ref.root} ${ref.suffix}`;

const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
function slot(id: string, duration: Duration, frets: Partial<Record<number, number>>, chord?: ChordRef): BeatSlot {
	const strings = [S(), S(), S(), S(), S(), S()] as BeatSlot["strings"];
	for (const [i, fret] of Object.entries(frets)) strings[Number(i)] = { ...S(), fret: fret ?? null };
	return { id, duration, strings, ...(chord ? { chord } : {}) };
}

// m1: a chord on every 32nd of the first beat, then quarters. m2: changes on
// the last 32nd of the measure and the first of the next. m3: long names on
// adjacent 16ths. m4: sparse, for contrast.
const CHORD_CYCLE = ["C major", "A minor", "G 7", "F major", "F# m7b5", "Bb maj7"];
const MEASURES: Measure[] = [
	{
		id: "m1",
		slots: [
			...Array.from({ length: 8 }, (_, i) =>
				slot(`m1-${i}`, "32nd", { 0: i % 3, 2: 0 }, REFS[CHORD_CYCLE[i % CHORD_CYCLE.length]]),
			),
			slot("m1-q1", "quarter", { 1: 1, 3: 2 }),
			slot("m1-q2", "quarter", { 0: 0, 2: 0 }),
			slot("m1-q3", "quarter", { 4: 3 }),
		],
	},
	{
		id: "m2",
		slots: [
			slot("m2-0", "quarter", { 4: 0 }, REFS["A minor"]),
			slot("m2-1", "quarter", { 1: 1 }),
			slot("m2-2", "quarter", { 2: 2 }),
			...Array.from({ length: 8 }, (_, i) =>
				slot(`m2-3-${i}`, "32nd", { 0: 0 }, i === 7 ? REFS["Bb maj7"] : undefined),
			),
		],
	},
	{
		id: "m3",
		slots: [
			slot("m3-0", "sixteenth", { 0: 2 }, REFS["F# m7b5"]),
			slot("m3-1", "sixteenth", { 1: 1 }, REFS["Bb maj7"]),
			slot("m3-2", "sixteenth", { 2: 2 }, REFS["F# m7b5"]),
			slot("m3-3", "sixteenth", { 3: 2 }, REFS["Bb maj7"]),
			slot("m3-4", "quarter", { 0: 1 }, REFS["F major"]),
			slot("m3-5", "half", { 1: 1, 2: 2 }),
		],
	},
	{
		id: "m4",
		slots: [
			slot("m4-0", "quarter", { 4: 3 }, REFS["C major"]),
			slot("m4-1", "quarter", { 1: 1 }),
			slot("m4-2", "quarter", { 2: 0 }, REFS["G 7"]),
			slot("m4-3", "quarter", { 0: 1 }),
		],
	},
];

function computeRowWidths(measures: Measure[], containerWidth: number, shapeWidth: number): number[] {
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const minWidths = measures.map((m, i) => {
		const rd = fingerpickToVexFlow(m);
		return computeMeasureMinWidth(rd.notes, i === 0, 0, 0, rd.chordLabels.length, shapeWidth, rd.rolls.length);
	});
	const totalMin = minWidths.reduce((a, b) => a + b, 0);
	const scale = Math.max(1, staveSpace / totalMin);
	return minWidths.map((w) => w * scale);
}

export default function ChordLineLab() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);
	const [shapeWidth, setShapeWidth] = useState(96);
	const [rowOf, setRowOf] = useState<2 | 4>(2);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const shapeSize = useMemo(
		() => ({ width: shapeWidth, height: Math.round(shapeWidth * CHORD_STRIP_ASPECT) }),
		[shapeWidth],
	);
	const rows = useMemo(() => {
		const out: { measures: Measure[]; start: number }[] = [];
		for (let i = 0; i < MEASURES.length; i += rowOf) out.push({ measures: MEASURES.slice(i, i + rowOf), start: i });
		return out;
	}, [rowOf]);

	const chordDiagram = useCallback(
		(label: ChordLabel & { measureIndex: number }) => {
			const voicing = SHAPES[keyOf(label.chord)];
			const measure = MEASURES[label.measureIndex];
			if (!voicing || !measure) return null;
			const unplucked = heldButUnplucked(
				measure.slots,
				label.slotIndex,
				chordRegionEnd(measure, label.slotIndex),
				voicing,
			);
			const { frets, startFret, barreFret } = vexChordDefToSVGProps(chordVoicingToVexChords(voicing));
			return (
				<ChordShapeStrip
					frets={frets}
					startFret={startFret}
					barreFret={barreFret}
					dimmedStrings={[...unplucked].reverse()}
					width={shapeWidth}
				/>
			);
		},
		[shapeWidth],
	);

	return (
		<div className="mx-auto max-w-6xl space-y-8 p-6">
			<header className="space-y-1">
				<h1 className="text-lg font-semibold text-ink">Chord line lab</h1>
				<p className="text-sm text-ink-dim">
					Chord changes on every 32nd, at measure edges, with long names — names view
					above, shapes view below. Symbols should push right of each other; shapes
					should stack into lanes over their notes; nothing should cross a barline.
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-6">
				<label className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
					Shape size
					<div className="w-40">
						<Fader
							min={SHAPE_MIN}
							max={SHAPE_MAX}
							step={4}
							value={shapeWidth}
							onValue={setShapeWidth}
							ticks={[0, 50, 100]}
							tickValues={[SHAPE_MIN, (SHAPE_MIN + SHAPE_MAX) / 2, SHAPE_MAX]}
							scale={[`${SHAPE_MIN}`, `${SHAPE_MAX}`]}
							ariaLabel="Shape size"
						/>
					</div>
					<span className="tabular-nums text-ink">{shapeWidth}px</span>
				</label>
				<label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
					Measures per row
					<select
						value={rowOf}
						onChange={(e) => setRowOf(Number(e.target.value) as 2 | 4)}
						className="border border-line-strong bg-surface px-2 py-1 font-mono text-xs text-ink"
					>
						<option value={2}>2</option>
						<option value={4}>4</option>
					</select>
				</label>
			</div>

			<div ref={containerRef} className="space-y-10 bg-workspace p-4">
				<section className="space-y-2">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">Names</h2>
					{containerWidth > 0 &&
						rows.map((row) => (
							<TabStaveRow
								key={`names-${row.start}`}
								measures={row.measures}
								startMeasureNumber={row.start + 1}
								startMeasureIndex={row.start}
								measureWidths={computeRowWidths(row.measures, containerWidth, 0)}
							/>
						))}
				</section>
				<section className="space-y-2">
					<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">Shapes</h2>
					{containerWidth > 0 &&
						rows.map((row) => (
							<TabStaveRow
								key={`shapes-${row.start}`}
								measures={row.measures}
								startMeasureNumber={row.start + 1}
								startMeasureIndex={row.start}
								measureWidths={computeRowWidths(row.measures, containerWidth, shapeWidth)}
								chordDiagram={chordDiagram}
								chordDiagramSize={shapeSize}
							/>
						))}
				</section>
			</div>
		</div>
	);
}
