"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Annotation, Bend, Formatter, Renderer, TabNote, TabStave, Vibrato, Voice } from "vexflow";

import {
	preloadFingerpickPresets,
	getFingerpickNoteData,
} from "@/components/strum/useGuitarSampleLoader";
import Fader from "@/components/ui/Fader";
import {
	composeExpression,
	expressionForTechnique,
	bendTimeline,
	DEFAULT_BEND_PARAMS,
	DEFAULT_VIBRATO_PARAMS,
	WIDE_VIBRATO_PARAMS,
	type BendParams,
	type BendShape,
	type VibratoParams,
	type VibratoWaveform,
	type ExpressionSpec,
	type ExpressionCurve,
} from "@/lib/fingerpickExpression";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import { centsBetween, estimatePitchHz, midiToHz } from "@/lib/pitchEstimate";
import type { Technique } from "@/lib/fingerpickTypes";

// ── Copy in two languages ───────────────────────────────────────────────────

type Lang = "zh" | "en";
interface Bi {
	zh: string;
	en: string;
}
const bi = (zh: string, en: string): Bi => ({ zh, en });

// ── Playback constants (mirror the fingerpick engine's plain pluck) ──────────
/** Same base gain as a normal pluck in useFingerpickAudioEngine. */
const NOTE_GAIN = 0.8;
/** Floor for the decay time constant, as in the engine. */
const MIN_DECAY_TC_S = 0.03;
/** Stop margin past the note's end so the envelope tails off before the hard stop. */
const SOURCE_STOP_BUFFER_S = 0.05;
/** Gap between two notes played in a row. */
const NOTE_GAP_S = 0.15;

/** G string, 7th fret (D4) — a mid-range string with room to bend a whole tone. */
const DEFAULT_STRING = 2;
const DEFAULT_FRET = 7;

const STRING_NAMES = ["e", "B", "G", "D", "A", "E"] as const;

// ── Technique chips ─────────────────────────────────────────────────────────

type LabTechnique = Exclude<
	Technique,
	| null
	| "hammer-on"
	| "pull-off"
	| "slide-up"
	| "slide-down"
	| "vibrato-bar"
	| "tapping"
	| "trill"
	| "harmonic-natural"
	| "harmonic-artificial"
	| "whammy-dive"
	| "whammy-pull"
	| "pick-scrape"
	| "grace-note"
>;

interface TechniqueChip {
	value: LabTechnique;
	label: Bi;
	hint: Bi;
}

const TECHNIQUES: TechniqueChip[] = [
	{ value: "bend-quarter", label: bi("推弦 ¼", "bend ¼"), hint: bi("推高 50 音分", "+50 cents") },
	{ value: "bend-half", label: bi("推弦 ½", "bend ½"), hint: bi("推高半音", "+100 cents") },
	{ value: "bend-full", label: bi("推弦 全音", "bend full"), hint: bi("推高一个全音", "+200 cents") },
	{ value: "bend-release", label: bi("推弦回落", "bend-release"), hint: bi("推上去、停一下、放回来", "up, hold, back down") },
	{ value: "pre-bend", label: bi("预推弦", "pre-bend"), hint: bi("先推好再弹", "bent before the pluck") },
	{ value: "pre-bend-release", label: bi("预推弦回落", "pre-bend-release"), hint: bi("先推好再弹，然后放回来", "bent before the pluck, then let down") },
	{ value: "vibrato", label: bi("揉弦", "vibrato"), hint: bi("轻揉", "slight") },
	{ value: "vibrato-wide", label: bi("揉弦 大幅", "vibrato wide"), hint: bi("幅度更大，稍慢", "deeper, a touch slower") },
];

// ── Control specs ───────────────────────────────────────────────────────────

type NumericBendKey = "targetCents" | "riseMs" | "overshootCents" | "settleMs" | "holdMs" | "releaseMs";
type NumericVibratoKey = "depthCents" | "rateHz" | "onsetMs" | "fadeInMs" | "rateJitter";

interface SliderSpec<K extends string> {
	key: K;
	label: Bi;
	min: number;
	max: number;
	step: number;
	unit: string;
	decimals: number;
	note: Bi;
}

const BEND_SLIDERS: SliderSpec<NumericBendKey>[] = [
	{
		key: "targetCents",
		label: bi("推多高", "Target height"),
		min: 0,
		max: 300,
		step: 5,
		unit: "¢",
		decimals: 0,
		note: bi("100 音分 = 1 个半音。50 = ¼，100 = ½，200 = 全音", "100 cents = one semitone. 50 = ¼, 100 = ½, 200 = full"),
	},
	{
		key: "riseMs",
		label: bi("推上去用多久", "Rise time"),
		min: 20,
		max: 600,
		step: 5,
		unit: "ms",
		decimals: 0,
		note: bi("固定毫秒数，不随速度变；alphaTab 的快推是 75 ms", "fixed ms, not scaled by tempo; alphaTab's fast bend is 75 ms"),
	},
	{
		key: "overshootCents",
		label: bi("过冲", "Overshoot"),
		min: 0,
		max: 50,
		step: 1,
		unit: "¢",
		decimals: 0,
		note: bi("推过目标多少再坐回来；真人推弦常略推过头。0 = 正好停在目标", "push this far past the target, then sit back; players often do. 0 = land exactly"),
	},
	{
		key: "settleMs",
		label: bi("坐回来用多久", "Settle time"),
		min: 20,
		max: 400,
		step: 5,
		unit: "ms",
		decimals: 0,
		note: bi("只在过冲 > 0 时有效", "only when overshoot > 0"),
	},
	{
		key: "holdMs",
		label: bi("在最高点停多久", "Hold at the top"),
		min: 0,
		max: 1500,
		step: 10,
		unit: "ms",
		decimals: 0,
		note: bi("只对回落类有效；音符太短时会自动提前回落", "release variants only; moved earlier if the note is too short"),
	},
	{
		key: "releaseMs",
		label: bi("放回来用多久", "Release time"),
		min: 20,
		max: 600,
		step: 5,
		unit: "ms",
		decimals: 0,
		note: bi("只对回落类有效", "release variants only"),
	},
];

const VIBRATO_SLIDERS: SliderSpec<NumericVibratoKey>[] = [
	{
		key: "depthCents",
		label: bi("揉多深", "Depth"),
		min: 0,
		max: 150,
		step: 1,
		unit: "¢",
		decimals: 0,
		note: bi("真吉他：轻揉 15–35，大幅 50–100；alphaTab 用 50 / 100", "real guitar: slight 15–35, wide 50–100; alphaTab uses 50 / 100"),
	},
	{
		key: "rateHz",
		label: bi("每秒揉几次", "Rate"),
		min: 2,
		max: 10,
		step: 0.1,
		unit: "Hz",
		decimals: 1,
		note: bi("常见 5–7；alphaTab 约 5.3，TuxGuitar 约 6", "players sit at 5–7; alphaTab ≈5.3, TuxGuitar ≈6"),
	},
	{
		key: "onsetMs",
		label: bi("弹响后多久开始揉", "Onset delay"),
		min: 0,
		max: 600,
		step: 10,
		unit: "ms",
		decimals: 0,
		note: bi("真人揉弦不会一弹响就揉，通常晚 100–200 ms", "a real vibrato starts 100–200 ms after the pluck"),
	},
	{
		key: "fadeInMs",
		label: bi("幅度渐入", "Depth fade-in"),
		min: 0,
		max: 800,
		step: 10,
		unit: "ms",
		decimals: 0,
		note: bi("从 0 揉到设定深度用多久；0 = 一开始就是全深度", "time to reach full depth; 0 = full depth at once"),
	},
	{
		key: "rateJitter",
		label: bi("频率抖动", "Rate jitter"),
		min: 0,
		max: 0.4,
		step: 0.01,
		unit: "×",
		decimals: 2,
		note: bi("每一次揉的快慢随机偏差这么多；0 = 像节拍器一样死板", "each cycle's speed scattered by this much; 0 = metronomic"),
	},
];

const BEND_SHAPES: { value: BendShape; label: Bi; hint: Bi }[] = [
	{ value: "linear", label: bi("匀速", "linear"), hint: bi("音高直线上升（TuxGuitar 的做法）", "straight line (TuxGuitar)") },
	{ value: "ease-in", label: bi("先慢后快", "ease-in"), hint: bi("手指匀速推时弦真实的音高走向", "what the string does under a steady push") },
	{ value: "ease-in-out", label: bi("两头慢", "ease-in-out"), hint: bi("刻意、唱歌式的推弦", "a deliberate, sung bend") },
];

const WAVEFORMS: { value: VibratoWaveform; label: Bi; hint: Bi }[] = [
	{ value: "sine", label: bi("正弦", "sine"), hint: bi("圆滑（alphaTab）", "smooth (alphaTab)") },
	{ value: "triangle", label: bi("三角", "triangle"), hint: bi("直线推、直线放", "straight pushes and returns") },
	{ value: "square", label: bi("方波", "square"), hint: bi("TuxGuitar：在原音和最高点之间跳", "TuxGuitar: jumps between 0 and the top") },
];

const DURATIONS = [0.5, 1, 2, 3] as const;

function pct(value: number, min: number, max: number): number {
	return ((value - min) / (max - min)) * 100;
}

// ── TAB rendering ───────────────────────────────────────────────────────────
// Three quarter notes on the chosen string: plain, with the technique, and the
// fret the bend should reach. Bends are drawn here with VexFlow's Bend modifier
// (the app's own converter does not draw bends yet — #89).

const TAB_W = 460;
const TAB_H = 180;

function bendText(cents: number): string {
	if (cents >= 200) return "Full";
	if (cents >= 100) return "1/2";
	if (cents >= 50) return "1/4";
	return `${cents}¢`;
}

interface TechniqueTabProps {
	stringIndex: number;
	fret: number;
	bend: BendParams | null;
	vibrato: VibratoParams | null;
	captions: [string, string, string];
}

function TechniqueTab({ stringIndex, fret, bend, vibrato, captions }: TechniqueTabProps) {
	const ref = useRef<HTMLDivElement>(null);
	const targetFret = bend ? fret + Math.round(bend.targetCents / 100) : fret;

	useEffect(() => {
		const div = ref.current;
		if (!div) return;
		div.innerHTML = "";
		const renderer = new Renderer(div, Renderer.Backends.SVG);
		renderer.resize(TAB_W, TAB_H);
		const ctx = renderer.getContext();
		const stave = new TabStave(10, 20, TAB_W - 20);
		stave.addClef("tab").setContext(ctx).draw();

		const str = stringIndex + 1; // VexFlow strings are 1-based, high e = 1
		const notes = [
			new TabNote({ positions: [{ str, fret }], duration: "q" }),
			new TabNote({ positions: [{ str, fret }], duration: "q" }),
			new TabNote({ positions: [{ str, fret: targetFret }], duration: "q" }),
		];

		const expressed = notes[1];
		if (bend) {
			const text = bendText(bend.targetCents);
			if (bend.preBend) {
				expressed.addModifier(new Annotation(`PB ${text}`).setVerticalJustification(Annotation.VerticalJustify.TOP), 0);
				if (bend.release) expressed.addModifier(new Bend([{ type: Bend.DOWN, text: "" }]), 0);
			} else {
				const phrase = bend.release
					? [
							{ type: Bend.UP, text },
							{ type: Bend.DOWN, text: "" },
						]
					: [{ type: Bend.UP, text }];
				expressed.addModifier(new Bend(phrase), 0);
			}
		}
		if (vibrato) {
			const vib = new Vibrato();
			if (vibrato.depthCents >= 50) vib.setVibratoWidth(40);
			expressed.addModifier(vib, 0);
		}
		notes.forEach((n, i) => {
			// Pushed down a little so the caption clears the stave's bottom line.
			n.addModifier(
				new Annotation(captions[i]).setVerticalJustification(Annotation.VerticalJustify.BOTTOM).setYShift(12),
				0,
			);
		});

		const voice = new Voice({ numBeats: 3, beatValue: 4 }).addTickables(notes);
		new Formatter().joinVoices([voice]).format([voice], TAB_W - 90);
		voice.draw(ctx, stave);
		return () => {
			div.innerHTML = "";
		};
	}, [stringIndex, fret, targetFret, bend, vibrato, captions]);

	return <div ref={ref} className="mx-auto overflow-x-auto" style={{ minHeight: TAB_H, maxWidth: TAB_W }} />;
}

// ── Curve preview ───────────────────────────────────────────────────────────

const PREVIEW_W = 640;
const PREVIEW_H = 150;
const PREVIEW_PAD = 10;

function CurvePreview({ curve, bend, axisLabels }: { curve: ExpressionCurve; bend: BendParams | null; axisLabels: { x: string; y: string } }) {
	const { values, duration } = curve;
	let lo = 0;
	let hi = 50;
	for (const v of values) {
		if (v < lo) lo = v;
		if (v > hi) hi = v;
	}
	hi = Math.ceil(hi / 50) * 50;
	lo = Math.floor(lo / 50) * 50;
	const innerW = PREVIEW_W - PREVIEW_PAD * 2;
	const innerH = PREVIEW_H - PREVIEW_PAD * 2;
	const x = (i: number) => PREVIEW_PAD + (i / (values.length - 1)) * innerW;
	const y = (c: number) => PREVIEW_PAD + (1 - (c - lo) / (hi - lo)) * innerH;
	// One point per pixel column is plenty for a preview.
	const stride = Math.max(1, Math.floor(values.length / innerW));
	const pts: string[] = [];
	for (let i = 0; i < values.length; i += stride) pts.push(`${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`);
	pts.push(`${x(values.length - 1).toFixed(1)},${y(values[values.length - 1]).toFixed(1)}`);
	const timeline = bend ? bendTimeline(bend, duration) : null;
	const tx = (s: number) => PREVIEW_PAD + (s / duration) * innerW;

	return (
		<svg
			viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
			className="block w-full border border-line-strong"
			style={{ height: PREVIEW_H }}
			aria-label="pitch curve preview"
		>
			{Array.from({ length: (hi - lo) / 50 + 1 }, (_, k) => lo + k * 50).map((c) => (
				<g key={c}>
					<line
						x1={PREVIEW_PAD}
						x2={PREVIEW_W - PREVIEW_PAD}
						y1={y(c)}
						y2={y(c)}
						stroke={c === 0 ? "var(--ink-dim)" : "var(--line)"}
						strokeWidth={c === 0 ? 1 : 0.5}
					/>
					<text x={PREVIEW_PAD + 2} y={y(c) + (c === hi ? 9 : -2)} fontSize={8} fill="var(--ink-faint)">
						{c === 0 ? `0¢ ${axisLabels.y}` : `+${c}¢`}
					</text>
				</g>
			))}
			{timeline &&
				[timeline.peakS, timeline.settleEndS, timeline.releaseStartS, timeline.releaseEndS]
					.filter((s, i, arr) => s > 0 && s < duration && arr.indexOf(s) === i)
					.map((s) => (
						<line
							key={s}
							x1={tx(s)}
							x2={tx(s)}
							y1={PREVIEW_PAD}
							y2={PREVIEW_H - PREVIEW_PAD}
							stroke="var(--denim)"
							strokeOpacity={0.6}
							strokeDasharray="3 3"
							strokeWidth={0.75}
						/>
					))}
			<polyline points={pts.join(" ")} fill="none" stroke="var(--denim-accent)" strokeWidth={1.5} />
			<text x={PREVIEW_W - PREVIEW_PAD - 2} y={PREVIEW_H - PREVIEW_PAD - 2} fontSize={8} textAnchor="end" fill="var(--ink-faint)">
				{axisLabels.x} {duration.toFixed(1)} s
			</text>
		</svg>
	);
}

// ── Page ────────────────────────────────────────────────────────────────────

/** One measured note: what it should be, what it was. */
interface NoteReading {
	hz: number | null;
	clarity: number;
	/** Cents away from the equal-tempered pitch the note is meant to sound at. */
	centsOff: number | null;
	windowS: [number, number];
}

interface Measurement {
	plain: NoteReading;
	expressed: NoteReading;
	target: NoteReading;
	/** ② minus ③ as heard, in cents. */
	expressedVsTargetCents: number | null;
}

/** Fundamental in a window of an offline render, against a reference pitch. */
function readNote(data: Float32Array, sampleRate: number, windowS: [number, number], refHz: number): NoteReading {
	const seg = data.slice(Math.floor(windowS[0] * sampleRate), Math.floor(windowS[1] * sampleRate));
	const { hz, clarity } = estimatePitchHz(seg, sampleRate, { minHz: 60, maxHz: 1500 });
	return { hz, clarity, centsOff: hz === null ? null : centsBetween(hz, refHz), windowS };
}

function fmtCents(c: number | null): string {
	if (c === null) return "—";
	const r = Math.round(c);
	return `${r > 0 ? "+" : ""}${r}¢`;
}

export default function BendLabPage() {
	const [lang, setLang] = useState<Lang>("zh");
	const t = (s: Bi) => s[lang];
	const [measurement, setMeasurement] = useState<Measurement | null>(null);

	const [isLoaded, setIsLoaded] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [technique, setTechnique] = useState<LabTechnique>("bend-full");
	const [bendOn, setBendOn] = useState(true);
	const [vibratoOn, setVibratoOn] = useState(false);
	const [bend, setBend] = useState<BendParams>(DEFAULT_BEND_PARAMS);
	const [vibrato, setVibrato] = useState<VibratoParams>(DEFAULT_VIBRATO_PARAMS);

	const [stringIndex, setStringIndex] = useState(DEFAULT_STRING);
	const [fret, setFret] = useState(DEFAULT_FRET);
	const [durationS, setDurationS] = useState<number>(1);
	// Same rule as the engine's normal note: τ = duration × ratio, floored.
	const [decayRatio, setDecayRatio] = useState(0.8);

	const ctxRef = useRef<AudioContext | null>(null);
	const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

	const midi = soundingMidi(stringIndex, fret, 0);
	const targetMidi = bendOn ? midi + Math.round(bend.targetCents / 100) : midi;
	const decayTc = Math.max(durationS * decayRatio, MIN_DECAY_TC_S);

	const spec = useMemo<ExpressionSpec>(() => {
		const out: ExpressionSpec = {};
		if (bendOn) out.bend = bend;
		if (vibratoOn) out.vibrato = vibrato;
		return out;
	}, [bendOn, vibratoOn, bend, vibrato]);

	const curve = useMemo(() => composeExpression(spec, durationS), [spec, durationS]);

	const captions = useMemo<[string, string, string]>(
		() =>
			lang === "zh"
				? ["① 普通", "② 加技巧", "③ 目标品"]
				: ["① plain", "② technique", "③ target fret"],
		[lang],
	);

	// ── Audio ────────────────────────────────────────────────────────────────

	function ensureContext(): AudioContext {
		if (!ctxRef.current || ctxRef.current.state === "closed") {
			ctxRef.current = new AudioContext();
		}
		return ctxRef.current;
	}

	useEffect(() => {
		let cancelled = false;
		const ctx = ensureContext();
		preloadFingerpickPresets(ctx)
			.then(() => {
				if (!cancelled) setIsLoaded(true);
			})
			.catch((err: unknown) => {
				if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			cancelled = true;
			stopAll();
			const c = ctxRef.current;
			ctxRef.current = null;
			if (c && c.state !== "closed") void c.close();
		};
	}, []);

	function stopAll(): void {
		for (const src of sourcesRef.current) {
			try {
				src.stop();
			} catch {
				/* already ended */
			}
			src.disconnect();
		}
		sourcesRef.current.clear();
	}

	/**
	 * One plucked note through the real fingerpick preset. `expression` (if any) is
	 * the whole note's detune curve, set once on the note's own source — the same
	 * shape the scheduler will use. `playbackRate` stays the sample's pitch-correct
	 * rate, exactly as for a slide's origin voice.
	 */
	function scheduleNoteOn(
		ctx: BaseAudioContext,
		noteMidi: number,
		when: number,
		expression: ExpressionCurve | null,
	): { source: AudioBufferSourceNode; gainNode: GainNode } {
		const { buffer, playbackRate } = getFingerpickNoteData("pluck", noteMidi);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.playbackRate.value = playbackRate;
		if (expression) {
			source.detune.setValueCurveAtTime(expression.values, when + expression.startTime, expression.duration);
		}
		const gainNode = ctx.createGain();
		gainNode.gain.setValueAtTime(NOTE_GAIN, when);
		gainNode.gain.setTargetAtTime(0, when, decayTc);
		source.connect(gainNode).connect(ctx.destination);
		source.start(when);
		source.stop(when + durationS + SOURCE_STOP_BUFFER_S);
		return { source, gainNode };
	}

	function playNote(ctx: AudioContext, noteMidi: number, when: number, expression: ExpressionCurve | null): void {
		const { source, gainNode } = scheduleNoteOn(ctx, noteMidi, when, expression);
		sourcesRef.current.add(source);
		source.onended = () => {
			sourcesRef.current.delete(source);
			source.disconnect();
			gainNode.disconnect();
		};
	}

	/**
	 * Render one note offline (same preset, same scheduling as playback) and
	 * return its samples, so the lab can measure what the browser really plays.
	 */
	async function renderNote(sampleRate: number, noteMidi: number, expression: ExpressionCurve | null): Promise<Float32Array> {
		const off = new OfflineAudioContext(1, Math.ceil(sampleRate * (durationS + SOURCE_STOP_BUFFER_S)), sampleRate);
		scheduleNoteOn(off, noteMidi, 0, expression);
		const rendered = await off.startRendering();
		return rendered.getChannelData(0);
	}

	// Measure ① ② ③ whenever anything that shapes them changes. Attack transients
	// (the first ~150 ms of any pluck) are skipped; ② is read on its hold, after
	// the overshoot has settled and before any release.
	useEffect(() => {
		if (!isLoaded || !ctxRef.current) return;
		const sampleRate = ctxRef.current.sampleRate;
		let cancelled = false;
		const timer = setTimeout(async () => {
			try {
				const attackS = 0.15;
				const plainWindow: [number, number] = [attackS, Math.max(attackS + 0.1, Math.min(durationS, 0.5))];
				let holdWindow: [number, number] = plainWindow;
				let topCents = 0;
				if (bendOn) {
					const tl = bendTimeline(bend, durationS);
					const from = Math.max(attackS, tl.settleEndS + 0.03);
					const to = tl.releaseStartS - 0.02;
					holdWindow = to - from >= 0.08 ? [from, Math.min(to, from + 0.35)] : [from, Math.min(durationS, from + 0.2)];
					topCents = bend.targetCents;
				}
				const baseHz = midiToHz(midi);
				const [plainData, expressedData, targetData] = await Promise.all([
					renderNote(sampleRate, midi, null),
					renderNote(sampleRate, midi, curve),
					renderNote(sampleRate, targetMidi, null),
				]);
				if (cancelled) return;
				const plain = readNote(plainData, sampleRate, plainWindow, baseHz);
				const expressed = readNote(expressedData, sampleRate, holdWindow, baseHz * Math.pow(2, topCents / 1200));
				const target = readNote(targetData, sampleRate, plainWindow, midiToHz(targetMidi));
				setMeasurement({
					plain,
					expressed,
					target,
					expressedVsTargetCents:
						expressed.hz !== null && target.hz !== null ? centsBetween(expressed.hz, target.hz) : null,
				});
			} catch {
				if (!cancelled) setMeasurement(null);
			}
		}, 150);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoaded, curve, midi, targetMidi, durationS, decayTc, bendOn, bend]);

	async function begin(): Promise<{ ctx: AudioContext; now: number }> {
		const ctx = ensureContext();
		if (ctx.state === "suspended") await ctx.resume();
		stopAll();
		return { ctx, now: ctx.currentTime + 0.02 };
	}

	/** ② alone. */
	async function playExpressed(): Promise<void> {
		const { ctx, now } = await begin();
		playNote(ctx, midi, now, curve);
	}

	/** ① alone. */
	async function playPlain(): Promise<void> {
		const { ctx, now } = await begin();
		playNote(ctx, midi, now, null);
	}

	/** ① then ② — the A/B the lab exists for. */
	async function playAB(): Promise<void> {
		const { ctx, now } = await begin();
		playNote(ctx, midi, now, null);
		playNote(ctx, midi, now + durationS + NOTE_GAP_S, curve);
	}

	/** ② then ③ — does the bend actually reach the fret it should? */
	async function playAgainstTarget(): Promise<void> {
		const { ctx, now } = await begin();
		playNote(ctx, midi, now, curve);
		playNote(ctx, targetMidi, now + durationS + NOTE_GAP_S, null);
	}

	/** ① ② ③ in a row. */
	async function playAll(): Promise<void> {
		const { ctx, now } = await begin();
		playNote(ctx, midi, now, null);
		playNote(ctx, midi, now + (durationS + NOTE_GAP_S), curve);
		playNote(ctx, targetMidi, now + 2 * (durationS + NOTE_GAP_S), null);
	}

	// ── Handlers ─────────────────────────────────────────────────────────────

	// A chip loads its technique's spec on top of the tuned numbers, so tweaks to
	// rise/shape/onset survive switching chips; only what the chip names (height,
	// pre-bend/release, slight vs wide depth and rate) is overwritten.
	function applyTechnique(next: LabTechnique, b: BendParams, v: VibratoParams): void {
		const s = expressionForTechnique(next, undefined, {
			bend: b,
			vibrato: { ...v, depthCents: DEFAULT_VIBRATO_PARAMS.depthCents, rateHz: DEFAULT_VIBRATO_PARAMS.rateHz },
			wideVibrato: { ...v, depthCents: WIDE_VIBRATO_PARAMS.depthCents, rateHz: WIDE_VIBRATO_PARAMS.rateHz },
		});
		if (!s) return;
		setBendOn(s.bend !== undefined);
		setVibratoOn(s.vibrato !== undefined);
		if (s.bend) setBend(s.bend);
		if (s.vibrato) setVibrato(s.vibrato);
	}

	function chooseTechnique(next: LabTechnique): void {
		setTechnique(next);
		applyTechnique(next, bend, vibrato);
	}

	function resetDefaults(): void {
		setDurationS(1);
		setDecayRatio(0.8);
		setBend(DEFAULT_BEND_PARAMS);
		setVibrato(DEFAULT_VIBRATO_PARAMS);
		applyTechnique(technique, DEFAULT_BEND_PARAMS, DEFAULT_VIBRATO_PARAMS);
	}

	const chip = (active: boolean) =>
		`border px-2 py-1 text-left text-xs ${active ? "border-denim bg-denim text-[var(--btn-on-denim)]" : "border-line-strong text-ink-dim"}`;
	const btn = "border border-line-strong px-3 py-1.5 text-xs text-ink-dim disabled:opacity-40";

	const bendDeviated = (key: NumericBendKey) => Math.abs(bend[key] - DEFAULT_BEND_PARAMS[key]) > 1e-9;
	const vibDeviated = (key: NumericVibratoKey) => Math.abs(vibrato[key] - DEFAULT_VIBRATO_PARAMS[key]) > 1e-9;

	const tabBend = bendOn ? bend : null;
	const tabVibrato = vibratoOn ? vibrato : null;
	const defaultRiseLabel = BEND_SHAPES.find((s) => s.value === DEFAULT_BEND_PARAMS.riseShape)?.label ?? bi("", "");
	const defaultWaveLabel = WAVEFORMS.find((w) => w.value === DEFAULT_VIBRATO_PARAMS.waveform)?.label ?? bi("", "");

	return (
		<div className="mx-auto max-w-5xl p-6 font-mono text-ink">
			<div className="flex items-baseline justify-between">
				<h1 className="text-lg font-bold">{t(bi("推弦 / 揉弦 试听台", "Bend Lab"))}</h1>
				<div className="flex gap-1 text-xs">
					<button type="button" onClick={() => setLang("zh")} aria-pressed={lang === "zh"} className={chip(lang === "zh")}>
						中文
					</button>
					<button type="button" onClick={() => setLang("en")} aria-pressed={lang === "en"} className={chip(lang === "en")}>
						English
					</button>
				</div>
			</div>
			<p className="mt-1 mb-4 text-xs text-ink-dim">
				{t(
					bi(
						"这一页用来给推弦和揉弦挑一套听起来对的参数。谱上三个音：① 普通弹，② 加了技巧，③ 推弦应该到达的那个品。下面的曲线是 ② 的音高走向。这里的东西还没接进真正的播放器。",
						"Pick bend and vibrato settings by ear. Three notes on the tab: ① plain, ② with the technique, ③ the fret the bend should reach. The curve below is note ②'s pitch over time. Nothing here is wired into the real player yet.",
					),
				)}
			</p>

			{/* ── TAB ───────────────────────────────────────────────────────── */}
			<div className="border border-line-strong p-2">
				<TechniqueTab stringIndex={stringIndex} fret={fret} bend={tabBend} vibrato={tabVibrato} captions={captions} />
			</div>

			{/* ── Transport ─────────────────────────────────────────────────── */}
			<div className="mt-4 flex flex-wrap items-center gap-2 border border-line-strong p-4">
				<button type="button" onClick={() => void playPlain()} disabled={!isLoaded} className={btn}>
					▶ ① {t(bi("普通", "plain"))}
				</button>
				<button
					type="button"
					onClick={() => void playExpressed()}
					disabled={!isLoaded}
					className="border border-denim bg-denim px-4 py-1.5 text-xs text-[var(--btn-on-denim)] disabled:opacity-40"
				>
					▶ ② {t(bi("加技巧", "technique"))}
				</button>
				<button type="button" onClick={() => void playAB()} disabled={!isLoaded} className={btn}>
					▶ ① → ② {t(bi("对比", "compare"))}
				</button>
				<button
					type="button"
					onClick={() => void playAgainstTarget()}
					disabled={!isLoaded || !bendOn}
					className={btn}
					title={t(bi("听推弦有没有推到位", "hear whether the bend reaches the fret it should"))}
				>
					▶ ② → ③ {t(bi("到位了吗", "on pitch?"))}
				</button>
				<button type="button" onClick={() => void playAll()} disabled={!isLoaded} className={btn}>
					▶ ① ② ③
				</button>
				<button type="button" onClick={stopAll} className={btn}>
					■ {t(bi("停", "stop"))}
				</button>
				<button type="button" onClick={resetDefaults} className={btn}>
					↺ {t(bi("恢复默认", "reset defaults"))}
				</button>
				{!isLoaded && !loadError && (
					<span className="text-xs text-ink-faint">{t(bi("正在加载吉他采样…", "loading guitar samples…"))}</span>
				)}
				{loadError && (
					<span className="text-xs text-red-600">
						{t(bi("采样加载失败：", "samples failed: "))}
						{loadError}
					</span>
				)}
			</div>

			{/* ── Curve ─────────────────────────────────────────────────────── */}
			<div className="mt-4">
				<div className="mb-1 text-xs text-ink">
					{t(bi("② 的音高走向", "Pitch of note ②"))}{" "}
					<span className="text-ink-faint">
						{t(
							bi(
								"横轴时间，纵轴比原音高多少（音分，100 = 一个半音）。虚线是推弦到顶 / 开始回落 / 回落完成的时刻。",
								"time across, cents above the fretted pitch up (100 = one semitone). Dashed lines: bend reaches the top / release starts / release ends.",
							),
						)}
					</span>
				</div>
				<CurvePreview curve={curve} bend={tabBend} axisLabels={{ x: t(bi("时长", "length")), y: t(bi("原音", "fretted")) }} />
				<div className="mt-2 border border-line-strong p-3 text-xs" data-testid="measurement">
					<div className="mb-1 text-ink">
						{t(bi("实测音高", "Measured pitch"))}{" "}
						<span className="text-ink-faint">
							{t(
								bi(
									"（在你这个浏览器里离线渲染 ①②③，跳过起音瞬态后算基频；② 取推到顶、坐稳之后那一段）",
									"(①②③ rendered offline in this browser, fundamental read after the attack; ② read on its hold after settling)",
								),
							)}
						</span>
					</div>
					{measurement ? (
						<div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
							{(
								[
									{ label: t(bi("① 普通", "① plain")), r: measurement.plain, ref: pitchLabel(midi, "scientific") },
									{
										label: t(bi("② 推到顶", "② at the top")),
										r: measurement.expressed,
										ref: bendOn ? `${pitchLabel(midi, "scientific")} +${Math.round(bend.targetCents)}¢` : pitchLabel(midi, "scientific"),
									},
									{ label: t(bi("③ 目标品", "③ target fret")), r: measurement.target, ref: pitchLabel(targetMidi, "scientific") },
								] as { label: string; r: NoteReading; ref: string }[]
							).map(({ label, r, ref }) => (
								<div key={label}>
									<span className="text-ink">{label}</span>{" "}
									<span className="tabular-nums">{r.hz === null ? "—" : `${r.hz.toFixed(1)} Hz`}</span>{" "}
									<span className={`tabular-nums ${r.centsOff !== null && Math.abs(r.centsOff) > 10 ? "text-red-600" : "text-denim-accent"}`}>
										{fmtCents(r.centsOff)}
									</span>
									<span className="block text-[10px] text-ink-faint">
										{t(bi("应为", "should be"))} {ref} · {r.windowS[0].toFixed(2)}–{r.windowS[1].toFixed(2)} s ·{" "}
										{t(bi("清晰度", "clarity"))} {r.clarity.toFixed(2)}
									</span>
								</div>
							))}
							<div className="sm:col-span-3 text-ink-dim">
								{t(bi("② 比 ③", "② vs ③"))}{" "}
								<span className="tabular-nums text-denim-accent">{fmtCents(measurement.expressedVsTargetCents)}</span>{" "}
								<span className="text-ink-faint">
									{t(bi("（0 = 推弦的顶和目标品一样高；负 = 没推到；正 = 推过了）", "(0 = the bend's top is the target fret; negative = flat; positive = sharp)"))}
								</span>
							</div>
						</div>
					) : (
						<span className="text-ink-faint">{isLoaded ? t(bi("计算中…", "measuring…")) : t(bi("等采样加载", "waiting for samples"))}</span>
					)}
				</div>
			</div>

			{/* ── Technique + note ───────────────────────────────────────────── */}
			<div className="mt-4 grid grid-cols-1 gap-4 border border-line-strong p-4 sm:grid-cols-[2fr_1fr]">
				<div>
					<div className="mb-2 text-xs text-ink">{t(bi("技巧", "Technique"))}</div>
					<div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
						{TECHNIQUES.map((tc) => (
							<button
								key={tc.value}
								type="button"
								onClick={() => chooseTechnique(tc.value)}
								aria-pressed={technique === tc.value}
								title={t(tc.hint)}
								className={chip(technique === tc.value)}
							>
								{t(tc.label)}
								<span className="block text-[9px] text-ink-faint">{t(tc.hint)}</span>
							</button>
						))}
					</div>
					<div className="mt-3 flex flex-wrap gap-3 text-xs">
						<label className="flex items-center gap-1">
							<input type="checkbox" checked={bendOn} onChange={(e) => setBendOn(e.target.checked)} />
							{t(bi("推弦层", "bend layer"))}
						</label>
						<label className="flex items-center gap-1">
							<input type="checkbox" checked={vibratoOn} onChange={(e) => setVibratoOn(e.target.checked)} />
							{t(bi("揉弦层", "vibrato layer"))}
							<span className="text-ink-faint">
								{t(bi("（两层都开 = 推到顶后在顶上揉，回落时停）", "(both on = vibrato on top of the bend, stops at the release)"))}
							</span>
						</label>
					</div>
				</div>

				<div>
					<div className="mb-2 text-xs text-ink">
						{t(bi("音", "Note"))} <span className="text-denim-accent">{pitchLabel(midi, "scientific")}</span>{" "}
						<span className="text-ink-faint">midi {midi}</span>
					</div>
					<div className="flex flex-wrap gap-1">
						{STRING_NAMES.map((name, i) => (
							<button key={name} type="button" onClick={() => setStringIndex(i)} aria-pressed={stringIndex === i} className={chip(stringIndex === i)}>
								{name}
							</button>
						))}
					</div>
					<div className="mt-2">
						<div className="mb-1 flex items-baseline justify-between text-xs">
							<span>{t(bi("品", "Fret"))}</span>
							<span className="tabular-nums text-denim-accent">{fret}</span>
						</div>
						<Fader ariaLabel="Fret" min={0} max={15} step={1} value={fret} onValue={setFret} scale={["0", "15"]} />
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
						<span className="mr-1">{t(bi("每个音多长", "Note length"))}</span>
						{DURATIONS.map((d) => (
							<button key={d} type="button" onClick={() => setDurationS(d)} aria-pressed={durationS === d} className={chip(durationS === d)}>
								{d} s
							</button>
						))}
					</div>
					<div className="mt-2">
						<div className="mb-1 flex items-baseline justify-between text-xs">
							<span>
								{t(bi("衰减快慢", "Decay"))} <span className="text-ink-faint">(τ = {decayTc.toFixed(2)} s)</span>
							</span>
							<span className="tabular-nums text-denim-accent">{decayRatio.toFixed(2)}</span>
						</div>
						<Fader
							ariaLabel="Decay ratio"
							min={0.2}
							max={2}
							step={0.05}
							value={decayRatio}
							onValue={setDecayRatio}
							ticks={[pct(0.8, 0.2, 2)]}
							tickValues={[0.8]}
							tickLabels={[t(bi("播放器的值：0.8 × 音长", "engine: 0.8 × length"))]}
							scale={["0.2", "2"]}
						/>
						<p className="mt-1 text-[10px] text-ink-faint">{t(bi("调大一点能听清晚一些的回落", "raise it to hear a late release clearly"))}</p>
					</div>
				</div>
			</div>

			{/* ── Bend params ───────────────────────────────────────────────── */}
			<div className={`mt-4 border border-line-strong p-4 ${bendOn ? "" : "opacity-50"}`}>
				<div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
					<span className="text-ink">{t(bi("推弦", "Bend"))}</span>
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={bend.preBend} onChange={(e) => setBend({ ...bend, preBend: e.target.checked })} />
						{t(bi("预推弦", "pre-bend"))}{" "}
						<span className="text-ink-faint">{t(bi("（先推好再弹，一出声就是高音）", "(bent before the pluck)"))}</span>
					</label>
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={bend.release} onChange={(e) => setBend({ ...bend, release: e.target.checked })} />
						{t(bi("回落", "release"))} <span className="text-ink-faint">{t(bi("（推上去再放回原音）", "(come back down)"))}</span>
					</label>
				</div>
				<div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
					{BEND_SLIDERS.map((s) => {
						const value = bend[s.key];
						const def = DEFAULT_BEND_PARAMS[s.key];
						return (
							<div key={s.key}>
								<div className="mb-1 flex items-baseline justify-between">
									<span className="text-xs text-ink">{t(s.label)}</span>
									<span className={`text-xs tabular-nums ${bendDeviated(s.key) ? "text-denim-accent" : "text-ink-dim"}`}>
										{value.toFixed(s.decimals)}
										{s.unit}
									</span>
								</div>
								<Fader
									ariaLabel={s.label.en}
									min={s.min}
									max={s.max}
									step={s.step}
									value={value}
									onValue={(v) => setBend({ ...bend, [s.key]: v })}
									ticks={[pct(def, s.min, s.max)]}
									tickValues={[def]}
									tickLabels={[`${t(bi("默认", "default"))} ${def}`]}
									scale={[String(s.min), String(s.max)]}
								/>
								<p className="mt-1 text-[10px] text-ink-faint">
									{t(bi("默认", "default"))} {def}
									{s.unit} · {t(s.note)}
								</p>
							</div>
						);
					})}
					<div>
						<div className="mb-2 text-xs text-ink">
							{t(bi("推上去的曲线", "Rise shape"))}{" "}
							<span className="text-ink-faint">
								({t(bi("默认", "default"))} {t(defaultRiseLabel)})
							</span>
						</div>
						<div className="flex flex-col gap-1">
							{BEND_SHAPES.map((sh) => (
								<button key={sh.value} type="button" onClick={() => setBend({ ...bend, riseShape: sh.value })} aria-pressed={bend.riseShape === sh.value} className={chip(bend.riseShape === sh.value)}>
									{t(sh.label)}
									<span className="block text-[9px] text-ink-faint">{t(sh.hint)}</span>
								</button>
							))}
						</div>
					</div>
					<div>
						<div className="mb-2 text-xs text-ink">
							{t(bi("放回来的曲线", "Release shape"))}{" "}
							<span className="text-ink-faint">
								{t(bi("（同一条曲线倒着走：先慢后快 = 放的时候先快后慢）", "(same curve read backwards: ease-in drops fast first)"))}
							</span>
						</div>
						<div className="flex flex-col gap-1">
							{BEND_SHAPES.map((sh) => (
								<button key={sh.value} type="button" onClick={() => setBend({ ...bend, releaseShape: sh.value })} aria-pressed={bend.releaseShape === sh.value} className={chip(bend.releaseShape === sh.value)}>
									{t(sh.label)}
								</button>
							))}
						</div>
					</div>
				</div>
			</div>

			{/* ── Vibrato params ────────────────────────────────────────────── */}
			<div className={`mt-4 border border-line-strong p-4 ${vibratoOn ? "" : "opacity-50"}`}>
				<div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
					<span className="text-ink">{t(bi("揉弦", "Vibrato"))}</span>
					<label className="flex items-center gap-1">
						<input type="checkbox" checked={!vibrato.symmetric} onChange={(e) => setVibrato({ ...vibrato, symmetric: !e.target.checked })} />
						{t(bi("只往上揉", "only above the note"))}{" "}
						<span className="text-ink-faint">
							{t(bi("（手指揉弦只会把音推高，不会低于原音；关掉 = 上下对称的电子味揉弦）", "(a finger only pushes the string up; off = ±depth synth vibrato)"))}
						</span>
					</label>
				</div>
				<div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
					{VIBRATO_SLIDERS.map((s) => {
						const value = vibrato[s.key];
						const def = DEFAULT_VIBRATO_PARAMS[s.key];
						return (
							<div key={s.key}>
								<div className="mb-1 flex items-baseline justify-between">
									<span className="text-xs text-ink">{t(s.label)}</span>
									<span className={`text-xs tabular-nums ${vibDeviated(s.key) ? "text-denim-accent" : "text-ink-dim"}`}>
										{value.toFixed(s.decimals)}
										{s.unit}
									</span>
								</div>
								<Fader
									ariaLabel={s.label.en}
									min={s.min}
									max={s.max}
									step={s.step}
									value={value}
									onValue={(v) => setVibrato({ ...vibrato, [s.key]: v })}
									ticks={[pct(def, s.min, s.max)]}
									tickValues={[def]}
									tickLabels={[`${t(bi("默认", "default"))} ${def}`]}
									scale={[String(s.min), String(s.max)]}
								/>
								<p className="mt-1 text-[10px] text-ink-faint">
									{t(bi("默认", "default"))} {def}
									{s.unit} · {t(s.note)}
								</p>
							</div>
						);
					})}
					<div>
						<div className="mb-2 text-xs text-ink">
							{t(bi("波形", "Waveform"))}{" "}
							<span className="text-ink-faint">
								({t(bi("默认", "default"))} {t(defaultWaveLabel)})
							</span>
						</div>
						<div className="flex flex-col gap-1">
							{WAVEFORMS.map((w) => (
								<button key={w.value} type="button" onClick={() => setVibrato({ ...vibrato, waveform: w.value })} aria-pressed={vibrato.waveform === w.value} className={chip(vibrato.waveform === w.value)}>
									{t(w.label)}
									<span className="block text-[9px] text-ink-faint">{t(w.hint)}</span>
								</button>
							))}
						</div>
						<div className="mt-3 flex items-center gap-2 text-xs">
							<span>{t(bi("抖动的随机种子", "Jitter seed"))}</span>
							<button type="button" onClick={() => setVibrato({ ...vibrato, seed: vibrato.seed + 1 })} className="border border-line-strong px-2 py-0.5 text-ink-dim">
								{vibrato.seed} → {t(bi("换一个", "next"))}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* ── Plain-language notes ──────────────────────────────────────── */}
			<div className="mt-6 space-y-3 text-[11px] leading-relaxed text-ink-dim">
				<p>
					<span className="text-ink">{t(bi("怎么做的。", "How it works."))}</span>{" "}
					{t(
						bi(
							"不换采样，也不合成新声音：还是弹那一个音，只是在它响着的时候把音高往上拉（推弦）或来回晃（揉弦）。alphaTab、TuxGuitar、Guitar Pro 都是这么做的。我们之前的滑音就是同一个办法。",
							"No special sample, no synthesis: the same plucked note keeps sounding and its pitch is pulled up (bend) or wobbled (vibrato) while it rings. alphaTab, TuxGuitar and Guitar Pro all do it this way; our slide already does.",
						),
					)}
				</p>
				<p>
					<span className="text-ink">{t(bi("上次为什么难听。", "Why the earlier try sounded wrong."))}</span>{" "}
					{t(
						bi(
							"两个原因：揉弦上下对称（像合成器），而真人手指只能把弦推高；推弦时间跟着速度变（慢速时整个音都在滑，听起来像滑音）。这次揉弦只往上，推弦固定用毫秒计。",
							"Two things: the vibrato was symmetric (a synth sound) while a finger can only push the string up, and the bend was spread over the note, which reads as a slide at slow tempos. Now the vibrato goes up only and the bend takes a fixed number of milliseconds.",
						),
					)}
				</p>
				<p>
					<span className="text-ink">{t(bi("默认值是怎么定的。", "Where the defaults come from."))}</span>{" "}
					{t(
						bi(
							`推弦：${DEFAULT_BEND_PARAMS.riseMs} ms 推到顶，先慢后快（弦的物理就是这样，手指匀速推，音高先慢后快）；回落 ${DEFAULT_BEND_PARAMS.releaseMs} ms，顶上停 ${DEFAULT_BEND_PARAMS.holdMs} ms。揉弦：${DEFAULT_VIBRATO_PARAMS.depthCents} 音分、每秒 ${DEFAULT_VIBRATO_PARAMS.rateHz} 次、弹响 ${DEFAULT_VIBRATO_PARAMS.onsetMs} ms 后才开始、${DEFAULT_VIBRATO_PARAMS.fadeInMs} ms 内揉到全深度、快慢有 ${Math.round(DEFAULT_VIBRATO_PARAMS.rateJitter * 100)}% 的随机；大幅揉弦 ${WIDE_VIBRATO_PARAMS.depthCents} 音分、每秒 ${WIDE_VIBRATO_PARAMS.rateHz} 次。参考：alphaTab 轻揉 ±50 音分约 5.3 Hz、大幅 ±100；TuxGuitar 在 0 和 +36 音分之间跳，约 6 Hz。这些数字还没用耳朵定稿，就是给这一页调的。`,
							`Bend: ${DEFAULT_BEND_PARAMS.riseMs} ms to the top, slow-then-fast (that is what a string does under a steady push); release ${DEFAULT_BEND_PARAMS.releaseMs} ms after ${DEFAULT_BEND_PARAMS.holdMs} ms at the top. Vibrato: ${DEFAULT_VIBRATO_PARAMS.depthCents} cents, ${DEFAULT_VIBRATO_PARAMS.rateHz} per second, starting ${DEFAULT_VIBRATO_PARAMS.onsetMs} ms after the pluck, full depth after ${DEFAULT_VIBRATO_PARAMS.fadeInMs} ms, speed scattered by ${Math.round(DEFAULT_VIBRATO_PARAMS.rateJitter * 100)}%; wide is ${WIDE_VIBRATO_PARAMS.depthCents} cents at ${WIDE_VIBRATO_PARAMS.rateHz} per second. References: alphaTab slight ±50 cents at ≈5.3 Hz, wide ±100; TuxGuitar jumps between 0 and +36 cents at ≈6 Hz. None of this is final — this page is for choosing.`,
						),
					)}
				</p>
				<p>
					<span className="text-ink">{t(bi("如果觉得推弦没推到位。", "If the bend sounds flat."))}</span>{" "}
					{t(
						bi(
							"先看上面的实测：② 比 ③ 是 0¢ 的话，频率上已经到了，是听感问题。原因是最响的起音是没推的那段，推到顶时音已经在衰减，耳朵记住的是起音。可以试：加一点过冲（15–25¢）再坐回来；把推上去的时间缩到 75–100 ms；曲线换成匀速；或者把揉弦层也打开，真人推到顶几乎都会揉。",
							"Check the measurement first: if ② vs ③ reads 0¢, the frequency is there and it is perception. The loudest part of a pluck is the attack, which is unbent; by the top the note has decayed, so the ear remembers the attack. Try a little overshoot (15–25¢) that settles back, a shorter rise (75–100 ms), a linear curve, or the vibrato layer on top — players almost always vibrato the top of a bend.",
						),
					)}
				</p>
				<p>
					<span className="text-ink">{t(bi("给工程师的一句。", "One line for engineers."))}</span>{" "}
					{t(
						bi(
							"曲线是 fingerpickExpression.ts 算出来的一条 Float32Array（音分），整段一次性放到该音 source 的 detune 上（setValueCurveAtTime）；playbackRate 留给滑音，两者相乘互不干扰。音量包络不动，所以技巧不会让音变短。",
							"The curve is one Float32Array of cents from fingerpickExpression.ts, set once on the note's own source via detune.setValueCurveAtTime; playbackRate stays the slide's, and the two multiply. The gain envelope is untouched, so a technique never shortens a note.",
						),
					)}
				</p>
			</div>
		</div>
	);
}
