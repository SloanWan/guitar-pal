"use client";

/**
 * Audition every piano preset on the WebAudioFont CDN as the sound for the
 * fretboard's piano root selector (#163). One real `<PianoKeyboard/>` plays
 * through whichever preset is selected below; each card also has quick A/B
 * buttons and reports what choosing it would cost: file size, zone count,
 * decode time.
 *
 * Reuses the production parser and decoder so what you hear is what the app
 * would play; only the envelope is local, since no piano trigger exists yet.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import PianoKeyboard, { type PianoKeyboardHandle } from "@/components/fretboard/PianoKeyboard";
import { GUITAR_RANGE } from "@/components/fretboard/FretboardExplorer";
import {
	_decodeZone,
	findZoneForMidi,
	parsePresetFromJs,
	SOURCE_STOP_BUFFER_S,
	type WafPreset,
} from "@/components/strum/useGuitarSampleLoader";
import { PIANO_61, pitchClassOf } from "@/lib/piano/keys";

const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";

interface PianoPreset {
	/** File name on the CDN without `.js`; the JS variable is `_tone_<name>`. */
	name: string;
	/** General MIDI program. */
	program: string;
	/** The SoundFont it was rendered from. */
	font: string;
}

/** Every GM 0–3 preset the CDN has (listed from the repo tree). */
const PIANO_PRESETS: readonly PianoPreset[] = [
	{ name: "0000_Aspirin_sf2_file", program: "Acoustic Grand", font: "Aspirin" },
	{ name: "0000_Chaos_sf2_file", program: "Acoustic Grand", font: "Chaos" },
	{ name: "0000_FluidR3_GM_sf2_file", program: "Acoustic Grand", font: "FluidR3 GM" },
	{ name: "0000_GeneralUserGS_sf2_file", program: "Acoustic Grand", font: "GeneralUser GS" },
	{ name: "0000_JCLive_sf2_file", program: "Acoustic Grand", font: "JCLive" },
	{ name: "0000_SBLive_sf2", program: "Acoustic Grand", font: "SB Live" },
	{ name: "0000_SoundBlasterOld_sf2", program: "Acoustic Grand", font: "SoundBlaster (old)" },
	{ name: "0001_FluidR3_GM_sf2_file", program: "Bright Acoustic", font: "FluidR3 GM" },
	{ name: "0001_GeneralUserGS_sf2_file", program: "Bright Acoustic", font: "GeneralUser GS" },
	{ name: "0002_GeneralUserGS_sf2_file", program: "Electric Grand", font: "GeneralUser GS" },
	{ name: "0003_GeneralUserGS_sf2_file", program: "Honky-tonk", font: "GeneralUser GS" },
];

const RING_OPTIONS = [1, 2.5, 5] as const;
type RingSeconds = (typeof RING_OPTIONS)[number];

/** C3 up the white keys to C5: enough to hear the register change. */
const RUN_MIDI: readonly number[] = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
const RUN_SPACING_S = 0.18;
const CHORD_MIDI: readonly number[] = [48, 60, 64, 67, 72];

type LoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; preset: WafPreset; bytes: number; zones: number; decodeMs: number }
	| { status: "error"; message: string };

interface Audio {
	ctx: AudioContext | null;
	sources: Set<AudioBufferSourceNode>;
}

function getCtx(audio: Audio): AudioContext {
	if (!audio.ctx || audio.ctx.state === "closed") audio.ctx = new AudioContext();
	return audio.ctx;
}

function stopAll(audio: Audio): void {
	for (const s of audio.sources) {
		try {
			s.stop();
		} catch {
			// already ended
		}
	}
	audio.sources.clear();
}

/** The loader's note model with a piano's ring: decay from the strike, stop after the ring. */
function playNote(audio: Audio, preset: WafPreset, midi: number, when: number, ring: number, volume = 0.8): void {
	const ctx = getCtx(audio);
	const zone = findZoneForMidi(preset, midi);
	if (!zone.buffer) return;
	const baseDetune = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;
	const source = ctx.createBufferSource();
	source.buffer = zone.buffer;
	source.playbackRate.value = Math.pow(2, (100 * midi - baseDetune) / 1200);
	const loopStart = zone.loopStart / zone.sampleRate;
	const loopEnd = zone.loopEnd / zone.sampleRate;
	if (loopStart > 0 && loopEnd > loopStart) {
		source.loop = true;
		source.loopStart = loopStart;
		source.loopEnd = loopEnd;
	}
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(volume, when);
	gain.gain.setTargetAtTime(0, when, ring / 3);
	source.connect(gain).connect(ctx.destination);
	source.start(when);
	source.stop(when + ring + SOURCE_STOP_BUFFER_S);
	audio.sources.add(source);
	source.onended = () => audio.sources.delete(source);
}

function kb(bytes: number): string {
	return `${Math.round(bytes / 1024).toLocaleString()} KB`;
}

export default function PianoPresetAuditionPage() {
	const audio = useRef<Audio>({ ctx: null, sources: new Set() });
	const keyboard = useRef<PianoKeyboardHandle>(null);
	const loads = useRef(new Map<string, Promise<WafPreset | null>>());
	const [states, setStates] = useState<Record<string, LoadState>>({});
	const [selected, setSelected] = useState<string>(PIANO_PRESETS[2].name);
	const [ring, setRing] = useState<RingSeconds>(2.5);
	const [lastMidi, setLastMidi] = useState(60);

	useEffect(() => {
		const a = audio.current;
		return () => {
			stopAll(a);
			a.ctx?.close().catch(() => undefined);
		};
	}, []);

	const setState = useCallback((name: string, state: LoadState) => {
		setStates((prev) => ({ ...prev, [name]: state }));
	}, []);

	/** Fetch, parse and decode every zone once; concurrent calls share the promise. */
	const ensureLoaded = useCallback(
		(name: string): Promise<WafPreset | null> => {
			const inFlight = loads.current.get(name);
			if (inFlight) return inFlight;
			const promise = (async () => {
				setState(name, { status: "loading" });
				try {
					const ctx = getCtx(audio.current);
					if (ctx.state === "suspended") await ctx.resume();
					const response = await fetch(`${WAF_BASE_URL}${name}.js`);
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const text = await response.text();
					const preset = parsePresetFromJs(text, `_tone_${name}`);
					const started = performance.now();
					for (const zone of preset.zones) zone.buffer = await _decodeZone(zone, ctx);
					setState(name, {
						status: "ready",
						preset,
						bytes: text.length,
						zones: preset.zones.length,
						decodeMs: Math.round(performance.now() - started),
					});
					return preset;
				} catch (err) {
					setState(name, { status: "error", message: err instanceof Error ? err.message : String(err) });
					loads.current.delete(name);
					return null;
				}
			})();
			loads.current.set(name, promise);
			return promise;
		},
		[setState],
	);

	const play = useCallback(
		async (name: string, notes: readonly number[], spacing = 0) => {
			const preset = await ensureLoaded(name);
			if (!preset) return;
			const ctx = getCtx(audio.current);
			const when = ctx.currentTime + 0.03;
			notes.forEach((midi, i) => {
				playNote(audio.current, preset, midi, when + i * spacing, ring);
				window.setTimeout(() => keyboard.current?.strike(midi), i * spacing * 1000);
			});
		},
		[ensureLoaded, ring],
	);

	const handleKey = useCallback(
		(midi: number) => {
			setLastMidi(midi);
			void play(selected, [midi]);
		},
		[play, selected],
	);

	return (
		<div className="min-h-screen bg-surface px-(--gutter) py-10 text-ink">
			<header className="pb-8">
				<div className="font-mono text-[11px] uppercase tracking-[0.18em] text-denim-accent">
					{"// DEV — PIANO PRESET AUDITION"}
				</div>
				<h1 className="mt-3 font-mono text-3xl font-bold">Which piano?</h1>
				<p className="mt-3 max-w-[70ch] text-sm text-ink-dim">
					Every GM piano preset on the WebAudioFont CDN, as candidates for the root selector&apos;s
					own voice. Pick a preset below, then play the keyboard; the quick buttons A/B without
					scrolling. Size and decode time are what the first press would cost a player.
				</p>
			</header>

			<section className="mb-6 border border-line bg-panel p-3">
				<div className="mb-2 flex flex-wrap items-center justify-between gap-3">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
						Playing through: <span className="text-denim-accent">{selected}</span>
					</span>
					<div className="flex items-center gap-2">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Ring</span>
						<div role="radiogroup" aria-label="Ring seconds" className="flex border border-line-strong">
							{RING_OPTIONS.map((r, i) => (
								<button
									key={r}
									type="button"
									role="radio"
									aria-checked={ring === r}
									onClick={() => setRing(r)}
									className={`px-3 py-1 font-mono text-[10px] ${i > 0 ? "border-l border-line-strong" : ""} ${
										ring === r ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim-accent"
									}`}
								>
									{r}s
								</button>
							))}
						</div>
					</div>
				</div>
				<PianoKeyboard
					ref={keyboard}
					keys={PIANO_61}
					selectedPitchClass={pitchClassOf(lastMidi)}
					range={GUITAR_RANGE}
					onSelect={handleKey}
					ariaLabel="Audition keyboard"
				/>
			</section>

			<ul role="radiogroup" aria-label="Piano preset" className="divide-y divide-line border-y border-line">
				{PIANO_PRESETS.map((p) => {
					const state = states[p.name] ?? { status: "idle" };
					const on = p.name === selected;
					return (
						<li key={p.name} className={`flex flex-wrap items-center gap-3 py-3 ${on ? "bg-denim-tint" : ""}`}>
							<button
								type="button"
								role="radio"
								aria-checked={on}
								onClick={() => {
									setSelected(p.name);
									void ensureLoaded(p.name);
								}}
								className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 text-left"
							>
								<span className="font-mono text-[13px] font-medium text-ink">
									<span className={`mr-2 inline-block size-2 ${on ? "bg-denim" : "bg-line-strong"}`} aria-hidden="true" />
									{p.name}
								</span>
								<span className="font-sans text-[12px] text-ink-dim">
									{p.program} · {p.font}
									{state.status === "ready" && (
										<>
											{" · "}
											{kb(state.bytes)} · {state.zones} zones · decoded in {state.decodeMs} ms
										</>
									)}
									{state.status === "loading" && " · loading…"}
									{state.status === "error" && <span className="text-destructive"> · {state.message}</span>}
								</span>
							</button>
							<div className="flex shrink-0 items-center gap-1 pr-2">
								{(
									[
										["C4", [60], 0],
										["Run", RUN_MIDI, RUN_SPACING_S],
										["Chord", CHORD_MIDI, 0.01],
									] as const
								).map(([label, notes, spacing]) => (
									<button
										key={label}
										type="button"
										disabled={state.status === "loading"}
										onClick={() => {
											setSelected(p.name);
											void play(p.name, notes, spacing);
										}}
										className="border border-line-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent disabled:cursor-not-allowed disabled:opacity-40"
									>
										{label}
									</button>
								))}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
