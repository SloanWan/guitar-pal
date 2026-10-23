import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	FINGERPICK_MIDI_HIGH,
	FINGERPICK_MIDI_LOW,
	PRESET_BASE_URL,
	STRUM_PITCHES,
	_resetCachesForTesting,
	_resetFingerpickCachesForTesting,
	cancelStrums,
	getBufferForMidi,
	parsePreset,
	preloadFingerpickPresets,
	preloadStrumPresets,
	triggerStrum,
	type WafPreset,
} from "@/components/strum/useGuitarSampleLoader";
import {
	PIANO_PRESET,
	_resetPianoCacheForTesting,
	cancelPianoNotes,
	preloadPianoPreset,
	triggerPianoNote,
} from "@/components/fretboard/pianoSampleLoader";
import { PIANO_61 } from "@/lib/piano/keys";

// The presets the app ships (#366), read off disk exactly as public/ serves them.
const PUBLIC_DIR = path.resolve(__dirname, "../../../../public");
const PRESET_DIR = path.join(PUBLIC_DIR, PRESET_BASE_URL);

function readPreset(key: string): WafPreset {
	return parsePreset(JSON.parse(readFileSync(path.join(PRESET_DIR, `${key}.json`), "utf8")), key);
}

function coversExactly(preset: WafPreset, midi: number): boolean {
	return preset.zones.some((z) => z.keyRangeLow <= midi && midi <= z.keyRangeHigh);
}

function range(from: number, to: number): number[] {
	return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** An AudioContext that decodes anything and records the sources it starts. */
function makeCtx() {
	const sources: { buffer: AudioBuffer | null }[] = [];
	const gain = {
		gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
		connect: vi.fn().mockReturnThis(),
	};
	const ctx = {
		decodeAudioData: vi.fn(async () => ({ duration: 1 }) as AudioBuffer),
		createBufferSource: vi.fn(() => {
			const source = {
				buffer: null,
				playbackRate: { value: 1 },
				loop: false,
				start: vi.fn(),
				stop: vi.fn(),
				onended: null,
				connect: vi.fn().mockReturnValue(gain),
			};
			sources.push(source);
			return source;
		}),
		createGain: vi.fn(() => gain),
		currentTime: 0,
	} as unknown as AudioContext;
	return { ctx, sources };
}

const requested: string[] = [];

beforeEach(() => {
	_resetCachesForTesting();
	_resetFingerpickCachesForTesting();
	_resetPianoCacheForTesting();
	requested.length = 0;
	// Serve public/ the way the app's own origin does.
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			requested.push(url);
			const text = readFileSync(path.join(PUBLIC_DIR, url), "utf8");
			return { ok: true, json: async () => JSON.parse(text) };
		}),
	);
});

afterEach(() => {
	cancelStrums();
	cancelPianoNotes();
	vi.unstubAllGlobals();
});

describe("bundled WebAudioFont presets", () => {
	it("ships every file it loads, and nothing it doesn't", async () => {
		const { ctx } = makeCtx();
		await Promise.all([preloadStrumPresets(ctx), preloadFingerpickPresets(ctx), preloadPianoPreset(ctx)]);

		const served = readdirSync(PRESET_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => `${PRESET_BASE_URL}${f}`);
		expect([...new Set(requested)].sort()).toEqual(served.sort());
		for (const url of requested) expect(url.startsWith(PRESET_BASE_URL)).toBe(true);
	});

	it("passes the loader's check, every zone carrying base64 audio", () => {
		for (const file of readdirSync(PRESET_DIR).filter((f) => f.endsWith(".json"))) {
			const preset = readPreset(file.replace(/\.json$/, ""));
			for (const zone of preset.zones) {
				const audio = zone.file ?? zone.sample ?? "";
				expect(atob(audio).length).toBeGreaterThan(0);
			}
		}
	});

	it("covers the strum voicing on both strum presets", async () => {
		expect(STRUM_PITCHES.every((m) => coversExactly(readPreset("0250_LK_AcousticSteel_SF2_file"), m))).toBe(true);
		expect(STRUM_PITCHES.every((m) => coversExactly(readPreset("0280_Chaos_sf2_file"), m))).toBe(true);

		const { ctx, sources } = makeCtx();
		await preloadStrumPresets(ctx);
		triggerStrum("down", ctx, {} as AudioNode, 0, 0.25);
		triggerStrum("muted", ctx, {} as AudioNode, 0, 0.25);
		expect(sources.length).toBeGreaterThanOrEqual(STRUM_PITCHES.length + 1);
		expect(sources.every((s) => s.buffer !== null)).toBe(true);
	});

	it("covers the whole fingerpick range, open low E to the 22nd fret", async () => {
		const pitches = range(FINGERPICK_MIDI_LOW, FINGERPICK_MIDI_HIGH);
		expect(pitches.every((m) => coversExactly(readPreset("0250_LK_AcousticSteel_SF2_file"), m))).toBe(true);

		const { ctx } = makeCtx();
		await preloadFingerpickPresets(ctx);
		for (const midi of pitches) expect(() => getBufferForMidi("pluck", midi)).not.toThrow();
	});

	it("covers the 61-key piano", async () => {
		const pitches = range(PIANO_61.fromMidi, PIANO_61.toMidi);
		expect(pitches.every((m) => coversExactly(readPreset(PIANO_PRESET.key), m))).toBe(true);

		const { ctx, sources } = makeCtx();
		await preloadPianoPreset(ctx);
		for (const midi of pitches) triggerPianoNote(midi, ctx, {} as AudioNode, 0);
		expect(sources).toHaveLength(pitches.length);
	});
});
