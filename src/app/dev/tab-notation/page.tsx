"use client";

import { useMemo, useState, useEffect, useRef } from "react";

import TabStaveRow, { computeMeasureMinWidth, CLEF_WIDTH } from "@/components/fingerpick/TabStaveRow";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import type { Measure, StringFret } from "@/lib/fingerpickTypes";

// ── StringFret factories ──────────────────────────────────────────────────────

const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const Hn = (fret: number): StringFret => ({ fret, technique: "hammer-on", tied: false, muted: false });
const Po = (fret: number): StringFret => ({ fret, technique: "pull-off", tied: false, muted: false });
const Su = (fret: number): StringFret => ({ fret, technique: "slide-up", tied: false, muted: false });
const Sd = (fret: number): StringFret => ({ fret, technique: "slide-down", tied: false, muted: false });
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Sta = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, staccato: true,
});
const Acc = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, accent: true,
});
const Pd = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, pickStroke: "down",
});
const Pu = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, pickStroke: "up",
});
const Tr8 = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, tremoloPickingSpeed: "8th",
});
const Tr16 = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, tremoloPickingSpeed: "16th",
});
const Tr32 = (fret: number): StringFret => ({
	fret, technique: null, tied: false, muted: false, tremoloPickingSpeed: "32nd",
});
const Vib = (fret: number): StringFret => ({ fret, technique: "vibrato", tied: false, muted: false });
const VibW = (fret: number): StringFret => ({
	fret, technique: "vibrato-wide", tied: false, muted: false,
});

// ── Measure definitions ───────────────────────────────────────────────────────
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]

const GRACE_NOTE_MEASURE: Measure = {
	id: "grace",
	slots: [
		{
			id: "g1", duration: "eighth",
			strings: [N(5), S(), S(), S(), S(), S()],
			isGraceNote: true,
		},
		{ id: "g2", duration: "quarter", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "g3", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "g4", duration: "quarter", strings: [N(7), S(), S(), S(), S(), S()] },
		{ id: "g5", duration: "quarter", strings: [N(8), S(), S(), S(), S(), S()] },
	],
};

const STACCATO_ACCENT_MEASURE: Measure = {
	id: "staccato-accent",
	slots: [
		{ id: "sa1", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
		{ id: "sa2", duration: "quarter", strings: [Sta(5), S(), S(), S(), S(), S()] },
		{ id: "sa3", duration: "quarter", strings: [Acc(5), S(), S(), S(), S(), S()] },
		{ id: "sa4", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

const PICK_STROKE_MEASURE: Measure = {
	id: "pick-stroke",
	slots: [
		{ id: "ps1", duration: "quarter", strings: [Pd(5), S(), S(), S(), S(), S()] },
		{ id: "ps2", duration: "quarter", strings: [Pu(5), S(), S(), S(), S(), S()] },
		{ id: "ps3", duration: "quarter", strings: [Pd(7), S(), S(), S(), S(), S()] },
		{ id: "ps4", duration: "quarter", strings: [Pu(7), S(), S(), S(), S(), S()] },
	],
};

const TREMOLO_MEASURE: Measure = {
	id: "tremolo",
	slots: [
		{ id: "tr1", duration: "quarter", strings: [Tr8(5), S(), S(), S(), S(), S()] },
		{ id: "tr2", duration: "quarter", strings: [Tr16(5), S(), S(), S(), S(), S()] },
		{ id: "tr3", duration: "quarter", strings: [Tr32(5), S(), S(), S(), S(), S()] },
		{ id: "tr4", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
	],
};

const VIBRATO_MEASURE: Measure = {
	id: "vibrato",
	slots: [
		{ id: "vib1", duration: "half", strings: [Vib(5), S(), S(), S(), S(), S()] },
		{ id: "vib2", duration: "half", strings: [VibW(5), S(), S(), S(), S(), S()] },
	],
};

const HAMMER_PULL_MEASURE: Measure = {
	id: "hammer-pull",
	slots: [
		{ id: "hp1", duration: "quarter", strings: [S(), S(), S(), N(0), S(), S()] },
		{ id: "hp2", duration: "quarter", strings: [S(), S(), S(), Hn(2), S(), S()] },
		{ id: "hp3", duration: "quarter", strings: [S(), S(), S(), N(2), S(), S()] },
		{ id: "hp4", duration: "quarter", strings: [S(), S(), S(), Po(0), S(), S()] },
	],
};

const SLIDE_TIE_MEASURE: Measure = {
	id: "slide-tie",
	slots: [
		{ id: "st1", duration: "quarter", strings: [S(), S(), S(), S(), N(3), S()] },
		{ id: "st2", duration: "quarter", strings: [S(), S(), S(), S(), Su(7), S()] },
		{ id: "st3", duration: "quarter", strings: [S(), S(), S(), S(), Ti(7), S()] },
		{ id: "st4", duration: "quarter", strings: [S(), S(), S(), S(), Sd(5), S()] },
	],
};

// ── Groups ────────────────────────────────────────────────────────────────────

const GROUPS: { label: string; measures: Measure[] }[] = [
	{ label: "Grace Note (grace note before regular note)", measures: [GRACE_NOTE_MEASURE] },
	{ label: "Staccato (·) and Accent (>) — notes 2 and 3", measures: [STACCATO_ACCENT_MEASURE] },
	{ label: "Pick Stroke: Down (⊓) and Up (V) alternating", measures: [PICK_STROKE_MEASURE] },
	{ label: "Tremolo Picking: 8th (1 slash) · 16th (2) · 32nd (3) · plain", measures: [TREMOLO_MEASURE] },
	{ label: "Vibrato (half 1) and Vibrato-Wide (half 2)", measures: [VIBRATO_MEASURE] },
	{ label: "Techniques regression: Hammer-On, Pull-Off", measures: [HAMMER_PULL_MEASURE] },
	{ label: "Techniques regression: Slide-Up, Tied, Slide-Down", measures: [SLIDE_TIE_MEASURE] },
];

// ── Width computation ─────────────────────────────────────────────────────────

const ROW_TRAILING_PAD = 15;

function techniqueConnectorCount(measure: Measure): number {
	return measure.slots.reduce(
		(count, slot) =>
			count +
			slot.strings.filter(
				(sf) => sf.technique === "hammer-on" || sf.technique === "pull-off",
			).length,
		0,
	);
}

function computeGroupWidths(measures: Measure[], containerWidth: number): number[] {
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const renderData = measures.map((m) => fingerpickToVexFlow(m));
	const minWidths = renderData.map((rd, i) =>
		computeMeasureMinWidth(rd.notes, i === 0, techniqueConnectorCount(measures[i])),
	);
	const totalMin = minWidths.reduce((a, b) => a + b, 0);
	const scale = Math.max(1, staveSpace / totalMin);
	return minWidths.map((w) => w * scale);
}

// ── Page component ────────────────────────────────────────────────────────────

export default function TabNotationDevPage() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const obs = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	const groups = useMemo(() => {
		if (containerWidth === 0) return [];
		return GROUPS.map(({ label, measures }) => ({
			label,
			measures,
			widths: computeGroupWidths(measures, containerWidth),
		}));
	}, [containerWidth]);

	return (
		<div ref={containerRef} className="p-6 max-w-5xl mx-auto font-mono">
			<h1 className="text-xl font-bold mb-1">Tab Notation Dev — Phase B1</h1>
			<p className="text-xs text-slate-400 mb-8">
				Visual verification for B1 modifiers: grace notes, staccato, accent, pick stroke, tremolo,
				vibrato. Regression: hammer-on, pull-off, slide-up, tie, slide-down.
			</p>

			{groups.map(({ label, measures, widths }) => (
				<section key={label} className="mb-8">
					<h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
						{label}
					</h3>
					<div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
						<TabStaveRow measures={measures} measureWidths={widths} />
					</div>
				</section>
			))}
		</div>
	);
}
