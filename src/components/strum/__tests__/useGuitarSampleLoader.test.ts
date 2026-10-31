import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	fetchPreset,
	findZoneForMidi,
	parsePreset,
	PRESET_BASE_URL,
	triggerStrum,
	triggerChordPreview,
	cancelStrums,
	STRUM_PITCHES,
	CHORD_PREVIEW_DURATION_S,
	DECAY_TIME_CONSTANT_RATIO,
	MUTED_MAX_DURATION_S,
	MIN_DECAY_TC_S,
	STRUM_RING_SECONDS,
	STRUM_STRING_VOLUME,
	RING_DECAY_TC_DIVISOR,
	SOURCE_STOP_BUFFER_S,
	_resetCachesForTesting,
	_setReadyPresetForTesting,
	_resetFingerpickCachesForTesting,
	_setReadyFingerpickPresetForTesting,
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

// ─── parsePreset / fetchPreset ───────────────────────────────────────────────

describe("parsePreset", () => {
	it("returns a preset whose zones carry what the scheduler reads", () => {
		const preset = makePreset([makeZone(), makeZone({ file: undefined, sample: btoa("pcm") })]);
		expect(parsePreset(preset, "test")).toBe(preset);
	});

	it("lets fields the scheduler ignores pass through", () => {
		const zone = { ...makeZone(), midi: 25, anchor: 0.02 };
		expect(parsePreset({ zones: [zone] }, "test").zones[0]).toBe(zone);
	});

	it.each([
		["a non-object", "nope", "has no zones"],
		["a missing zones array", { notZones: [] }, "has no zones"],
		["an empty zones array", { zones: [] }, "has no zones"],
		["a zone that is not an object", { zones: [42] }, "zone 0 is not an object"],
		["a zone without sampleRate", { zones: [{ ...makeZone(), sampleRate: undefined }] }, "zone 0 has no numeric sampleRate"],
		["a zone with a string pitch", { zones: [makeZone(), { ...makeZone(), originalPitch: "6000" }] }, "zone 1 has no numeric originalPitch"],
		["a zone with no audio", { zones: [makeZone({ file: undefined })] }, "zone 0 has neither file nor sample data"],
	])("throws SampleLoadError for %s", (_label, value, message) => {
		expect(() => parsePreset(value, "test")).toThrow(SampleLoadError);
		expect(() => parsePreset(value, "test")).toThrow(message);
	});
});

describe("fetchPreset", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("reads the bundled JSON from our own origin", async () => {
		const preset = makePreset();
		const fetchMock = vi.fn(async () => ({ ok: true, json: async () => preset }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchPreset("0250_Test")).resolves.toEqual(preset);
		expect(fetchMock).toHaveBeenCalledWith(`${PRESET_BASE_URL}0250_Test.json`);
		expect(PRESET_BASE_URL.startsWith("/")).toBe(true);
	});

	it.each([
		["a network error", () => Promise.reject(new Error("offline")), "Network error"],
		["an HTTP error", async () => ({ ok: false, status: 404 }), "HTTP 404"],
		["a body that is not JSON", async () => ({ ok: true, json: () => Promise.reject(new SyntaxError("bad")) }), "not valid JSON"],
		["JSON of the wrong shape", async () => ({ ok: true, json: async () => ({ zones: [] }) }), "has no zones"],
	])("throws SampleLoadError on %s", async (_label, respond, message) => {
		vi.stubGlobal("fetch", vi.fn(respond));
		await expect(fetchPreset("0250_Test")).rejects.toThrow(SampleLoadError);
		await expect(fetchPreset("0250_Test")).rejects.toThrow(message);
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

	it("keeps a whole strum under unity, so overlapping rings have headroom", () => {
		const preset = makePreset([makeZone({ buffer: makeFakeBuffer() })]);
		_setReadyPresetForTesting("steelGuitar", preset);

		const { ctx, mockGain } = makeMockStrumCtx();
		triggerStrum("down", ctx, {} as AudioNode, 0, 1.0);

		const volumes = mockGain.gain.setValueAtTime.mock.calls.map(
			(call) => call[0] as number,
		);
		expect(volumes).toHaveLength(STRUM_PITCHES.length);
		// The loudest string sits at the headroom ceiling, the rest taper under it.
		expect(volumes[0]).toBeCloseTo(STRUM_STRING_VOLUME, 5);
		expect(volumes.every((v, i) => i === 0 || v < volumes[i - 1])).toBe(true);
		// Five strings at once still leave room for the strums ringing under them.
		expect(volumes.reduce((sum, v) => sum + v, 0)).toBeLessThan(1.5);
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

	it("lets a struck string ring for STRUM_RING_SECONDS whatever the cell length", () => {
		// τ = ring / 3 regardless of tempo: the cell no longer cuts the note.
		const expectedTau = STRUM_RING_SECONDS / RING_DECAY_TC_DIVISOR;
		for (const cellDuration of [1.0, 0.125, 60 / 180 / 4]) {
			const { ctx, mockGain } = setupSingleZonePreset();
			triggerStrum("down", ctx, {} as AudioNode, 0, cellDuration);
			const tau = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock
				.calls[0][2] as number;
			expect(tau).toBeCloseTo(expectedTau, 5);
		}
	});

	it("stops each struck string a ring after its own onset, so the sweep is preserved", () => {
		const { ctx, sources } = setupSingleZonePreset();
		const WHEN = 2.0;
		triggerStrum("down", ctx, {} as AudioNode, WHEN, 0.5);
		expect(sources).toHaveLength(STRUM_PITCHES.length);
		sources.forEach((source, i) => {
			const startTime = (source.start as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
			const stopTime = (source.stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
			expect(stopTime).toBeCloseTo(startTime + STRUM_RING_SECONDS + SOURCE_STOP_BUFFER_S, 5);
			// Later strings start later; nothing is cut short to catch up.
			if (i > 0) {
				const prevStop = (sources[i - 1].stop as ReturnType<typeof vi.fn>).mock
					.calls[0][0] as number;
				expect(stopTime).toBeGreaterThan(prevStop);
			}
		});
	});

	it("rings past the cell it was struck in, so consecutive strums overlap", () => {
		const { ctx, sources } = setupSingleZonePreset();
		const CELL = 0.25;
		triggerStrum("down", ctx, {} as AudioNode, 0, CELL);
		const stopTime = (sources[0].stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
		expect(stopTime).toBeGreaterThan(CELL);
	});

	it("muted keeps the cell-scaled decay so the chuck stays percussive", () => {
		const { ctx, mockGain } = setupSingleZonePreset("mutedGuitar");
		triggerStrum("muted", ctx, {} as AudioNode, 0, 1.0);
		const tau = (mockGain.gain.setTargetAtTime as ReturnType<typeof vi.fn>).mock
			.calls[0][2] as number;
		expect(tau).toBeCloseTo(
			Math.max(MUTED_MAX_DURATION_S * DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S),
			5,
		);
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

// ─── triggerChordPreview ──────────────────────────────────────────────────────

describe("triggerChordPreview", () => {
	beforeEach(() => {
		_resetCachesForTesting();
		_resetFingerpickCachesForTesting();
	});

	it("silently no-ops when the fingerpick pluck preset has not been preloaded", () => {
		const { ctx, sources } = makeMockStrumCtx();
		triggerChordPreview([48, 52, 55], ctx, {} as AudioNode, 0);
		expect(sources).toHaveLength(0);
	});

	it("creates one AudioBufferSourceNode per pitch", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerChordPreview([48, 52, 55, 60, 64], ctx, {} as AudioNode, 0);

		expect(sources).toHaveLength(5);
	});

	it("plays pitches in ascending order (low-to-high) regardless of input order", () => {
		const zone = makeZone({ buffer: makeFakeBuffer(), originalPitch: 6000, coarseTune: 0, fineTune: 0 });
		const preset = makePreset([zone]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerChordPreview([64, 48, 55], ctx, {} as AudioNode, 0);

		const rates = sources.map((s) => s.playbackRate.value);
		for (let i = 1; i < rates.length; i++) {
			expect(rates[i]).toBeGreaterThan(rates[i - 1]);
		}
	});

	it("staggers note start times by 10 ms per note", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		const { ctx, sources } = makeMockStrumCtx();
		const WHEN = 1.0;
		triggerChordPreview([48, 52, 55], ctx, {} as AudioNode, WHEN);

		for (let i = 0; i < sources.length; i++) {
			expect(sources[i].start).toHaveBeenCalledWith(WHEN + i * 0.01);
		}
	});

	it("stops all sources at when + CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S", () => {
		const fakeBuffer = makeFakeBuffer();
		const preset = makePreset([makeZone({ buffer: fakeBuffer })]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		const { ctx, sources } = makeMockStrumCtx();
		const WHEN = 0.5;
		triggerChordPreview([48, 52, 55], ctx, {} as AudioNode, WHEN);

		for (const source of sources) {
			const stopTime = (source.stop as ReturnType<typeof vi.fn>).mock.calls[0][0] as number;
			expect(stopTime).toBeCloseTo(WHEN + CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S, 5);
		}
	});

	it("skips pitches whose zone has no decoded buffer", () => {
		const decodedZone = makeZone({ keyRangeLow: 0, keyRangeHigh: 60, buffer: makeFakeBuffer() });
		const undecodedZone = makeZone({ keyRangeLow: 61, keyRangeHigh: 127 });
		const preset = makePreset([decodedZone, undecodedZone]);
		_setReadyFingerpickPresetForTesting("pluck", preset);

		const { ctx, sources } = makeMockStrumCtx();
		triggerChordPreview([48, 55, 64], ctx, {} as AudioNode, 0);

		// 48 and 55 → decodedZone; 64 → undecodedZone → 2 sources
		expect(sources).toHaveLength(2);
	});

	it("does not touch the strum steelGuitar preset — triggerStrum still works independently", () => {
		const pluckBuffer = { _id: "pluck" } as unknown as AudioBuffer;
		const strumBuffer = { _id: "strum" } as unknown as AudioBuffer;
		_setReadyFingerpickPresetForTesting("pluck", makePreset([makeZone({ buffer: pluckBuffer })]));
		_setReadyPresetForTesting("steelGuitar", makePreset([makeZone({ buffer: strumBuffer })]));

		const { ctx: previewCtx, sources: previewSrcs } = makeMockStrumCtx();
		triggerChordPreview([48], previewCtx, {} as AudioNode, 0);
		expect(previewSrcs[0].buffer).toBe(pluckBuffer);

		const { ctx: strumCtx, sources: strumSrcs } = makeMockStrumCtx();
		triggerStrum("down", strumCtx, {} as AudioNode, 0, 1.0);
		expect(strumSrcs[0].buffer).toBe(strumBuffer);
	});
});
