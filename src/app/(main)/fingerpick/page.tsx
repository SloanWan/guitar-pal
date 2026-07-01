"use client";

import { useState, useEffect, useMemo } from "react";
import { FingerpickPattern, StringFret, Measure } from "@/lib/fingerpickTypes";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { X, SquareMenu } from "lucide-react";

// ── StringFret factory helpers ──────────────────────────────────────────────
// Reduce the verbosity of the required { fret, technique, tied, muted } shape.
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const Hn = (fret: number): StringFret => ({
	fret,
	technique: "hammer-on",
	tied: false,
	muted: false,
});
const Po = (fret: number): StringFret => ({
	fret,
	technique: "pull-off",
	tied: false,
	muted: false,
});
const Su = (fret: number): StringFret => ({
	fret,
	technique: "slide-up",
	tied: false,
	muted: false,
});
const Sd = (fret: number): StringFret => ({
	fret,
	technique: "slide-down",
	tied: false,
	muted: false,
});
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Mx = (): StringFret => ({ fret: null, technique: null, tied: false, muted: true });

// ── Preset pattern ─────────────────────────────────────────────────────────
// Exercises every supported technique and all five duration values in one pattern.
//
// m1 — quarter notes: normal frets + muted ("x") note
// m2 — eighth notes + beams: hammer-on (h) and pull-off (p) on D string
// m3 — quarter notes: slide-up (/), tied arc, slide-down (\) on A string
// m4 — half + quarter rest + four sixteenth notes on high-e (exercises half, rest, sixteenth)
// m5 — single whole note on G string (exercises whole)
//
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
const PRESET_FINGERPICK_PATTERN: FingerpickPattern = {
	id: "technique-showcase",
	name: "Technique Showcase",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		// ── m1: quarter notes — normal frets, muted note ────────────────
		{
			id: "m1",
			slots: [
				{ id: "s01", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s02", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s03", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s04", duration: "quarter", strings: [S(), S(), S(), S(), N(2), S()] },
			],
		},

		// ── m2: eighth notes — beams, hammer-on, pull-off on D string ────
		{
			id: "m2",
			slots: [
				{ id: "s05", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s06", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s07", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s08", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s09", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s10", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s11", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s12", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
			],
		},

		// ── m3: quarter notes — slide-up, tied arc, slide-down on A ──────
		{
			id: "m3",
			slots: [
				{ id: "s13", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s14", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s15", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s16", duration: "quarter", strings: [S(), S(), S(), S(), Sd(0), S()] },
			],
		},

		// ── m4: half + rest + 4 sixteenth notes (2 + 1 + 1 = 4 beats) ───
		{
			id: "m4",
			slots: [
				{ id: "s17", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s18", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s19", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s20", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s21", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s22", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m5: whole note — G string open (4 beats) ─────────────────────
		{
			id: "m5",
			slots: [{ id: "s23", duration: "whole", strings: [S(), S(), N(0), S(), S(), S()] }],
		},
	],
};

// groupMeasuresIntoRows — pure function.
// Splits a flat measures array into row-sized chunks for layout.
//
// Unit-test examples:
//   groupMeasuresIntoRows([m1,m2,m3,m4,m5], 4) → [[m1,m2,m3,m4],[m5]]
//   groupMeasuresIntoRows([m1,m2,m3],       2) → [[m1,m2],[m3]]
//   groupMeasuresIntoRows([],               4) → []
//   groupMeasuresIntoRows([m1],             4) → [[m1]]
function groupMeasuresIntoRows(measures: Measure[], perRow: number): Measure[][] {
	const rows: Measure[][] = [];
	for (let i = 0; i < measures.length; i += perRow) {
		rows.push(measures.slice(i, i + perRow));
	}
	return rows;
}

export default function FingerpickPage() {
	const [showLibrary, setShowLibrary] = useState(false);
	const [pattern] = useState<FingerpickPattern>(PRESET_FINGERPICK_PATTERN);

	// Desktop (≥768 px): 4 measures per row; mobile: 2.
	// Default to 4 (desktop) for SSR; corrected on the client in the effect below.
	const [measuresPerRow, setMeasuresPerRow] = useState(4);

	useEffect(() => {
		const mq = window.matchMedia("(min-width: 768px)");
		setMeasuresPerRow(mq.matches ? 4 : 2);
		const handler = (e: MediaQueryListEvent) => setMeasuresPerRow(e.matches ? 4 : 2);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	// Each entry carries the row's measures and the 1-indexed measure number for
	// its first cell, so TabStaveRow can label measures correctly.
	const rows = useMemo(() => {
		const groups = groupMeasuresIntoRows(pattern.measures, measuresPerRow);
		let start = 1;
		return groups.map((rowMeasures) => {
			const entry = { measures: rowMeasures, startMeasureNumber: start };
			start += rowMeasures.length;
			return entry;
		});
	}, [pattern.measures, measuresPerRow]);

	return (
		<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-slate-50">
			{/* Left sidebar — lg: static; below lg: slide-in overlay */}
			<div
				className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
					showLibrary ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
					<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Pattern Library
					</h2>
					<button
						onClick={() => setShowLibrary(false)}
						className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
					>
						<X size={18} />
					</button>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-xs text-slate-400 text-center px-4">
						Pattern library coming soon
					</p>
				</div>
			</div>

			{/* Backdrop — tap outside to close library on mobile/tablet */}
			{showLibrary && (
				<div
					className="fixed inset-0 z-30 bg-black/20 lg:hidden"
					onClick={() => setShowLibrary(false)}
				/>
			)}

			{/* Centre — TAB viewer
			    md: fixed-height column → inner wrapper fills it (flex-1 + min-h-0)
			    → title is shrink-0 → measures scroll vertically inside min-h-0 container.
			    Mobile: no height constraint, page scroll handles overflow naturally. */}
			<div className="md:flex-1 flex flex-col px-4 md:px-8 py-6 md:py-8 md:overflow-hidden">
				<div className="relative w-full max-w-4xl mx-auto flex flex-col min-h-0 md:flex-1">
					<div className="mb-4 shrink-0">
						<h1 className="text-lg font-semibold text-slate-700">{pattern.name}</h1>
						<p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
							{pattern.bpm} BPM &middot; {pattern.timeSignature[0]}/
							{pattern.timeSignature[1]}
						</p>
					</div>

					{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport. */}
					<div className="min-h-0 overflow-y-auto bg-white rounded-xl border border-slate-100">
						<div className="flex flex-col">
							{rows.map((row) => (
								<TabStaveRow
									key={row.measures[0].id}
									measures={row.measures}
									startMeasureNumber={row.startMeasureNumber}
								/>
							))}
						</div>
					</div>

					{/* Mobile library toggle */}
					{!showLibrary && (
						<button
							onClick={() => setShowLibrary(true)}
							className="absolute top-0 right-0 lg:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-200 active:scale-95"
							style={{ backgroundColor: "var(--denim)" }}
						>
							<SquareMenu />
						</button>
					)}
				</div>
			</div>

			{/* Right panel — controls */}
			<div className="w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex flex-col">
				<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Controls
				</h2>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-xs text-slate-400 text-center px-4">Controls coming soon</p>
				</div>
			</div>
		</div>
	);
}
