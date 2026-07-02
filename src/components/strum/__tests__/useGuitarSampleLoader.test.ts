import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	parsePresetFromJs,
	findZoneForMidi,
	triggerStrum,
	cancelStrums,
	STRUM_PITCHES,
	MUTED_MAX_DURATION_S,
	MIN_DECAY_TC_S,
	SOURCE_STOP_BUFFER_S,
	_resetCachesForTesting,
	_setReadyPresetForTesting,
	_pcmSampleToBuffer,
	SampleLoadError,
} from "@/components/strum/useGuitarSampleLoader";
import type { WafPreset, WafZone } from "@/components/strum/useGuitarSampleLoader";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

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
		file: btoa("fake-audio-data"),
		...overrides,
	};
}

function makePreset(zones: WafZone[] = [makeZone()]): WafPreset {
	return { zones };
}

const VALID_ZONE_JSON =
	'{"keyRangeLow":0,"keyRangeHigh":127,"originalPitch":6000,' +
	'"coarseTune":0,"fineTune":0,"loopStart":0,"loopEnd":0,' +
	`"sampleRate":44100,"file":"${btoa("fake-audio")}"}`;

function mockPresetJs(varName: string): string {
	return `if(typeof module!=="undefined")module.exports={};var ${varName}={"zones":[${VALID_ZONE_JSON}]};`;
}

function makeFakeBuffer(): AudioBuffer {
	return {} as AudioBuffer;
}

/** Build a mock AudioContext that records BufferSource creation for strum tests. */
function makeMockStrumCtx() {
	type MockSource = {
		buffer: AudioBuffer | null;
		playbackRate: { value: number };
		loop: boolean;
		loopStart: number;
		loopEnd: number;
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		onended: (() => void) | null;
		connect: ReturnType<typeof vi.fn>;
	};

	const sources: MockSource[] = [];

	const mockGain = {
		gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
		connect: vi.fn().mockReturnThis(),
	};

	const ctx = {
		createBufferSource: vi.fn(() => {
			const source: MockSource = {
				buffer: null,
				playbackRate: { value: 1 },
				loop: false,
				loopStart: 0,
				loopEnd: 0,
				start: vi.fn(),
				stop: vi.fn(),
				onended: null,
				connect: vi.fn().mockReturnValue(mockGain),
			};
			sources.push(source);
			return source;
		}),
		createGain: vi.fn(() => mockGain),
		currentTime: 0,
	} as unknown as AudioContext;

	return { ctx, sources, mockGain };
}

// ─── _pcmSampleToBuffer ───────────────────────────────────────────────────────

function makePcmBase64(bytePairs: [number, number][]): string {
	const bytes = bytePairs.flatMap(([lo, hi]) => [lo, hi]);
	return btoa(String.fromCharCode(...bytes));
}

function makePcmCtx(sampleCount: number) {
	const float32 = new Float32Array(sampleCount);
	const mockBuffer = { getChannelData: () => float32 } as unknown as AudioBuffer;
	const ctx = { createBuffer: vi.fn(() => mockBuffer) } as unknown as AudioContext;
	return { ctx, float32 };
}

describe("_pcmSampleToBuffer — 16-bit LE PCM decoding", () => {
	it("decodes a positive value correctly", () => {
		const b64 = makePcmBase64([[0x01, 0x00]]);
		const { ctx, float32 } = makePcmCtx(1);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBeCloseTo(1 / 32768, 5);
	});

	it("decodes the maximum positive value (32767) correctly", () => {
		const b64 = makePcmBase64([[0xff, 0x7f]]);
		const { ctx, float32 } = makePcmCtx(1);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBeCloseTo(32767 / 32768, 5);
	});

	it("wraps values >= 32768 to negative (signed conversion)", () => {
		const b64 = makePcmBase64([[0x00, 0x80]]);
		const { ctx, float32 } = makePcmCtx(1);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBe(-1.0);
	});

	it("decodes -1 (0xFFFF) to the smallest negative float", () => {
		const b64 = makePcmBase64([[0xff, 0xff]]);
		const { ctx, float32 } = makePcmCtx(1);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBeCloseTo(-1 / 32768, 5);
	});

	it("decodes a silence sample (0x0000) to exactly 0.0", () => {
		const b64 = makePcmBase64([[0x00, 0x00]]);
		const { ctx, float32 } = makePcmCtx(1);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBe(0);
	});

	it("decodes multiple samples independently", () => {
		const b64 = makePcmBase64([[0x01, 0x00], [0x00, 0x80]]);
		const { ctx, float32 } = makePcmCtx(2);
		_pcmSampleToBuffer(b64, 44100, ctx);
		expect(float32[0]).toBeCloseTo(1 / 32768, 5);
		expect(float32[1]).toBe(-1.0);
	});

	it("passes the correct sampleRate to createBuffer", () => {
		const b64 = makePcmBase64([[0x00, 0x00]]);
		const float32 = new Float32Array(1);
		const mockBuffer = { getChannelData: () => float32 } as unknown as AudioBuffer;
		const createBuffer = vi.fn(() => mockBuffer);
		const ctx = { createBuffer } as unknown as AudioContext;
		_pcmSampleToBuffer(b64, 22050, ctx);
		expect(createBuffer).toHaveBeenCalledWith(1, 1, 22050);
	});
});

// ─── parsePresetFromJs ─────────────────────────────────────────────────────────

describe("parsePresetFromJs — success paths", () => {
	it("parses a valid preset assignment", () => {
		const js = mockPresetJs("_tone_0250_Test");
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
		expect(result.zones[0].originalPitch).toBe(6000);
	});

	it("handles whitespace around the assignment operator", () => {
		const js = `var _tone_0250_Test = {"zones":[${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
	});

	it("handles multi-zone presets", () => {
		const js = `var _tone_Test={"zones":[${VALID_ZONE_JSON},${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_Test");
		expect(result.zones).toHaveLength(2);
	});

	it("correctly selects the target variable when multiple assignments appear", () => {
		const js =
			`var _tone_OTHER={"zones":[]};` +
			`var _tone_0250_Test={"zones":[${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
	});

	it("parses real CDN format: unquoted keys, single-quoted strings, leading comma, JS comment", () => {
		const sampleB64 = btoa("fake-pcm-data");
		const js =
			`console.log('load _tone_CDN_Test');\n` +
			`var _tone_CDN_Test={\n` +
			`\tzones:[\n` +
			`\t\t{\n` +
			`\t\t\tmidi:25\n` +
			`\t\t\t,originalPitch:6000\n` +
			`\t\t\t,keyRangeLow:0\n` +
			`\t\t\t,keyRangeHigh:127\n` +
			`\t\t\t,coarseTune:0\n` +
			`\t\t\t,fineTune:-46\n` +
			`\t\t\t,loopStart:0\n` +
			`\t\t\t,loopEnd:0\n` +
			`\t\t\t,sampleRate:44100\n` +
			`\t\t\t,ahdsr:true\n` +
			`\t\t\t,sample:'${sampleB64}'\n` +
			`\t\t\t//_tone.mgtr\n` +
			`\t\t}\n` +
			`\t]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_CDN_Test");
		expect(result.zones).toHaveLength(1);
		expect(result.zones[0].originalPitch).toBe(6000);
		expect(result.zones[0].fineTune).toBe(-46);
		expect(result.zones[0].sample).toBe(sampleB64);
	});

	it("preserves // inside a base64 sample string and ignores the adjacent // comment", () => {
		const sampleWithSlashes = "AA//BB==";
		const js =
			`var _tone_Slash_Test={\n` +
			`\tzones:[{keyRangeLow:0,keyRangeHigh:127,originalPitch:6000,` +
			`coarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,` +
			`sample:'${sampleWithSlashes}'\n` +
			`//_tone.comment\n` +
			`}]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_Slash_Test");
		expect(result.zones[0].sample).toBe(sampleWithSlashes);
	});

	it("parses multi-zone CDN format with a // comment after each zone's sample", () => {
		const s1 = btoa("zone-one-pcm");
		const s2 = btoa("zone-two-pcm");
		const js =
			`console.log('load _tone_Multi_Test');\n` +
			`var _tone_Multi_Test={\n` +
			`\tzones:[\n` +
			`\t\t{\n` +
			`\t\t\tmidi:25,originalPitch:6000,keyRangeLow:0,keyRangeHigh:72,\n` +
			`\t\t\tcoarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,\n` +
			`\t\t\tsample:'${s1}'\n` +
			`\t\t\t//_tone.zone1\n` +
			`\t\t}\n` +
			`\t\t,{\n` +
			`\t\t\tmidi:25,originalPitch:8000,keyRangeLow:73,keyRangeHigh:127,\n` +
			`\t\t\tcoarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,\n` +
			`\t\t\tsample:'${s2}'\n` +
			`\t\t\t//_tone.zone2\n` +
			`\t\t}\n` +
			`\t]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_Multi_Test");
		expect(result.zones).toHaveLength(2);
		expect(result.zones[0].sample).toBe(s1);
		expect(result.zones[1].sample).toBe(s2);
		expect(result.zones[1].originalPitch).toBe(8000);
	});
});

describe("parsePresetFromJs — error paths", () => {
	it("throws SampleLoadError when the variable is not found", () => {
		const js = mockPresetJs("_tone_OTHER");
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("not found");
	});

	it("does not match a variable whose name is a prefix of the target", () => {
		const js = `var _tone_0250_TestLong={"zones":[${VALID_ZONE_JSON}]};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
	});

	it("throws SampleLoadError for unbalanced braces", () => {
		const js = `var _tone_0250_Test={"zones":[{`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("Unbalanced");
	});

	it("throws SampleLoadError when the extracted value lacks a zones array", () => {
		const js = `var _tone_0250_Test={"notZones":true};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("unexpected shape");
	});

	it("throws SampleLoadError when the extracted value is not valid JavaScript", () => {
		const js = `var _tone_0250_Test={broken js here};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
	});
});

// ─── findZoneForMidi ──────────────────────────────────────────────────────────

describe("findZoneForMidi — key-range matching", () => {
	it("returns the zone whose key range contains the MIDI note", () => {
		const zone = makeZone({ keyRangeLow: 48, keyRangeHigh: 65 });
		expect(findZoneForMidi(makePreset([zone]), 52)).toBe(zone);
	});

	it("matches on the lower boundary (keyRangeLow)", () => {
		const zone = makeZone({ keyRangeLow: 52, keyRangeHigh: 65 });
		expect(findZoneForMidi(makePreset([zone]), 52)).toBe(zone);
	});

	it("matches on the upper boundary (keyRangeHigh)", () => {
		const zone = makeZone({ keyRangeLow: 48, keyRangeHigh: 52 });
		expect(findZoneForMidi(makePreset([zone]), 52)).toBe(zone);
	});

	it("returns the first matching zone when multiple ranges overlap", () => {
		const z1 = makeZone({ keyRangeLow: 40, keyRangeHigh: 65 });
		const z2 = makeZone({ keyRangeLow: 50, keyRangeHigh: 70 });
		expect(findZoneForMidi(makePreset([z1, z2]), 55)).toBe(z1);
	});
});

describe("findZoneForMidi — nearest-pitch fallback", () => {
	it("falls back to the zone with originalPitch closest to the target MIDI note", () => {
		const low = makeZone({ keyRangeLow: 36, keyRangeHigh: 48, originalPitch: 4200 });
		const high = makeZone({ keyRangeLow: 65, keyRangeHigh: 80, originalPitch: 7200 });
		expect(findZoneForMidi(makePreset([low, high]), 52)).toBe(low);
	});

	it("picks the higher-pitch zone when it is nearer", () => {
		const low = makeZone({ keyRangeLow: 36, keyRangeHigh: 45, originalPitch: 3600 });
		const high = makeZone({ keyRangeLow: 70, keyRangeHigh: 80, originalPitch: 7800 });
		expect(findZoneForMidi(makePreset([low, high]), 68)).toBe(high);
	});

	it("throws SampleLoadError when preset has no zones", () => {
		expect(() => findZoneForMidi({ zones: [] }, 60)).toThrow(SampleLoadError);
		expect(() => findZoneForMidi({ zones: [] }, 60)).toThrow("no zones");
	});
});

// ─── triggerStrum ─────────────────────────────────────────────────────────────

describe("triggerStrum — multi-string strum scheduling", () => {
	beforeEach(() => {
		_resetCachesForTesting();
	});

	it("silently no-ops when the preset has not been preloaded", () => {
		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);
		expect(sources).toHaveLength(0);
	});

	it("creates one AudioBufferSourceNode per chord pitch (5 total for a full voicing)", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);

		expect(sources).toHaveLength(STRUM_PITCHES.length);
	});

	it("staggers note start times by 10 ms per string", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		const WHEN = 1.0;
		triggerStrum("down", ctx, {} as AudioNode, WHEN, 1.0);

		for (let i = 0; i < sources.length; i++) {
			expect(sources[i].start).toHaveBeenCalledWith(WHEN + i * 0.01);
		}
	});

	it("down uses ascending pitch order (low E → high E sweep)", () => {
		const pitchesScheduled: number[] = [];
		const zone = makeZone({
			buffer: makeFakeBuffer(),
			originalPitch: 6000,
			coarseTune: 0,
			fineTune: 0,
		});
		const preset = makePreset([zone]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);

		// Each source's playbackRate reflects the pitch it plays at; lower pitch → lower rate
		const rates = sources.map((s) => s.playbackRate.value);
		for (let i = 1; i < rates.length; i++) {
			expect(rates[i]).toBeGreaterThan(rates[i - 1]);
		}
		void pitchesScheduled; // type-check only
	});

	it("up uses descending pitch order (high E → low E sweep)", () => {
		const zone = makeZone({ buffer: makeFakeBuffer(), originalPitch: 6000, coarseTune: 0, fineTune: 0 });
		const preset = makePreset([zone]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("up", ctx, {} as AudioNode, 0, 1.0);

		const rates = sources.map((s) => s.playbackRate.value);
		for (let i = 1; i < rates.length; i++) {
			expect(rates[i]).toBeLessThan(rates[i - 1]);
		}
	});

	it("muted effective duration is capped at MUTED_MAX_DURATION_S even when noteDuration is larger", () => {
		const fakeBuffer = makeFakeBuffer();
		const steelPreset = makePreset([makeZone({ buffer: fakeBuffer })]);
		const mutedPreset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyPresetForTesting("steelGuitar", steelPreset);
		_setReadyPresetForTesting("mutedGuitar", mutedPreset);

		// Both receive the same generous noteDuration; muted must still stop early.
		const { ctx: ctxDown, sources: downSources } = makeMockStrumCtx();
		triggerStrum("down", ctxDown, {} as AudioNode, 0, 1.0);

		const { ctx: ctxMuted, sources: mutedSources } = makeMockStrumCtx();
		triggerStrum("muted", ctxMuted, {} as AudioNode, 0, 1.0);

		const downStopTime = (downSources[0].stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
		const mutedStopTime = (mutedSources[0].stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
		expect(mutedStopTime).toBeCloseTo(0 + MUTED_MAX_DURATION_S + SOURCE_STOP_BUFFER_S, 5);
		expect(mutedStopTime).toBeLessThan(downStopTime);
	});

	it("uses the steelGuitar preset for down/up and mutedGuitar for muted", () => {
		const steelBuffer = { _id: "steel" } as unknown as AudioBuffer;
		const mutedBuffer = { _id: "muted" } as unknown as AudioBuffer;
		const steelPreset = makePreset([makeZone({ buffer: steelBuffer })]);
		const mutedPreset = makePreset([makeZone({ buffer: mutedBuffer })]);
		_setReadyPresetForTesting("steelGuitar", steelPreset);
		_setReadyPresetForTesting("mutedGuitar", mutedPreset);

		const { ctx: ctxDown, sources: downSrcs } = makeMockStrumCtx();
		triggerStrum("down", ctxDown, {} as AudioNode, 0, 1.0);
		expect(downSrcs[0].buffer).toBe(steelBuffer);

		const { ctx: ctxUp, sources: upSrcs } = makeMockStrumCtx();
		triggerStrum("up", ctxUp, {} as AudioNode, 0, 1.0);
		expect(upSrcs[0].buffer).toBe(steelBuffer);

		const { ctx: ctxMuted, sources: mutedSrcs } = makeMockStrumCtx();
		triggerStrum("muted", ctxMuted, {} as AudioNode, 0, 1.0);
		expect(mutedSrcs[0].buffer).toBe(mutedBuffer);
	});

	it("skips notes whose zone has no decoded buffer", () => {
		// Only the first zone has a buffer; second zone is undecoded
		const decodedZone = makeZone({ keyRangeLow: 0, keyRangeHigh: 60, buffer: makeFakeBuffer() });
		const undecodedZone = makeZone({ keyRangeLow: 61, keyRangeHigh: 127 }); // no buffer
		const preset = makePreset([decodedZone, undecodedZone]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);

		// STRUM_PITCHES = [48, 52, 55, 60, 64]
		// 48–60 fall in decodedZone; 64 falls in undecodedZone → 4 sources created
		expect(sources.length).toBe(4);
	});
});

// ─── triggerStrum — duration and decay time constant scaling ──────────────────

describe("triggerStrum — duration and decay time constant scaling", () => {
	beforeEach(() => {
		_resetCachesForTesting();
	});

	function setupSingleZonePreset(presetKey: "steelGuitar" | "mutedGuitar" = "steelGuitar") {
		const preset = makePreset([makeZone({ buffer: makeFakeBuffer() })]);
		_setReadyPresetForTesting(presetKey, preset);
		return makeMockStrumCtx();
	}

	it("scales decay τ proportionally at slow tempo (60 BPM, 1-cell beat → 1.0 s/cell)", () => {
		const { ctx, mockGain } = setupSingleZonePreset();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);
		// String 0: adjustedDuration = 1.0, τ = max(1.0 × 0.25, MIN_DECAY_TC_S) = 0.25
		const tau = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls[0][2] as number;
		expect(tau).toBeCloseTo(Math.max(1.0 * 0.25, MIN_DECAY_TC_S), 5);
	});

	it("scales decay τ proportionally at normal tempo (120 BPM, 4-cell beat → 0.125 s/cell)", () => {
		const { ctx, mockGain } = setupSingleZonePreset();
		triggerStrum("down", ctx, {} as AudioNode, 0, 0.125);
		// String 0: adjustedDuration = 0.125, τ = max(0.125 × 0.25, 0.03) = 0.03125
		const tau = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls[0][2] as number;
		expect(tau).toBeCloseTo(Math.max(0.125 * 0.25, MIN_DECAY_TC_S), 5);
	});

	it("clamps decay τ to MIN_DECAY_TC_S at fast tempo (180 BPM, 4-cell beat → ~0.0833 s/cell)", () => {
		const { ctx, mockGain } = setupSingleZonePreset();
		const fastCellDur = 60 / 180 / 4; // ~0.0833 s
		triggerStrum("down", ctx, {} as AudioNode, 0, fastCellDur);
		// String 0: adjustedDuration ≈ 0.0833, τ = max(0.0208, 0.03) = 0.03 (floor)
		const tau = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls[0][2] as number;
		expect(tau).toBeCloseTo(MIN_DECAY_TC_S, 5);
	});

	it("schedules every string to stop at when + noteDuration + SOURCE_STOP_BUFFER_S (stagger cancels out)", () => {
		const { ctx, sources } = setupSingleZonePreset();
		const WHEN = 2.0;
		const NOTE_DUR = 0.5;
		triggerStrum("down", ctx, {} as AudioNode, WHEN, NOTE_DUR);
		expect(sources).toHaveLength(STRUM_PITCHES.length);
		for (const source of sources) {
			const stopTime = (source.stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
			expect(stopTime).toBeCloseTo(WHEN + NOTE_DUR + SOURCE_STOP_BUFFER_S, 5);
		}
	});

	it("decay starts immediately at the note onset (setTargetAtTime startTime === source.start time)", () => {
		const { ctx, sources, mockGain } = setupSingleZonePreset();
		const WHEN = 1.5;
		triggerStrum("down", ctx, {} as AudioNode, WHEN, 0.5);
		// String 0 fires at WHEN + 0; setTargetAtTime should also start at WHEN + 0
		const startTime = (sources[0].start as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
		const decayStart = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock.calls[0][1] as number;
		expect(decayStart).toBeCloseTo(startTime, 5);
	});

	it("muted clamps effective duration to MUTED_MAX_DURATION_S; all sources stop at that boundary", () => {
		const { ctx, sources } = setupSingleZonePreset("mutedGuitar");
		const WHEN = 0;
		triggerStrum("muted", ctx, {} as AudioNode, WHEN, 1.0); // large noteDuration, muted cap applies
		expect(sources.length).toBeGreaterThan(0);
		for (const source of sources) {
			const stopTime = (source.stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
			expect(stopTime).toBeCloseTo(WHEN + MUTED_MAX_DURATION_S + SOURCE_STOP_BUFFER_S, 5);
		}
	});

	it("muted uses the minimum of noteDuration and MUTED_MAX_DURATION_S when noteDuration is smaller", () => {
		const { ctx, sources } = setupSingleZonePreset("mutedGuitar");
		const shortDur = 0.04; // shorter than MUTED_MAX_DURATION_S
		triggerStrum("muted", ctx, {} as AudioNode, 0, shortDur);
		expect(sources.length).toBeGreaterThan(0);
		const stopTime = (sources[0].stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
		expect(stopTime).toBeCloseTo(0 + shortDur + SOURCE_STOP_BUFFER_S, 5);
	});
});

// ─── cancelStrums ─────────────────────────────────────────────────────────────

describe("cancelStrums", () => {
	beforeEach(() => {
		_resetCachesForTesting();
	});

	it("stops all active source nodes", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);
		expect(sources.length).toBeGreaterThan(0);

		// Clear the scheduled-stop calls from triggerStrum so we can isolate cancelStrums
		sources.forEach((s) => (s.stop as ReturnType<typeof vi.fn>).mockClear());

		cancelStrums();

		sources.forEach((s) => expect(s.stop).toHaveBeenCalled());
	});

	it("is idempotent — calling twice does not throw", () => {
		expect(() => { cancelStrums(); cancelStrums(); }).not.toThrow();
	});
});

// ─── Live CDN integration ─────────────────────────────────────────────────────
//
// Skipped by default. Run with: INTEGRATION=1 npm test

const CDN_BASE = "https://surikov.github.io/webaudiofontdata/sound/";

describe.skipIf(!process.env.INTEGRATION)(
	"parsePresetFromJs — live CDN integration (INTEGRATION=1 npm test)",
	() => {
		it.each([
			["0250_SoundBlasterOld_sf2", "_tone_0250_SoundBlasterOld_sf2", 3],
			["0280_SoundBlasterOld_sf2", "_tone_0280_SoundBlasterOld_sf2", 2],
		] as const)(
			"parses live CDN preset %s with Function() and validates all zones",
			async (key, varName, expectedZones) => {
				const res = await fetch(`${CDN_BASE}${key}.js`);
				expect(res.ok).toBe(true);
				const text = await res.text();

				const preset = parsePresetFromJs(text, varName);

				expect(preset.zones).toHaveLength(expectedZones);
				for (const zone of preset.zones) {
					expect(zone.sampleRate).toBeGreaterThan(0);
					expect(zone.keyRangeLow).toBeGreaterThanOrEqual(0);
					expect(zone.keyRangeHigh).toBeGreaterThan(zone.keyRangeLow);
					expect(typeof zone.originalPitch).toBe("number");
					expect(zone.sample !== undefined || zone.file !== undefined).toBe(true);
					if (zone.sample !== undefined) {
						expect(zone.sample.length).toBeGreaterThan(0);
						expect(() => atob(zone.sample!)).not.toThrow();
					}
				}
			},
			15_000,
		);
	},
);
