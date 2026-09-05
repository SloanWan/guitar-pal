"use client";

import { useEffect, useRef, useState } from "react";

import {
	parsePresetFromJs,
	findZoneForMidi,
	_decodeZone,
	STRUM_PITCHES,
	DECAY_TIME_CONSTANT_RATIO,
	MIN_DECAY_TC_S,
	SOURCE_STOP_BUFFER_S,
	MUTED_MAX_DURATION_S,
	type WafPreset,
	type WafZone,
} from "@/components/strum/useGuitarSampleLoader";

// The lab drives the CDN directly so it can audition presets the production
// loader does not ship with. Parsing, zone selection and sample decoding are the
// production functions — only the envelope is re-implemented here, since that is
// what the lab exists to vary.
const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";

interface PresetOption {
	label: string;
	/** CDN file name without the .js extension; the variable is `_tone_<key>`. */
	key: string;
	note: string;
}

const PRESET_OPTIONS: readonly PresetOption[] = [
	{
		label: "Steel — LK Acoustic (production down/up)",
		key: "0250_LK_AcousticSteel_SF2_file",
		note: "What /strum plays today for D and U.",
	},
	{ label: "Steel — JCLive", key: "0250_JCLive_sf2_file", note: "Brighter pick attack." },
	{ label: "Steel — FluidR3", key: "0250_FluidR3_GM_sf2_file", note: "Rounder, more body." },
	{ label: "Steel — Aspirin", key: "0250_Aspirin_sf2_file", note: "Thin, very short tail." },
	{ label: "Steel — SoundBlasterOld", key: "0250_SoundBlasterOld_sf2", note: "Older GM voice." },
	{ label: "Nylon classical", key: "0240_Aspirin_sf2_file", note: "Softer attack, quick decay." },
	{ label: "Jazz electric", key: "0260_Aspirin_sf2_file", note: "Clean electric, long sustain." },
	{ label: "Clean electric", key: "0270_Aspirin_sf2_file", note: "Longer ring than steel." },
	{
		label: "Muted — Chaos (production X)",
		key: "0280_Chaos_sf2_file",
		note: "What /strum plays today for X.",
	},
	{ label: "Muted — FluidR3", key: "0280_FluidR3_GM_sf2_file", note: "Fuller chuck." },
];

type DecayStrategy = "production" | "linear" | "ahdsr" | "letRing" | "hardCut";

interface StrategyOption {
	id: DecayStrategy;
	label: string;
	note: string;
}

const STRATEGIES: readonly StrategyOption[] = [
	{
		id: "production",
		label: "Exponential τ (production)",
		note: "setTargetAtTime(0) from the attack, τ = ratio × cell, floored. No hold phase.",
	},
	{
		id: "linear",
		label: "Hold + linear ramp",
		note: "Full gain for the hold fraction of the cell, then a straight line to silence at the cell end.",
	},
	{
		id: "ahdsr",
		label: "AHDSR",
		note: "5 ms attack, decay to the sustain level, release over the last fifth of the cell.",
	},
	{
		id: "letRing",
		label: "Let ring",
		note: "No decay inside the cell: the note rings for the ring length, so consecutive strums overlap.",
	},
	{
		id: "hardCut",
		label: "Hard cut",
		note: "Constant gain, source stopped exactly on the cell boundary. Reference for what clicking sounds like.",
	},
];

/** The strum shapes the lab can play, mirroring the production cell values. */
type StrumType = "down" | "up" | "muted";

/** Which string the per-note volume taper works away from. */
type TaperMode = "sweep" | "low" | "high" | "flat";

const TAPER_MODES: readonly { id: TaperMode; label: string; note: string }[] = [
	{
		id: "sweep",
		label: "Follows the hand (production)",
		note: "Loudest where the stroke starts, fading as it crosses. The same chord is bass-heavy struck down and treble-heavy struck up.",
	},
	{
		id: "low",
		label: "Always loudest on the treble strings",
		note: "The thin strings sing and the bass sits back, whichever way the hand moves.",
	},
	{
		id: "high",
		label: "Always loudest on the bass strings",
		note: "The thick strings dominate, whichever way the hand moves.",
	},
	{ id: "flat", label: "Every string the same", note: "Ignores the taper strength." },
];

/**
 * Volume of one note of a strum.
 *
 * @param sweepIndex  position in the sweep (0 = struck first)
 * @param pitchRank   position in the chord low→high (0 = lowest note)
 * @param count       notes in this strum
 */
function noteVolume(
	mode: TaperMode,
	taper: number,
	sweepIndex: number,
	pitchRank: number,
	count: number,
): number {
	switch (mode) {
		case "sweep":
			return Math.pow(taper, sweepIndex);
		case "low":
			return Math.pow(taper, count - 1 - pitchRank);
		case "high":
			return Math.pow(taper, pitchRank);
		case "flat":
			return 1;
	}
}

/** One bar of "old faithful" (D · DU · UD · D) as eighth-note cells. */
const TEST_BAR: readonly (StrumType | null)[] = [
	"down",
	null,
	"down",
	"up",
	null,
	"up",
	"down",
	null,
];

// ─── Preset loading ───────────────────────────────────────────────────────────

const presetCache = new Map<string, Promise<WafPreset>>();

async function loadPreset(key: string): Promise<WafPreset> {
	const cached = presetCache.get(key);
	if (cached) return cached;
	const pending = (async () => {
		const res = await fetch(`${WAF_BASE_URL}${key}.js`);
		if (!res.ok) throw new Error(`CDN ${res.status} for ${key}`);
		return parsePresetFromJs(await res.text(), `_tone_${key}`);
	})();
	presetCache.set(key, pending);
	return pending;
}

/** Decode only the zones the chord needs — a full preset decode is seconds of work. */
async function ensureZones(
	preset: WafPreset,
	pitches: readonly number[],
	ctx: AudioContext,
): Promise<void> {
	const zones = new Set<WafZone>(pitches.map((midi) => findZoneForMidi(preset, midi)));
	await Promise.all(
		[...zones].map(async (zone) => {
			if (!zone.buffer) zone.buffer = await _decodeZone(zone, ctx);
		}),
	);
}

// ─── Envelope ─────────────────────────────────────────────────────────────────

interface EnvelopeSettings {
	strategy: DecayStrategy;
	/** production: τ = decayRatio × cell. linear: hold fraction. ahdsr: decay fraction. */
	decayRatio: number;
	/** production only — floor under τ, guarding the click at fast tempos. */
	minDecayTc: number;
	/** ahdsr only. */
	sustainLevel: number;
	/** letRing only, in seconds. */
	ringSeconds: number;
	/** Muted cells cap their duration here, as production does. */
	capMuted: boolean;
}

const PRODUCTION_SETTINGS: EnvelopeSettings = {
	strategy: "production",
	decayRatio: DECAY_TIME_CONSTANT_RATIO,
	minDecayTc: MIN_DECAY_TC_S,
	sustainLevel: 0.35,
	ringSeconds: 1.6,
	capMuted: true,
};

/** How long the source must stay alive for a given strategy and cell length. */
function sourceLifetime(settings: EnvelopeSettings, cellSeconds: number): number {
	if (settings.strategy === "letRing") return settings.ringSeconds + SOURCE_STOP_BUFFER_S;
	if (settings.strategy === "hardCut") return cellSeconds;
	return cellSeconds + SOURCE_STOP_BUFFER_S;
}

/** Write the chosen envelope onto one note's gain. Returns when to stop the source. */
function applyEnvelope(
	gain: GainNode,
	when: number,
	volume: number,
	cellSeconds: number,
	settings: EnvelopeSettings,
): number {
	const stopAt = when + sourceLifetime(settings, cellSeconds);
	const g = gain.gain;

	switch (settings.strategy) {
		case "production": {
			const tc = Math.max(cellSeconds * settings.decayRatio, settings.minDecayTc);
			g.setValueAtTime(volume, when);
			g.setTargetAtTime(0, when, tc);
			break;
		}
		case "linear": {
			const holdUntil = when + cellSeconds * settings.decayRatio;
			g.setValueAtTime(volume, when);
			g.setValueAtTime(volume, holdUntil);
			g.linearRampToValueAtTime(0, when + cellSeconds);
			break;
		}
		case "ahdsr": {
			const attack = 0.005;
			const decayUntil = when + attack + cellSeconds * settings.decayRatio;
			const releaseFrom = when + cellSeconds * 0.8;
			g.setValueAtTime(0, when);
			g.linearRampToValueAtTime(volume, when + attack);
			g.linearRampToValueAtTime(volume * settings.sustainLevel, decayUntil);
			g.setValueAtTime(volume * settings.sustainLevel, Math.max(decayUntil, releaseFrom));
			g.linearRampToValueAtTime(0, when + cellSeconds);
			break;
		}
		case "letRing": {
			// The note is never cut by the cell — only by its own ring-out, so the
			// next strum lands on top of it.
			g.setValueAtTime(volume, when);
			g.setTargetAtTime(0, when, settings.ringSeconds / 3);
			break;
		}
		case "hardCut": {
			g.setValueAtTime(volume, when);
			break;
		}
	}
	return stopAt;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrumSoundLabPage() {
	const [presetKey, setPresetKey] = useState(PRESET_OPTIONS[0].key);
	const [mutedPresetKey, setMutedPresetKey] = useState("0280_Chaos_sf2_file");
	const [settings, setSettings] = useState<EnvelopeSettings>(PRODUCTION_SETTINGS);
	const [bpm, setBpm] = useState(80);
	const [staggerMs, setStaggerMs] = useState(10);
	const [taper, setTaper] = useState(0.9);
	const [taperMode, setTaperMode] = useState<TaperMode>("sweep");
	// A real upstroke usually only catches the thin strings; production sweeps the
	// whole voicing both ways. This is how many of the highest notes it catches.
	const [upStringCount, setUpStringCount] = useState(STRUM_PITCHES.length);
	const [volume, setVolume] = useState(0.8);
	const [useZoneLoop, setUseZoneLoop] = useState(true);
	const [looping, setLooping] = useState(false);
	const [status, setStatus] = useState("Idle — press a play button to fetch the preset.");

	const ctxRef = useRef<AudioContext | null>(null);
	const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
	const loopTimerRef = useRef<number | null>(null);
	// Read by the loop scheduler, which must not close over stale state. Mirrored
	// in an effect rather than during render — the same rule the audio engine follows.
	const liveRef = useRef({
		settings,
		bpm,
		staggerMs,
		taper,
		taperMode,
		upStringCount,
		volume,
		useZoneLoop,
		presetKey,
		mutedPresetKey,
	});
	useEffect(() => {
		liveRef.current = {
			settings,
			bpm,
			staggerMs,
			taper,
			taperMode,
			upStringCount,
			volume,
			useZoneLoop,
			presetKey,
			mutedPresetKey,
		};
	}, [
		settings,
		bpm,
		staggerMs,
		taper,
		taperMode,
		upStringCount,
		volume,
		useZoneLoop,
		presetKey,
		mutedPresetKey,
	]);

	const secondsPerCell = 60 / bpm / 2; // eighth-note cells

	function getCtx(): AudioContext {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		return ctxRef.current;
	}

	function stopAllSources() {
		for (const source of sourcesRef.current) {
			try {
				source.stop();
			} catch {
				// already stopped
			}
		}
		sourcesRef.current.clear();
	}

	// No dangling sources or timers when the page goes away.
	useEffect(() => {
		return () => {
			if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current);
			stopAllSources();
			ctxRef.current?.close();
			ctxRef.current = null;
		};
	}, []);

	/** Schedule one strum: a note per pitch, swept in the strum's direction. */
	async function scheduleStrum(type: StrumType, when: number) {
		const live = liveRef.current;
		const ctx = getCtx();
		const key = type === "muted" ? live.mutedPresetKey : live.presetKey;
		const preset = await loadPreset(key);
		await ensureZones(preset, STRUM_PITCHES, ctx);

		const cell = 60 / live.bpm / 2;
		const cellSeconds =
			type === "muted" && live.settings.capMuted ? Math.min(cell, MUTED_MAX_DURATION_S) : cell;
		// An upstroke may catch only the top strings; a downstroke always sweeps
		// the whole voicing, low to high.
		const ordered =
			type === "up"
				? [...STRUM_PITCHES]
						.sort((a, b) => b - a)
						.slice(0, Math.max(1, Math.min(live.upStringCount, STRUM_PITCHES.length)))
				: [...STRUM_PITCHES].sort((a, b) => a - b);
		const ascending = [...ordered].sort((a, b) => a - b);

		ordered.forEach((midi, i) => {
			const zone = findZoneForMidi(preset, midi);
			if (!zone.buffer) return;
			const baseDetune = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;

			const source = ctx.createBufferSource();
			source.buffer = zone.buffer;
			source.playbackRate.value = Math.pow(2, (100 * midi - baseDetune) / 1200);

			const loopStartSec = zone.loopStart / zone.sampleRate;
			const loopEndSec = zone.loopEnd / zone.sampleRate;
			if (live.useZoneLoop && loopStartSec > 0 && loopEndSec > loopStartSec) {
				source.loop = true;
				source.loopStart = loopStartSec;
				source.loopEnd = loopEndSec;
			}

			const noteAt = when + i * (live.staggerMs / 1000);
			const gain = ctx.createGain();
			const stopAt = applyEnvelope(
				gain,
				noteAt,
				live.volume *
					noteVolume(
						live.taperMode,
						live.taper,
						i,
						ascending.indexOf(midi),
						ordered.length,
					),
				cellSeconds,
				live.settings,
			);

			source.connect(gain).connect(ctx.destination);
			source.start(noteAt);
			source.stop(stopAt);
			sourcesRef.current.add(source);
			source.onended = () => sourcesRef.current.delete(source);
		});
	}

	async function playSingle(type: StrumType) {
		try {
			setStatus(`Loading ${type === "muted" ? mutedPresetKey : presetKey}…`);
			const ctx = getCtx();
			await ctx.resume();
			await scheduleStrum(type, ctx.currentTime + 0.05);
			setStatus(`Played one ${type} strum.`);
		} catch (err) {
			setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Schedule the whole test bar from `startAt`; returns when the bar ends. */
	async function scheduleBar(startAt: number): Promise<number> {
		const cell = 60 / liveRef.current.bpm / 2;
		await Promise.all(
			TEST_BAR.map((type, i) => (type ? scheduleStrum(type, startAt + i * cell) : null)),
		);
		return startAt + TEST_BAR.length * cell;
	}

	async function playBar() {
		try {
			setStatus("Loading preset…");
			const ctx = getCtx();
			await ctx.resume();
			await scheduleBar(ctx.currentTime + 0.1);
			setStatus("Played one bar — D · DU · UD · D.");
		} catch (err) {
			setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	function stopLoop() {
		if (loopTimerRef.current !== null) {
			window.clearTimeout(loopTimerRef.current);
			loopTimerRef.current = null;
		}
		setLooping(false);
		stopAllSources();
		setStatus("Stopped.");
	}

	async function startLoop() {
		try {
			const ctx = getCtx();
			await ctx.resume();
			setLooping(true);
			setStatus("Looping the test bar — edit the controls and listen live.");

			// One bar scheduled at a time, the next queued shortly before it ends.
			// Enough for an audition; the production scheduler is the real thing.
			const queueNext = async (barStart: number) => {
				const barEnd = await scheduleBar(barStart);
				const msUntilNext = (barEnd - ctx.currentTime - 0.15) * 1000;
				loopTimerRef.current = window.setTimeout(
					() => void queueNext(barEnd),
					Math.max(20, msUntilNext),
				);
			};
			await queueNext(ctx.currentTime + 0.1);
		} catch (err) {
			setLooping(false);
			setStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	const strategyNote = STRATEGIES.find((s) => s.id === settings.strategy)?.note ?? "";
	const tau = Math.max(secondsPerCell * settings.decayRatio, settings.minDecayTc);
	// The sweeps as the scheduler will build them, so the read-out never guesses.
	const downSweep = [...STRUM_PITCHES].sort((a, b) => a - b);
	const upSweep = [...STRUM_PITCHES]
		.sort((a, b) => b - a)
		.slice(0, Math.max(1, Math.min(upStringCount, STRUM_PITCHES.length)));

	function patch(next: Partial<EnvelopeSettings>) {
		setSettings((prev) => ({ ...prev, ...next }));
	}

	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<header className="pb-8">
				<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">
					{"// DEV — STRUM SOUND LAB"}
				</div>
				<h1 className="mt-3 font-mono text-3xl font-bold">Sample × decay</h1>
				<p className="mt-3 max-w-200 text-sm text-ink-dim">
					Audition a strum preset against a decay strategy. Everything but the envelope
					is the production code path — the same CDN parser, zone selection and sample
					decoding — so what you hear here is what /strum would sound like with these
					settings.
				</p>
			</header>

			<div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
				{/* ── Controls ── */}
				<div className="flex flex-col gap-5">
					<section className="flex flex-col gap-2 border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Sample — down / up
						</h2>
						<select
							value={presetKey}
							onChange={(e) => setPresetKey(e.target.value)}
							className="w-full border border-line-strong bg-surface px-2 py-1.5 font-mono text-xs"
						>
							{PRESET_OPTIONS.map((p) => (
								<option key={p.key} value={p.key}>
									{p.label}
								</option>
							))}
						</select>
						<p className="text-[11px] text-ink-dim">
							{PRESET_OPTIONS.find((p) => p.key === presetKey)?.note}
						</p>

						<h2 className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Sample — muted
						</h2>
						<select
							value={mutedPresetKey}
							onChange={(e) => setMutedPresetKey(e.target.value)}
							className="w-full border border-line-strong bg-surface px-2 py-1.5 font-mono text-xs"
						>
							{PRESET_OPTIONS.map((p) => (
								<option key={p.key} value={p.key}>
									{p.label}
								</option>
							))}
						</select>
					</section>

					<section className="flex flex-col gap-3 border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Decay strategy
						</h2>
						{STRATEGIES.map((s) => (
							<label key={s.id} className="flex items-start gap-2 text-xs">
								<input
									type="radio"
									name="strategy"
									checked={settings.strategy === s.id}
									onChange={() => patch({ strategy: s.id })}
									className="mt-0.5"
								/>
								<span>
									<span className="font-medium">{s.label}</span>
									<span className="block text-[11px] text-ink-dim">{s.note}</span>
								</span>
							</label>
						))}
					</section>

					<section className="flex flex-col gap-3 border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Envelope
						</h2>
						<Slider
							label={
								settings.strategy === "linear"
									? "Hold fraction of cell"
									: settings.strategy === "ahdsr"
										? "Decay fraction of cell"
										: "τ ratio (× cell)"
							}
							value={settings.decayRatio}
							min={0.05}
							max={2}
							step={0.05}
							onChange={(v) => patch({ decayRatio: v })}
						/>
						<Slider
							label="τ floor (s)"
							value={settings.minDecayTc}
							min={0}
							max={0.2}
							step={0.005}
							onChange={(v) => patch({ minDecayTc: v })}
						/>
						<Slider
							label="Sustain level (AHDSR)"
							value={settings.sustainLevel}
							min={0}
							max={1}
							step={0.05}
							onChange={(v) => patch({ sustainLevel: v })}
						/>
						<Slider
							label="Ring length (s, let ring)"
							value={settings.ringSeconds}
							min={0.2}
							max={6}
							step={0.1}
							onChange={(v) => patch({ ringSeconds: v })}
						/>
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={settings.capMuted}
								onChange={(e) => patch({ capMuted: e.target.checked })}
							/>
							Cap muted cells at {MUTED_MAX_DURATION_S}s (production behaviour)
						</label>
					</section>

					<section className="flex flex-col gap-3 border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Strum shape
						</h2>
						<Slider label="BPM" value={bpm} min={40} max={220} step={1} onChange={setBpm} />
						<Slider
							label="String stagger (ms)"
							value={staggerMs}
							min={0}
							max={60}
							step={1}
							onChange={setStaggerMs}
						/>
						<Slider
							label={`Up strum catches top ${upStringCount} of ${STRUM_PITCHES.length} strings`}
							value={upStringCount}
							min={1}
							max={STRUM_PITCHES.length}
							step={1}
							onChange={setUpStringCount}
						/>
						<Slider
							label="Taper strength (1 = flat)"
							value={taper}
							min={0.5}
							max={1}
							step={0.01}
							onChange={setTaper}
						/>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-ink-dim">Taper direction</span>
							{TAPER_MODES.map((m) => (
								<label key={m.id} className="flex items-start gap-2 text-xs">
									<input
										type="radio"
										name="taperMode"
										checked={taperMode === m.id}
										onChange={() => setTaperMode(m.id)}
										className="mt-0.5"
									/>
									<span>
										<span className="font-medium">{m.label}</span>
										<span className="block text-[11px] text-ink-dim">{m.note}</span>
									</span>
								</label>
							))}
						</div>
						<Slider
							label="Volume"
							value={volume}
							min={0}
							max={1}
							step={0.05}
							onChange={setVolume}
						/>
						<label className="flex items-center gap-2 text-xs">
							<input
								type="checkbox"
								checked={useZoneLoop}
								onChange={(e) => setUseZoneLoop(e.target.checked)}
							/>
							Use the sample&apos;s loop points (needed for a long ring)
						</label>
						<button
							type="button"
							onClick={() => {
								setSettings(PRODUCTION_SETTINGS);
								setPresetKey("0250_LK_AcousticSteel_SF2_file");
								setMutedPresetKey("0280_Chaos_sf2_file");
								setStaggerMs(10);
								setTaper(0.9);
								setTaperMode("sweep");
								setUpStringCount(STRUM_PITCHES.length);
								setUseZoneLoop(true);
							}}
							className="border border-line-strong px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-denim hover:text-denim"
						>
							Reset to production settings
						</button>
					</section>
				</div>

				{/* ── Transport + read-out ── */}
				<div className="flex flex-col gap-5">
					<section className="flex flex-wrap gap-2 border border-line p-4">
						{(["down", "up", "muted"] as const).map((type) => (
							<button
								key={type}
								type="button"
								onClick={() => void playSingle(type)}
								className="border border-line-strong px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-denim hover:text-denim"
							>
								one {type}
							</button>
						))}
						<button
							type="button"
							onClick={() => void playBar()}
							className="border border-line-strong px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors hover:border-denim hover:text-denim"
						>
							one bar
						</button>
						<button
							type="button"
							onClick={() => (looping ? stopLoop() : void startLoop())}
							className={`border px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
								looping
									? "border-denim bg-denim text-on-denim"
									: "border-line-strong hover:border-denim hover:text-denim"
							}`}
						>
							{looping ? "stop loop" : "loop bar"}
						</button>
					</section>

					<section className="border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							What is scheduled
						</h2>
						<dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-1.5 font-mono text-xs">
							<dt className="text-ink-dim">cell length</dt>
							<dd>{secondsPerCell.toFixed(3)} s (eighths at {bpm} BPM)</dd>
							<dt className="text-ink-dim">strategy</dt>
							<dd>{settings.strategy}</dd>
							<dt className="text-ink-dim">τ (production)</dt>
							<dd>
								{tau.toFixed(3)} s{" "}
								{tau === settings.minDecayTc ? "(floored)" : "(ratio × cell)"}
							</dd>
							<dt className="text-ink-dim">source lifetime</dt>
							<dd>{sourceLifetime(settings, secondsPerCell).toFixed(3)} s</dd>
							<dt className="text-ink-dim">overlap</dt>
							<dd>
								{sourceLifetime(settings, secondsPerCell) > secondsPerCell
									? `yes — ${(sourceLifetime(settings, secondsPerCell) - secondsPerCell).toFixed(3)} s into the next cell`
									: "no — each cell is silent before the next"}
							</dd>
							<dt className="text-ink-dim">chord</dt>
							<dd>C major [{STRUM_PITCHES.join(", ")}]</dd>
						</dl>

						{/* Gain per string for both strokes: the taper direction is far easier
						    to read as numbers than as a name. */}
						<table className="mt-4 w-full border-collapse font-mono text-xs">
							<thead>
								<tr className="text-ink-dim">
									<th className="border-b border-line py-1 text-left font-normal">
										stroke
									</th>
									{downSweep.map((midi) => (
										<th
											key={midi}
											className="border-b border-line py-1 text-right font-normal"
										>
											{midi}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{([
									{ label: "down", sweep: downSweep },
									{ label: `up (${upSweep.length}/${STRUM_PITCHES.length})`, sweep: upSweep },
								] as const).map(({ label, sweep }) => {
									const ascending = [...sweep].sort((a, b) => a - b);
									return (
										<tr key={label}>
											<td className="py-1 text-ink-dim">{label}</td>
											{downSweep.map((midi) => {
												const sweepIndex = sweep.indexOf(midi);
												return (
													<td key={midi} className="py-1 text-right">
														{sweepIndex === -1
															? "—"
															: (
																	volume *
																	noteVolume(
																		taperMode,
																		taper,
																		sweepIndex,
																		ascending.indexOf(midi),
																		sweep.length,
																	)
																).toFixed(2)}
													</td>
												);
											})}
										</tr>
									);
								})}
							</tbody>
						</table>
						<p className="mt-1 text-[11px] text-ink-faint">
							Columns are the chord&apos;s MIDI pitches, bass on the left. &ldquo;—&rdquo;
							is a string the upstroke does not catch.
						</p>
						<p className="mt-3 text-[11px] text-ink-dim">{strategyNote}</p>
						<p className="mt-1.5 text-[11px] text-ink-dim">
							{TAPER_MODES.find((m) => m.id === taperMode)?.note}
						</p>
					</section>

					<section className="border border-line p-4">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-denim">
							Status
						</h2>
						<p className="mt-2 font-mono text-xs text-ink-dim">{status}</p>
						<p className="mt-3 text-[11px] text-ink-dim">
							Presets are fetched once per key and cached; the first play of a new
							sample takes a moment. Nothing here writes to the database or changes
							production settings — copy the numbers you like into
							useGuitarSampleLoader.ts.
						</p>
					</section>
				</div>
			</div>
		</div>
	);
}

function Slider({
	label,
	value,
	min,
	max,
	step,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (value: number) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-xs">
			<span className="flex items-center justify-between">
				<span className="text-ink-dim">{label}</span>
				<span className="font-mono">{value}</span>
			</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
				className="accent-denim"
			/>
		</label>
	);
}
