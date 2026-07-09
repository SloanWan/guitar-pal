"use client";

import { useState, useEffect, useRef } from "react";

// ─── Audio constants ──────────────────────────────────────────────────────────

const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";
const STRUM_PITCHES: readonly number[] = [48, 52, 55, 60, 64];
const STRUM_STAGGER_S = 0.01;
const NOTE_DURATION_S = 0.4;
const DECAY_TIME_CONSTANT_RATIO = 0.8; // decayTC = 0.8 × NOTE_DURATION_S = 0.32 s
const MIN_DECAY_TC_S = 0.03;
const SOURCE_STOP_BUFFER_S = 0.05;
const SINGLE_NOTE_SPACING_S = 0.5;
const CURRENT_PRESET_NAME = "0250_SoundBlasterOld_sf2";

const STRUM_PRESETS = [
	"0250_Aspirin_sf2_file",
	"0250_Chaos_sf2_file",
	"0250_FluidR3_GM_sf2_file",
	"0250_GeneralUserGS_sf2_file",
	"0250_JCLive_sf2_file",
	"0250_LK_AcousticSteel_SF2_file",
	"0250_SBAWE32_sf2_file",
	"0250_SBLive_sf2",
	"0250_SoundBlasterOld_sf2",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface WafZone {
	keyRangeLow: number;
	keyRangeHigh: number;
	originalPitch: number;
	coarseTune: number;
	fineTune: number;
	loopStart: number;
	loopEnd: number;
	sampleRate: number;
	file?: string;
	sample?: string;
	buffer?: AudioBuffer;
}

interface WafPreset {
	zones: WafZone[];
}

type CardState = "idle" | "loading" | "ready" | "error";

interface SharedAudioState {
	ctx: AudioContext | null;
	sources: Set<AudioBufferSourceNode>;
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

function parsePresetFromJs(text: string, varName: string): WafPreset {
	const assignmentRe = new RegExp(String.raw`\b${varName}\s*=\s*\{`);
	const match = assignmentRe.exec(text);
	if (!match) throw new Error(`Variable "${varName}" not found in preset file`);

	const jsStart = match.index + match[0].length - 1;
	let depth = 0;
	let inString = false;
	let escape = false;
	let jsEnd = -1;

	for (let i = jsStart; i < text.length; i++) {
		const ch = text[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (ch === "\\" && inString) {
			escape = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				jsEnd = i;
				break;
			}
		}
	}

	if (jsEnd === -1) throw new Error("Unbalanced braces in preset file");

	const jsText = text.slice(jsStart, jsEnd + 1);
	const result: unknown = new Function(`"use strict"; return (${jsText})`)();

	if (
		typeof result !== "object" ||
		result === null ||
		!("zones" in result) ||
		!Array.isArray((result as Record<string, unknown>).zones)
	) {
		throw new Error("Preset has unexpected shape (missing zones array)");
	}

	return result as WafPreset;
}

function findZoneForMidi(preset: WafPreset, midiNote: number): WafZone {
	const exact = preset.zones.find(
		(z) => z.keyRangeLow <= midiNote && midiNote <= z.keyRangeHigh,
	);
	if (exact) return exact;
	if (preset.zones.length === 0) throw new Error(`No zones for MIDI ${midiNote}`);
	return [...preset.zones].sort(
		(a, b) =>
			Math.abs(a.originalPitch / 100 - midiNote) - Math.abs(b.originalPitch / 100 - midiNote),
	)[0];
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
	const decoded = atob(b64);
	const buf = new ArrayBuffer(decoded.length);
	const view = new Uint8Array(buf);
	for (let i = 0; i < decoded.length; i++) {
		view[i] = decoded.charCodeAt(i);
	}
	return buf;
}

function pcmSampleToBuffer(b64Sample: string, sampleRate: number, ctx: AudioContext): AudioBuffer {
	const decoded = atob(b64Sample);
	const sampleCount = Math.floor(decoded.length / 2);
	const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
	const float32 = buffer.getChannelData(0);
	for (let i = 0; i < sampleCount; i++) {
		const lo = decoded.charCodeAt(i * 2);
		const hi = decoded.charCodeAt(i * 2 + 1);
		let n = hi * 256 + lo;
		if (n >= 32768) n -= 65536;
		float32[i] = n / 32768;
	}
	return buffer;
}

async function decodeZone(zone: WafZone, ctx: AudioContext): Promise<AudioBuffer> {
	if (zone.sample) {
		return pcmSampleToBuffer(zone.sample, zone.sampleRate ?? 44100, ctx);
	}
	if (zone.file) {
		return await ctx.decodeAudioData(base64ToArrayBuffer(zone.file));
	}
	throw new Error(`Zone at originalPitch=${zone.originalPitch} has no audio data`);
}

function scheduleNote(
	ctx: AudioContext,
	zone: WafZone,
	buffer: AudioBuffer,
	when: number,
	midiPitch: number,
	noteDuration: number,
	volume: number,
	sources: Set<AudioBufferSourceNode>,
): void {
	const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
	const playbackRate = Math.pow(2, (100.0 * midiPitch - baseDetune) / 1200.0);

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = playbackRate;

	const loopStartSec = zone.loopStart / zone.sampleRate;
	const loopEndSec = zone.loopEnd / zone.sampleRate;
	if (loopStartSec > 0 && loopEndSec > loopStartSec) {
		source.loop = true;
		source.loopStart = loopStartSec;
		source.loopEnd = loopEndSec;
	}

	const decayTimeConstant = Math.max(noteDuration * DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S);
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(volume, when);
	gainNode.gain.setTargetAtTime(0, when, decayTimeConstant);

	source.connect(gainNode).connect(ctx.destination);
	source.start(when);
	source.stop(when + noteDuration + SOURCE_STOP_BUFFER_S);

	sources.add(source);
	source.onended = () => {
		sources.delete(source);
	};
}

function stopAllSources(audio: SharedAudioState): void {
	for (const source of audio.sources) {
		try {
			source.stop();
		} catch {
			// already ended
		}
	}
	audio.sources.clear();
}

function getOrCreateCtx(audio: SharedAudioState): AudioContext {
	if (!audio.ctx || audio.ctx.state === "closed") {
		audio.ctx = new AudioContext();
	}
	return audio.ctx;
}

// ─── PresetCard ───────────────────────────────────────────────────────────────

function PresetCard({
	name,
	isCurrent,
	audioRef,
}: {
	name: string;
	isCurrent: boolean;
	audioRef: React.MutableRefObject<SharedAudioState>;
}) {
	const [state, setState] = useState<CardState>("idle");
	const [error, setError] = useState<string | null>(null);
	const presetRef = useRef<WafPreset | null>(null);
	const loadPromiseRef = useRef<Promise<WafPreset | null> | null>(null);

	async function ensureLoaded(): Promise<WafPreset | null> {
		if (presetRef.current) return presetRef.current;
		if (loadPromiseRef.current) return loadPromiseRef.current;

		setState("loading");

		const varName = `_tone_${name}`;
		const promise = (async (): Promise<WafPreset | null> => {
			try {
				const audio = audioRef.current;
				const ctx = getOrCreateCtx(audio);
				if (ctx.state === "suspended") await ctx.resume();

				const url = `${WAF_BASE_URL}${name}.js`;
				const response = await fetch(url);
				if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${name}`);
				const text = await response.text();
				const preset = parsePresetFromJs(text, varName);

				const decoded = new Set<WafZone>();
				for (const pitch of STRUM_PITCHES) {
					const zone = findZoneForMidi(preset, pitch);
					if (!decoded.has(zone)) {
						decoded.add(zone);
						zone.buffer = await decodeZone(zone, ctx);
					}
				}

				presetRef.current = preset;
				setState("ready");
				return preset;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				setError(msg);
				setState("error");
				loadPromiseRef.current = null;
				return null;
			}
		})();

		loadPromiseRef.current = promise;
		return promise;
	}

	async function handleStrumDown() {
		const audio = audioRef.current;
		stopAllSources(audio);
		const preset = await ensureLoaded();
		if (!preset) return;

		const ctx = getOrCreateCtx(audio);
		const when = ctx.currentTime + 0.05;

		for (let i = 0; i < STRUM_PITCHES.length; i++) {
			const pitch = STRUM_PITCHES[i];
			const zone = findZoneForMidi(preset, pitch);
			if (!zone.buffer) continue;

			const noteOffset = i * STRUM_STAGGER_S;
			const adjustedDuration = NOTE_DURATION_S - noteOffset;
			if (adjustedDuration <= 0) continue;

			scheduleNote(
				ctx,
				zone,
				zone.buffer,
				when + noteOffset,
				pitch,
				adjustedDuration,
				Math.pow(0.9, i),
				audio.sources,
			);
		}
	}

	async function handleSingleStrings() {
		const audio = audioRef.current;
		stopAllSources(audio);
		const preset = await ensureLoaded();
		if (!preset) return;

		const ctx = getOrCreateCtx(audio);
		const when = ctx.currentTime + 0.05;

		for (let i = 0; i < STRUM_PITCHES.length; i++) {
			const pitch = STRUM_PITCHES[i];
			const zone = findZoneForMidi(preset, pitch);
			if (!zone.buffer) continue;

			const noteStart = when + i * SINGLE_NOTE_SPACING_S;
			scheduleNote(ctx, zone, zone.buffer, noteStart, pitch, NOTE_DURATION_S, 1.0, audio.sources);
		}
	}

	const isLoading = state === "loading";

	return (
		<div
			className="flex items-center gap-4 rounded-lg border p-4"
			style={isCurrent ? { borderColor: "#4A6FA5", borderWidth: 2 } : undefined}
		>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-sm font-medium">{name}</span>
					{isCurrent && (
						<span
							className="rounded-full px-2 py-0.5 text-xs font-semibold"
							style={{ background: "#EEF2F7", color: "#3A5A8A" }}
						>
							Current
						</span>
					)}
				</div>
				{state === "error" && error && (
					<p className="mt-1 text-xs text-red-500">{error}</p>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-2">
				{isLoading && (
					<span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
				)}
				<button
					onClick={() => void handleStrumDown()}
					disabled={isLoading}
					className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Strum Down
				</button>
				<button
					onClick={() => void handleSingleStrings()}
					disabled={isLoading}
					className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
				>
					Single strings
				</button>
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StrumPresetAuditionPage() {
	const audioRef = useRef<SharedAudioState>({ ctx: null, sources: new Set() });

	useEffect(() => {
		const audio = audioRef.current;
		return () => {
			stopAllSources(audio);
			if (audio.ctx) {
				try {
					audio.ctx.close();
				} catch {
					// already closed
				}
			}
		};
	}, []);

	return (
		<div className="mx-auto max-w-3xl p-8">
			<h1 className="mb-1 text-2xl font-bold">Strum Preset Audition</h1>
			<p className="mb-6 text-sm text-gray-500">
				Dev tool — comparing all 0250_* acoustic guitar presets as candidates to replace the strum
				page&apos;s current preset. Not linked from navigation; access by direct URL only.
			</p>

			<div className="flex flex-col gap-3">
				{STRUM_PRESETS.map((name) => (
					<PresetCard
						key={name}
						name={name}
						isCurrent={name === CURRENT_PRESET_NAME}
						audioRef={audioRef}
					/>
				))}
			</div>
		</div>
	);
}
