"use client";

import { useEffect, useState } from "react";

import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import Fader from "@/app/dev/_components/Fader";
import { DEFAULT_SLAP_PARAMS, type SlapParams } from "@/lib/fingerpickScheduler";
import { FINGERPICK_SCHEMA_VERSION, type BeatSlot, type FingerpickPattern, type StringFret } from "@/lib/fingerpickTypes";

/**
 * Slap lab — tune how an x (a slap on a string) and the slot hits sound. The
 * three layers (`SlapParams` in fingerpickScheduler.ts: the string's own
 * strike cut short, the clack of the strings on the frets, the thud of the
 * body) are faders here; the bars loop so a change is heard on the next pass.
 * Copy the JSON into DEFAULT_SLAP_PARAMS when it sounds right.
 */

const G = 2;
const A = 4;
const E = 5;

const silent = (): StringFret => ({ fret: null, muted: false });
const note = (fret: number): StringFret => ({ fret, muted: false });
const x = (): StringFret => ({ fret: null, muted: true });

let nextId = 0;
function slot(notes: Partial<Record<number, StringFret>>, extra: Partial<BeatSlot> = {}): BeatSlot {
	const strings = [silent(), silent(), silent(), silent(), silent(), silent()] as BeatSlot["strings"];
	for (const [i, sf] of Object.entries(notes)) if (sf) strings[Number(i)] = sf;
	return { id: `slap-lab-${nextId++}`, duration: "quarter", strings, ...extra };
}

function bar(name: string, slots: BeatSlot[]): FingerpickPattern {
	return {
		id: `slap-lab-${name}`,
		name,
		bpm: 90,
		timeSignature: [4, 4],
		measures: [{ id: `${name}-m`, slots }],
		schemaVersion: FINGERPICK_SCHEMA_VERSION,
	};
}

const melody = () => ({ [A]: note(0), [G]: note(2) });

const BARS: { key: string; label: string; what: string; pattern: FingerpickPattern }[] = [
	{
		key: "x-bass",
		label: "x on the low E under a melody",
		what: "Beats 2 and 4: an x on the low E while the G keeps sounding — the way tab writes a thumb slap.",
		pattern: bar("x-bass", [slot(melody()), slot({ [E]: x(), [G]: note(2) }), slot(melody()), slot({ [E]: x(), [A]: x(), [G]: note(2) })]),
	},
	{
		key: "x-alone",
		label: "x alone, every beat",
		what: "Nothing but the slap, four times, to hear the layers on their own.",
		pattern: bar("x-alone", [slot({ [E]: x() }), slot({ [E]: x() }), slot({ [E]: x() }), slot({ [E]: x() })]),
	},
	{
		key: "x-treble",
		label: "x on the treble strings",
		what: "Beats 2 and 4: x on the high e and B — the clack with little thud (trebleThud).",
		pattern: bar("x-treble", [slot(melody()), slot({ 0: x(), 1: x() }), slot(melody()), slot({ 0: x(), 1: x() })]),
	},
	{
		key: "thumb",
		label: "Thumb slap hit",
		what: "Beats 2 and 4: the slot hit on strings 4–6, the second accented.",
		pattern: bar("thumb", [slot(melody()), slot({}, { percussion: { kind: "thumbSlap" } }), slot(melody()), slot({}, { percussion: { kind: "thumbSlap", accent: true } })]),
	},
	{
		key: "slap",
		label: "Whole-hand slap hit",
		what: "Beats 2 and 4: every free string struck dead, the second accented.",
		pattern: bar("slap", [slot(melody()), slot({}, { percussion: { kind: "slap" } }), slot(melody()), slot({}, { percussion: { kind: "slap", accent: true } })]),
	},
];

interface FaderDef {
	key: keyof SlapParams;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

const GROUPS: { title: string; blurb: string; faders: FaderDef[] }[] = [
	{
		title: "Strike — the string's own attack, cut short",
		blurb: "What TuxGuitar / alphaTab play for a dead note: the sample for about 30 ms. Longer keeps more pitch.",
		faders: [
			{ key: "strikeS", label: "length", min: 0.015, max: 0.2, step: 0.005, unit: "s" },
			{ key: "strikeTc", label: "decay τ", min: 0.005, max: 0.08, step: 0.001, unit: "s" },
		],
	},
	{
		title: "Clack — strings on the frets",
		blurb: "A bandpassed noise burst, once a slot. Higher and shorter is snappier.",
		faders: [
			{ key: "clackGain", label: "gain", min: 0, max: 1.2, step: 0.01, unit: "" },
			{ key: "clackHz", label: "centre", min: 600, max: 6000, step: 50, unit: "Hz" },
			{ key: "clackQ", label: "Q", min: 0.3, max: 6, step: 0.1, unit: "" },
			{ key: "clackTc", label: "decay τ", min: 0.002, max: 0.04, step: 0.001, unit: "s" },
		],
	},
	{
		title: "Thud — the hand on the body",
		blurb: "Lowpassed noise with a sine dropping under it, once a slot; the treble strings keep only trebleThud of it.",
		faders: [
			{ key: "thudGain", label: "gain", min: 0, max: 1.2, step: 0.01, unit: "" },
			{ key: "thudHz", label: "lowpass", min: 60, max: 800, step: 10, unit: "Hz" },
			{ key: "thudTc", label: "decay τ", min: 0.01, max: 0.2, step: 0.005, unit: "s" },
			{ key: "thudToneFromHz", label: "sine from", min: 40, max: 300, step: 5, unit: "Hz" },
			{ key: "thudToneToHz", label: "sine to", min: 30, max: 200, step: 5, unit: "Hz" },
			{ key: "trebleThud", label: "treble share", min: 0, max: 1, step: 0.05, unit: "" },
		],
	},
];

function pct(value: number, min: number, max: number): number {
	return ((value - min) / (max - min)) * 100;
}

function format(value: number, unit: string): string {
	const digits = unit === "s" ? 3 : unit === "Hz" ? 0 : 2;
	return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export default function SlapLabPage() {
	const engine = useFingerpickAudioEngine();
	const { isLoaded, isPlaying, slapParams } = engine;
	const [activeBar, setActiveBar] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		void engine.load();
		// Load once on mount; the engine's identity is stable for the page's life.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function play(key: string) {
		const entry = BARS.find((b) => b.key === key);
		if (!entry) return;
		engine.stop();
		engine.setPlayOnce(false);
		setActiveBar(key);
		engine.play(entry.pattern, { loop: true, loopGapSeconds: 0 });
	}
	function stop() {
		engine.stop();
		setActiveBar(null);
	}
	function copyParams() {
		void navigator.clipboard.writeText(JSON.stringify(slapParams, null, "\t")).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}

	const chip = (on: boolean) =>
		`rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-denim bg-denim text-on-denim" : "border-line text-ink-dim hover:border-denim hover:text-denim"}`;

	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<div className="mx-auto max-w-5xl">
				<p className="mb-1 font-mono text-xs uppercase tracking-widest text-ink-dim">/dev — slap lab</p>
				<h1 className="mb-2 text-2xl font-bold">How a slap sounds</h1>
				<p className="mb-6 max-w-3xl text-sm text-ink-dim">
					An x on a string and the slot hits are voiced in three layers (<code>SlapParams</code> in <code>fingerpickScheduler.ts</code>): the string&apos;s own strike cut short, the clack of the
					strings on the frets, and the thud of the body. Each bar loops; a fader change is heard on the next beat. When it sounds right, copy the JSON into{" "}
					<code>DEFAULT_SLAP_PARAMS</code>.
				</p>

				<section className="mb-8 rounded-xl border border-line bg-card p-4">
					<div className="mb-3 flex flex-wrap items-center gap-2">
						{BARS.map((b) => (
							<button key={b.key} type="button" onClick={() => (activeBar === b.key && isPlaying ? stop() : play(b.key))} disabled={!isLoaded} className={chip(activeBar === b.key && isPlaying)} aria-pressed={activeBar === b.key && isPlaying}>
								{activeBar === b.key && isPlaying ? "■ " : "▶ "}
								{b.label}
							</button>
						))}
						{!isLoaded && <span className="text-xs text-ink-dim">loading samples…</span>}
					</div>
					<p className="text-sm text-ink-dim">{BARS.find((b) => b.key === activeBar)?.what ?? "Pick a bar."}</p>
				</section>

				<div className="grid gap-6 md:grid-cols-3">
					{GROUPS.map((group) => (
						<section key={group.title} className="rounded-xl border border-line bg-card p-4">
							<h2 className="mb-1 text-sm font-semibold">{group.title}</h2>
							<p className="mb-4 text-xs text-ink-dim">{group.blurb}</p>
							<div className="space-y-4">
								{group.faders.map((f) => {
									const value = slapParams[f.key];
									const def = DEFAULT_SLAP_PARAMS[f.key];
									return (
										<div key={f.key}>
											<div className="mb-1 flex items-baseline justify-between font-mono text-xs">
												<span className="text-ink-dim">{f.label}</span>
												<span className={value === def ? "text-ink-dim" : "text-denim"}>{format(value, f.unit)}</span>
											</div>
											<Fader ariaLabel={`${f.key}`} min={f.min} max={f.max} step={f.step} value={value} onValue={(v) => engine.setSlapParams({ [f.key]: v })} ticks={[pct(def, f.min, f.max)]} tickValues={[def]} tickLabels={[`default ${format(def, f.unit)}`]} />
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>

				<section className="mt-6 flex flex-wrap items-center gap-3">
					<button type="button" onClick={copyParams} className="rounded-md bg-denim px-3 py-1.5 text-sm text-on-denim hover:bg-denim-dark">
						{copied ? "Copied" : "Copy params JSON"}
					</button>
					<button type="button" onClick={() => engine.resetSlapParams()} className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-dim hover:border-denim hover:text-denim">
						Reset to defaults
					</button>
					<pre className="w-full overflow-x-auto rounded-md border border-line bg-card p-3 font-mono text-xs text-ink-dim">{JSON.stringify(slapParams, null, 2)}</pre>
				</section>
			</div>
		</div>
	);
}
