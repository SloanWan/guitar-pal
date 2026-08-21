"use client";

/**
 * THROWAWAY diagnostic page — delete after pitch-quality audit is complete.
 *
 * Usage:
 *   1. npm run dev → open http://localhost:3000/dev/audio-diagnostic
 *   2. Click "Load" next to any preset (or "Load All" for everything at once)
 *   3. Click a preset row to select it as the active preset
 *   4. Click any note button to trigger that pitch on the active preset
 *   5. "Play All ▶" sweeps MIDI 40–76 on that preset
 *   6. Switch the active preset and click the same note again to A/B compare
 *   7. "Stop ■" cuts all sound immediately
 */

import { useRef, useState } from "react";
import {
	_pcmSampleToBuffer,
	findZoneForMidi,
	parsePresetFromJs,
	type WafPreset,
	type WafZone,
} from "@/components/strum/useGuitarSampleLoader";

// ── Preset catalog ────────────────────────────────────────────────────────────

interface PresetDef {
	id: string;
	label: string;
	key: string;
	varName: string;
	group: string;
	isCurrent?: boolean;
}

const PRESET_CATALOG: PresetDef[] = [
	// ── Nylon guitar (GM 24) ─────────────────────────────────────────────────
	{
		id: "nylon-godin",
		label: "LK Godin Nylon",
		key: "0240_LK_Godin_Nylon_SF2_file",
		varName: "_tone_0240_LK_Godin_Nylon_SF2_file",
		group: "Nylon Guitar (0240)",
	},
	{
		id: "nylon-fluid",
		label: "FluidR3",
		key: "0240_FluidR3_GM_sf2_file",
		varName: "_tone_0240_FluidR3_GM_sf2_file",
		group: "Nylon Guitar (0240)",
	},
	// ── Steel guitar (GM 25) ─────────────────────────────────────────────────
	{
		id: "steel-acoustic-sf",
		label: "Acoustic Guitar SF",
		key: "0250_Acoustic_Guitar_sf2_file",
		varName: "_tone_0250_Acoustic_Guitar_sf2_file",
		group: "Steel Guitar (0250)",
	},
	{
		id: "steel-lk",
		label: "LK AcousticSteel",
		key: "0250_LK_AcousticSteel_SF2_file",
		varName: "_tone_0250_LK_AcousticSteel_SF2_file",
		group: "Steel Guitar (0250)",
	},
	{
		id: "steel-fluid",
		label: "FluidR3",
		key: "0250_FluidR3_GM_sf2_file",
		varName: "_tone_0250_FluidR3_GM_sf2_file",
		group: "Steel Guitar (0250)",
	},
	{
		id: "steel-sb",
		label: "SoundBlaster (current)",
		key: "0250_SoundBlasterOld_sf2",
		varName: "_tone_0250_SoundBlasterOld_sf2",
		group: "Steel Guitar (0250)",
		isCurrent: true,
	},
	// ── Muted electric guitar (GM 28) ────────────────────────────────────────
	{
		id: "muted-fluid",
		label: "FluidR3",
		key: "0280_FluidR3_GM_sf2_file",
		varName: "_tone_0280_FluidR3_GM_sf2_file",
		group: "Muted Guitar (0280)",
	},
	{
		id: "muted-sb",
		label: "SoundBlaster (current)",
		key: "0280_SoundBlasterOld_sf2",
		varName: "_tone_0280_SoundBlasterOld_sf2",
		group: "Muted Guitar (0280)",
		isCurrent: true,
	},
];

// ── Audio constants ───────────────────────────────────────────────────────────

const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";
const MIDI_LOW = 40;
const MIDI_HIGH = 76;
const MIDI_RANGE = Array.from({ length: MIDI_HIGH - MIDI_LOW + 1 }, (_, i) => MIDI_LOW + i);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiToName(midi: number): string {
	return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function base64ToArrayBuffer(b64: string): ArrayBuffer {
	const raw = atob(b64);
	const buf = new ArrayBuffer(raw.length);
	const view = new Uint8Array(buf);
	for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
	return buf;
}

async function decodeZone(zone: WafZone, ctx: AudioContext): Promise<AudioBuffer> {
	if (zone.sample) return _pcmSampleToBuffer(zone.sample, zone.sampleRate ?? 44100, ctx);
	if (zone.file) return ctx.decodeAudioData(base64ToArrayBuffer(zone.file));
	throw new Error(`Zone at originalPitch=${zone.originalPitch} has no audio data`);
}

async function loadAndDecodePreset(
	def: PresetDef,
	ctx: AudioContext,
	log: (msg: string) => void,
): Promise<WafPreset> {
	log(`[${def.id}] Fetching ${def.key}.js…`);
	const res = await fetch(`${WAF_BASE_URL}${def.key}.js`);
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${def.key}`);
	const text = await res.text();
	const preset = parsePresetFromJs(text, def.varName);
	const decoded = new Set<WafZone>();
	for (const midi of MIDI_RANGE) {
		const zone = findZoneForMidi(preset, midi);
		if (!decoded.has(zone)) {
			decoded.add(zone);
			zone.buffer = await decodeZone(zone, ctx);
		}
	}
	log(`[${def.id}] Ready — ${decoded.size} zone(s) decoded for MIDI ${MIDI_LOW}–${MIDI_HIGH}`);
	return preset;
}

function scheduleNote(
	preset: WafPreset,
	midi: number,
	ctx: AudioContext,
	when: number,
	duration: number,
): AudioBufferSourceNode | null {
	const zone = findZoneForMidi(preset, midi);
	if (!zone.buffer) return null;
	const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
	const playbackRate = Math.pow(2, (100.0 * midi - baseDetune) / 1200.0);
	const source = ctx.createBufferSource();
	source.buffer = zone.buffer;
	source.playbackRate.value = playbackRate;
	const loopStart = zone.loopStart / zone.sampleRate;
	const loopEnd = zone.loopEnd / zone.sampleRate;
	if (loopStart > 0 && loopEnd > loopStart) {
		source.loop = true;
		source.loopStart = loopStart;
		source.loopEnd = loopEnd;
	}
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0.8, when);
	gain.gain.setTargetAtTime(0, when + duration * 0.6, duration * 0.3);
	source.connect(gain).connect(ctx.destination);
	source.start(when);
	source.stop(when + duration + 0.15);
	return source;
}

// ── Component ─────────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

const STATE_COLOR: Record<LoadState, string> = {
	idle: "#64748b",
	loading: "#f0a500",
	ready: "#22c55e",
	error: "#ef4444",
};
const STATE_LABEL: Record<LoadState, string> = {
	idle: "idle",
	loading: "loading…",
	ready: "ready",
	error: "error",
};

export default function AudioDiagnosticPage() {
	const ctxRef = useRef<AudioContext | null>(null);
	const loadedPresets = useRef<Map<string, WafPreset>>(new Map());
	const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
	const seqTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [loadStates, setLoadStates] = useState<Record<string, LoadState>>(
		Object.fromEntries(PRESET_CATALOG.map((p) => [p.id, "idle" as LoadState])),
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [playingMidi, setPlayingMidi] = useState<number | null>(null);
	const [log, setLog] = useState<string[]>([]);

	function appendLog(msg: string) {
		setLog((prev) => [...prev.slice(-59), msg]);
	}

	function getCtx(): AudioContext {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
		return ctxRef.current;
	}

	function stopAll() {
		if (seqTimer.current) clearTimeout(seqTimer.current);
		seqTimer.current = null;
		for (const src of activeSources.current) {
			try {
				src.stop();
			} catch {
				/* already ended */
			}
		}
		activeSources.current.clear();
		setPlayingMidi(null);
	}

	async function loadOne(def: PresetDef) {
		if (loadStates[def.id] === "loading" || loadStates[def.id] === "ready") return;
		setLoadStates((s) => ({ ...s, [def.id]: "loading" }));
		try {
			const ctx = getCtx();
			const preset = await loadAndDecodePreset(def, ctx, appendLog);
			loadedPresets.current.set(def.id, preset);
			setLoadStates((s) => ({ ...s, [def.id]: "ready" }));
			setSelectedId((prev) => prev ?? def.id);
		} catch (err) {
			appendLog(`[${def.id}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
			setLoadStates((s) => ({ ...s, [def.id]: "error" }));
		}
	}

	function loadAll() {
		void Promise.all(PRESET_CATALOG.map((def) => loadOne(def)));
	}

	function playNote(presetId: string, midi: number) {
		const preset = loadedPresets.current.get(presetId);
		if (!preset) return;
		stopAll();
		const ctx = getCtx();
		const src = scheduleNote(preset, midi, ctx, ctx.currentTime, 1.4);
		if (src) {
			activeSources.current.add(src);
			src.onended = () => activeSources.current.delete(src);
			setPlayingMidi(midi);
		}
	}

	function playSequential(presetId: string) {
		const preset = loadedPresets.current.get(presetId);
		if (!preset) return;
		stopAll();
		const ctx = getCtx();
		const noteDuration = 0.9;
		const step = noteDuration + 0.15;

		let when = ctx.currentTime + 0.05;
		for (const midi of MIDI_RANGE) {
			const src = scheduleNote(preset, midi, ctx, when, noteDuration);
			if (src) {
				activeSources.current.add(src);
				src.onended = () => activeSources.current.delete(src);
			}
			when += step;
		}

		function tick(index: number) {
			if (index >= MIDI_RANGE.length) {
				setPlayingMidi(null);
				return;
			}
			setPlayingMidi(MIDI_RANGE[index]);
			seqTimer.current = setTimeout(() => tick(index + 1), step * 1000);
		}
		tick(0);
	}

	const isActiveReady = selectedId !== null && loadStates[selectedId] === "ready";
	const anyLoading = Object.values(loadStates).some((s) => s === "loading");

	// Group presets for display
	const groups = PRESET_CATALOG.reduce<Record<string, PresetDef[]>>((acc, def) => {
		(acc[def.group] ??= []).push(def);
		return acc;
	}, {});

	return (
		<div
			style={{
				fontFamily: "monospace",
				padding: "24px",
				maxWidth: "960px",
				margin: "0 auto",
				background: "#0f172a",
				minHeight: "100vh",
				color: "#e2e8f0",
			}}
		>
			<h1 style={{ fontSize: "1.4rem", marginBottom: "4px", color: "#f8fafc" }}>
				Audio Diagnostic — MIDI {MIDI_LOW}–{MIDI_HIGH} (A/B Comparison)
			</h1>
			<p style={{ color: "#64748b", marginBottom: "20px", fontSize: "0.8rem" }}>
				Throwaway page for preset auditing. Delete after use.
			</p>

			{/* Top controls */}
			<div style={{ display: "flex", gap: "10px", marginBottom: "24px", flexWrap: "wrap" }}>
				<button onClick={loadAll} disabled={anyLoading} style={btn(!anyLoading, "#334155")}>
					Load All Presets
				</button>
				<button onClick={stopAll} style={btn(true, "#7f1d1d")}>
					Stop ■
				</button>
			</div>

			{/* Preset table */}
			<div style={{ marginBottom: "35px" }}>
				{Object.entries(groups).map(([group, defs]) => (
					<div key={group} style={{ marginBottom: "16px" }}>
						<div
							style={{
								fontSize: "0.7rem",
								color: "#94a3b8",
								textTransform: "uppercase",
								letterSpacing: "0.08em",
								marginBottom: "6px",
							}}
						>
							{group}
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							{defs.map((def) => {
								const state = loadStates[def.id];
								const isSelected = selectedId === def.id;
								const isReady = state === "ready";
								return (
									<div
										key={def.id}
										onClick={() => isReady && setSelectedId(def.id)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "10px",
											padding: "8px 12px",
											borderRadius: "6px",
											border: isSelected
												? "1px solid #4A6FA5"
												: "1px solid #1e293b",
											background: isSelected ? "#1e3a5f" : "#1e293b",
											cursor: isReady ? "pointer" : "default",
										}}
									>
										<span
											style={{
												color: STATE_COLOR[state],
												fontSize: "0.75rem",
												minWidth: "60px",
											}}
										>
											● {STATE_LABEL[state]}
										</span>
										<span style={{ flex: 1, fontSize: "0.85rem" }}>
											{def.label}
											{def.isCurrent && (
												<span
													style={{
														color: "#64748b",
														fontSize: "0.7rem",
														marginLeft: "8px",
													}}
												>
													(current)
												</span>
											)}
										</span>
										{isSelected && isReady && (
											<span style={{ color: "#4A6FA5", fontSize: "0.7rem" }}>
												← active
											</span>
										)}
										{!isReady && state !== "loading" && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													void loadOne(def);
												}}
												style={btn(true, "#334155")}
											>
												Load
											</button>
										)}
										{isReady && (
											<button
												onClick={(e) => {
													e.stopPropagation();
													playSequential(def.id);
													setSelectedId(def.id);
												}}
												style={btn(true, "#4A6FA5")}
											>
												Play All ▶
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>

			{/* Active preset note grid */}
			<div style={{ marginBottom: "28px", marginTop: "20px" }}>
				<div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "8px" }}>
					{selectedId && isActiveReady
						? `Note grid → active: ${PRESET_CATALOG.find((p) => p.id === selectedId)?.label ?? selectedId}`
						: "Note grid — load and select a preset above"}
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
					{MIDI_RANGE.map((midi) => {
						const isPlaying = playingMidi === midi;
						const enabled = isActiveReady;
						return (
							<button
								key={midi}
								onClick={() => selectedId && playNote(selectedId, midi)}
								disabled={!enabled}
								title={`MIDI ${midi} — ${midiToName(midi)}`}
								style={{
									width: "44px",
									height: "44px",
									borderRadius: "5px",
									border: isPlaying ? "1px solid #6B8CAE" : "1px solid #334155",
									background: isPlaying
										? "#4A6FA5"
										: enabled
											? "#1e293b"
											: "#111827",
									color: isPlaying ? "#fff" : enabled ? "#cbd5e1" : "#374151",
									cursor: enabled ? "pointer" : "not-allowed",
									padding: "2px",
									textAlign: "center",
									transition: "background 0.08s",
								}}
							>
								<span
									style={{
										fontSize: "0.6rem",
										display: "block",
										lineHeight: 1.2,
									}}
								>
									{midiToName(midi)}
								</span>
								<span
									style={{
										fontSize: "0.55rem",
										color: isPlaying ? "#bcd" : "#475569",
									}}
								>
									{midi}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Log */}
			<div>
				<div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "4px" }}>Log</div>
				<div
					style={{
						background: "#020617",
						borderRadius: "6px",
						padding: "10px 12px",
						maxHeight: "160px",
						overflowY: "auto",
						fontSize: "0.7rem",
						lineHeight: "1.7",
						color: "#64748b",
					}}
				>
					{log.length === 0 ? (
						<span style={{ color: "#1e293b" }}>No output yet.</span>
					) : (
						log.map((line, i) => <div key={i}>{line}</div>)
					)}
				</div>
			</div>
		</div>
	);
}

function btn(enabled: boolean, bg: string): React.CSSProperties {
	return {
		padding: "5px 12px",
		borderRadius: "5px",
		border: "none",
		background: enabled ? bg : "#1e293b",
		color: enabled ? "#e2e8f0" : "#475569",
		cursor: enabled ? "pointer" : "not-allowed",
		fontSize: "0.8rem",
		whiteSpace: "nowrap",
	};
}
