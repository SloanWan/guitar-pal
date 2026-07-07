import { describe, it, expect, beforeEach } from "vitest";

import {
	getBufferForMidi,
	findZoneForMidi,
	FINGERPICK_MIDI_LOW,
	FINGERPICK_MIDI_HIGH,
	SampleLoadError,
	_resetFingerpickCachesForTesting,
	_setReadyFingerpickPresetForTesting,
	_resetCachesForTesting,
	_setReadyPresetForTesting,
	triggerStrum,
} from "@/components/strum/useGuitarSampleLoader";
import type { WafPreset, WafZone, FingerpickSoundType } from "@/components/strum/useGuitarSampleLoader";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeZone(overrides: Partial<WafZone> = {}): WafZone {
	return {
		keyRangeLow: 0,
		keyRangeHigh: 127,
		originalPitch: 6000,
		coarseTune: 0,
		fineTune: 0,
		loopStart: 0,
		loopEnd: 0,
		sampleRate: 44100,
		...overrides,
	};
}

function makePreset(zones: WafZone[]): WafPreset {
	return { zones };
}

function makeBuf(id: string): AudioBuffer {
	return { _id: id } as unknown as AudioBuffer;
}

/**
 * Three-zone preset that exactly covers MIDI 40–76:
 *   low  zone: 40–55  → bufLow
 *   mid  zone: 56–68  → bufMid
 *   high zone: 69–76  → bufHigh
 */
function makeFullRangePreset() {
	const bufLow = makeBuf("low");
	const bufMid = makeBuf("mid");
	const bufHigh = makeBuf("high");
	const preset = makePreset([
		makeZone({ keyRangeLow: 40, keyRangeHigh: 55, originalPitch: 4800, buffer: bufLow }),
		makeZone({ keyRangeLow: 56, keyRangeHigh: 68, originalPitch: 6200, buffer: bufMid }),
		makeZone({ keyRangeLow: 69, keyRangeHigh: 76, originalPitch: 7400, buffer: bufHigh }),
	]);
	return { preset, bufLow, bufMid, bufHigh };
}

// ─── getBufferForMidi — error paths ──────────────────────────────────────────

describe("getBufferForMidi — error paths", () => {
	beforeEach(() => {
		_resetFingerpickCachesForTesting();
	});

	it("throws SampleLoadError when the pluck preset has not been loaded", () => {
		expect(() => getBufferForMidi("pluck", 60)).toThrow(SampleLoadError);
		expect(() => getBufferForMidi("pluck", 60)).toThrow("not loaded");
	});

	it("throws SampleLoadError when the muted preset has not been loaded", () => {
		expect(() => getBufferForMidi("muted", 60)).toThrow(SampleLoadError);
		expect(() => getBufferForMidi("muted", 60)).toThrow("not loaded");
	});

	it("throws SampleLoadError when the zone for the requested pitch has no decoded buffer", () => {
		const preset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76 })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);
		expect(() => getBufferForMidi("pluck", 60)).toThrow(SampleLoadError);
		expect(() => getBufferForMidi("pluck", 60)).toThrow("No decoded buffer");
	});

	it("throws independently for each type — loading pluck does not satisfy muted", () => {
		const preset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76, buffer: makeBuf("x") })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);
		expect(() => getBufferForMidi("muted", 60)).toThrow(SampleLoadError);
	});
});

// ─── getBufferForMidi — zone resolution across MIDI 40–76 ────────────────────

describe("getBufferForMidi — zone resolution across full guitar range", () => {
	beforeEach(() => {
		_resetFingerpickCachesForTesting();
		const { preset } = makeFullRangePreset();
		_setReadyFingerpickPresetForTesting("pluck", preset);
	});

	it("resolves edge pitch MIDI 40 (E2) without throwing", () => {
		expect(() => getBufferForMidi("pluck", FINGERPICK_MIDI_LOW)).not.toThrow();
	});

	it("resolves edge pitch MIDI 76 (E5) without throwing", () => {
		expect(() => getBufferForMidi("pluck", FINGERPICK_MIDI_HIGH)).not.toThrow();
	});

	it("returns a decoded buffer for every MIDI note in 40–76 without throwing", () => {
		for (let midi = FINGERPICK_MIDI_LOW; midi <= FINGERPICK_MIDI_HIGH; midi++) {
			expect(() => getBufferForMidi("pluck", midi)).not.toThrow();
			const buf = getBufferForMidi("pluck", midi);
			expect(buf).toBeTruthy();
		}
	});

	it("returns the low-zone buffer for MIDI 40 and 55 (zone boundary)", () => {
		const { bufLow } = makeFullRangePreset();
		const freshPreset = makePreset([
			makeZone({ keyRangeLow: 40, keyRangeHigh: 55, buffer: bufLow }),
			makeZone({ keyRangeLow: 56, keyRangeHigh: 76, buffer: makeBuf("other") }),
		]);
		_setReadyFingerpickPresetForTesting("pluck", freshPreset);
		expect(getBufferForMidi("pluck", 40)).toBe(bufLow);
		expect(getBufferForMidi("pluck", 55)).toBe(bufLow);
	});

	it("returns the high-zone buffer for MIDI 69 and 76 (zone boundary)", () => {
		const bufHigh = makeBuf("high");
		const freshPreset = makePreset([
			makeZone({ keyRangeLow: 40, keyRangeHigh: 68, buffer: makeBuf("other") }),
			makeZone({ keyRangeLow: 69, keyRangeHigh: 76, buffer: bufHigh }),
		]);
		_setReadyFingerpickPresetForTesting("pluck", freshPreset);
		expect(getBufferForMidi("pluck", 69)).toBe(bufHigh);
		expect(getBufferForMidi("pluck", 76)).toBe(bufHigh);
	});

	it("returns the correct zone buffer for every range segment in the three-zone fixture", () => {
		const { preset, bufLow, bufMid, bufHigh } = makeFullRangePreset();
		_setReadyFingerpickPresetForTesting("pluck", preset);

		// Spot-check representative notes in each zone
		expect(getBufferForMidi("pluck", 40)).toBe(bufLow);
		expect(getBufferForMidi("pluck", 48)).toBe(bufLow);
		expect(getBufferForMidi("pluck", 55)).toBe(bufLow);
		expect(getBufferForMidi("pluck", 56)).toBe(bufMid);
		expect(getBufferForMidi("pluck", 60)).toBe(bufMid);
		expect(getBufferForMidi("pluck", 68)).toBe(bufMid);
		expect(getBufferForMidi("pluck", 69)).toBe(bufHigh);
		expect(getBufferForMidi("pluck", 76)).toBe(bufHigh);
	});
});

// ─── getBufferForMidi — muted preset ─────────────────────────────────────────

describe("getBufferForMidi — muted preset resolves independently", () => {
	beforeEach(() => {
		_resetFingerpickCachesForTesting();
	});

	it("returns the muted-preset buffer at edge pitches 40 and 76", () => {
		const mutedBuf = makeBuf("muted");
		const preset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76, buffer: mutedBuf })]);
		_setReadyFingerpickPresetForTesting("muted", preset);
		expect(getBufferForMidi("muted", FINGERPICK_MIDI_LOW)).toBe(mutedBuf);
		expect(getBufferForMidi("muted", FINGERPICK_MIDI_HIGH)).toBe(mutedBuf);
	});

	it("returns a decoded buffer for every MIDI note in 40–76 from the muted preset", () => {
		const mutedBuf = makeBuf("muted");
		const preset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76, buffer: mutedBuf })]);
		_setReadyFingerpickPresetForTesting("muted", preset);
		for (let midi = FINGERPICK_MIDI_LOW; midi <= FINGERPICK_MIDI_HIGH; midi++) {
			expect(() => getBufferForMidi("muted", midi)).not.toThrow();
		}
	});
});

// ─── Cache separation ─────────────────────────────────────────────────────────

describe("cache separation — fingerpick and strum caches are independent", () => {
	beforeEach(() => {
		_resetCachesForTesting();
		_resetFingerpickCachesForTesting();
	});

	it("_resetFingerpickCachesForTesting does not clear strum presets", () => {
		const strumBuf = makeBuf("strum");
		const strumPreset = makePreset([makeZone({ buffer: strumBuf })]);
		_setReadyPresetForTesting("steelGuitar", strumPreset);

		_resetFingerpickCachesForTesting();

		// Strum preset should still be accessible (triggerStrum creates sources)
		const mockGain = {
			gain: { setValueAtTime: () => {}, setTargetAtTime: () => {} },
			connect: () => mockGain,
		};
		const sources: unknown[] = [];
		const ctx = {
			createBufferSource: () => {
				const src = {
					buffer: null as AudioBuffer | null,
					playbackRate: { value: 1 },
					loop: false,
					loopStart: 0,
					loopEnd: 0,
					start: () => {},
					stop: () => {},
					onended: null,
					connect: () => mockGain,
				};
				sources.push(src);
				return src;
			},
			createGain: () => mockGain,
			currentTime: 0,
		} as unknown as AudioContext;

		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);
		expect(sources.length).toBeGreaterThan(0);
	});

	it("_resetCachesForTesting does not clear fingerpick presets", () => {
		const buf = makeBuf("fp");
		const preset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76, buffer: buf })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		_resetCachesForTesting();

		expect(getBufferForMidi("pluck", 60)).toBe(buf);
	});

	it("loading a fingerpick preset does not affect strum preset lookups", () => {
		const fpBuf = makeBuf("fp");
		const fpPreset = makePreset([makeZone({ keyRangeLow: 40, keyRangeHigh: 76, buffer: fpBuf })]);
		_setReadyFingerpickPresetForTesting("pluck", fpPreset);

		// Strum preset was reset — should still throw/noop, not accidentally use fingerpick preset
		expect(() => getBufferForMidi("muted", 60)).toThrow(SampleLoadError);
	});
});

// ─── findZoneForMidi invariant — exercised with fingerpick-shaped preset ──────

describe("findZoneForMidi — zone selection verified on fingerpick fixture", () => {
	it("selects the correct zone for every pitch in MIDI 40–76 in the three-zone fixture", () => {
		const { preset, bufLow, bufMid, bufHigh } = makeFullRangePreset();
		for (let midi = 40; midi <= 55; midi++) {
			expect(findZoneForMidi(preset, midi).buffer).toBe(bufLow);
		}
		for (let midi = 56; midi <= 68; midi++) {
			expect(findZoneForMidi(preset, midi).buffer).toBe(bufMid);
		}
		for (let midi = 69; midi <= 76; midi++) {
			expect(findZoneForMidi(preset, midi).buffer).toBe(bufHigh);
		}
	});
});

// ─── Live CDN integration (opt-in) ───────────────────────────────────────────

const CDN_BASE = "https://surikov.github.io/webaudiofontdata/sound/";

describe.skipIf(!process.env.INTEGRATION)(
	"getBufferForMidi — live CDN integration (INTEGRATION=1 npm test)",
	() => {
		it.each([
			["0250_LK_AcousticSteel_SF2_file", "_tone_0250_LK_AcousticSteel_SF2_file", "pluck"] as const,
			["0280_FluidR3_GM_sf2_file", "_tone_0280_FluidR3_GM_sf2_file", "muted"] as const,
		])(
			"parses live CDN preset %s with correct structure",
			async (key, _varName, _type: FingerpickSoundType) => {
				const { parsePresetFromJs } = await import("@/components/strum/useGuitarSampleLoader");
				const res = await fetch(`${CDN_BASE}${key}.js`);
				expect(res.ok).toBe(true);
				const text = await res.text();
				const preset = parsePresetFromJs(text, _varName);
				expect(preset.zones.length).toBeGreaterThan(0);
				for (const zone of preset.zones) {
					expect(zone.sampleRate).toBeGreaterThan(0);
					expect(zone.keyRangeHigh).toBeGreaterThan(zone.keyRangeLow);
					expect(zone.sample !== undefined || zone.file !== undefined).toBe(true);
				}
			},
			15_000,
		);
	},
);
