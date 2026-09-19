import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	PIANO_PRESET,
	PIANO_RING_SECONDS,
	PIANO_VOLUME,
	_resetPianoCacheForTesting,
	_setReadyPianoPresetForTesting,
	cancelPianoNotes,
	preloadPianoPreset,
	triggerPianoNote,
	zonesCovering,
} from "@/components/fretboard/pianoSampleLoader";
import { SOURCE_STOP_BUFFER_S, type WafPreset, type WafZone } from "@/components/strum/useGuitarSampleLoader";
import { PIANO_61 } from "@/lib/piano/keys";

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

/** Four zones: the piano's extremes on the outside, the keyboard's range across the middle two. */
function makeFourZonePreset(): WafPreset {
	return {
		zones: [
			makeZone({ keyRangeLow: 0, keyRangeHigh: 35, originalPitch: 2400 }),
			makeZone({ keyRangeLow: 36, keyRangeHigh: 60, originalPitch: 4800 }),
			makeZone({ keyRangeLow: 61, keyRangeHigh: 96, originalPitch: 7200 }),
			makeZone({ keyRangeLow: 97, keyRangeHigh: 127, originalPitch: 10800 }),
		],
	};
}

function makeCtx() {
	const sources: {
		buffer: AudioBuffer | null;
		playbackRate: { value: number };
		loop: boolean;
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		onended: (() => void) | null;
	}[] = [];
	const gain = {
		gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
		connect: vi.fn().mockReturnThis(),
	};
	const ctx = {
		createBufferSource: vi.fn(() => {
			const source = {
				buffer: null,
				playbackRate: { value: 1 },
				loop: false,
				loopStart: 0,
				loopEnd: 0,
				start: vi.fn(),
				stop: vi.fn(),
				onended: null,
				connect: vi.fn().mockReturnValue(gain),
			};
			sources.push(source);
			return source;
		}),
		createGain: vi.fn(() => gain),
		// 16-bit PCM zones decode through createBuffer.
		createBuffer: vi.fn((_ch: number, n: number) => ({ getChannelData: () => new Float32Array(n) })),
		destination: {},
		currentTime: 0,
	} as unknown as AudioContext;
	return { ctx, sources, gain };
}

/** A CDN-shaped preset file: a JS object literal, zones carrying 2-sample PCM. */
function presetJs(zones: { lo: number; hi: number }[]): string {
	const sample = btoa(String.fromCharCode(0, 0, 0, 64));
	const body = zones
		.map((z) => `{keyRangeLow:${z.lo},keyRangeHigh:${z.hi},originalPitch:6000,coarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,sample:"${sample}"}`)
		.join(",");
	return `console.log("preamble"); var ${PIANO_PRESET.varName} = { zones: [${body}] };`;
}

beforeEach(() => _resetPianoCacheForTesting());
afterEach(() => vi.unstubAllGlobals());

describe("zonesCovering", () => {
	it("returns only the zones a pitch in the range falls into, in preset order", () => {
		const preset = makeFourZonePreset();
		expect(zonesCovering(preset, PIANO_61)).toEqual([preset.zones[1], preset.zones[2]]);
		expect(zonesCovering(preset, { fromMidi: 40, toMidi: 45 })).toEqual([preset.zones[1]]);
	});
});

describe("preloadPianoPreset", () => {
	it("fetches the chosen preset once and decodes only the zones the keyboard reaches", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			text: async () =>
				presetJs([
					{ lo: 0, hi: 35 },
					{ lo: 36, hi: 60 },
					{ lo: 61, hi: 96 },
					{ lo: 97, hi: 127 },
				]),
		}));
		vi.stubGlobal("fetch", fetchMock);
		const { ctx } = makeCtx();

		await Promise.all([preloadPianoPreset(ctx), preloadPianoPreset(ctx)]);
		await preloadPianoPreset(ctx);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe(`https://surikov.github.io/webaudiofontdata/sound/${PIANO_PRESET.key}.js`);
		expect(ctx.createBuffer).toHaveBeenCalledTimes(2);

		// A key inside the decoded band sounds; one outside it is silent.
		const { ctx: play, sources } = makeCtx();
		triggerPianoNote(60, play, play.destination, 0);
		triggerPianoNote(20, play, play.destination, 0);
		expect(sources).toHaveLength(1);
	});

	it("forgets a failed download so the next call retries", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ ok: true, text: async () => presetJs([{ lo: 0, hi: 127 }]) });
		vi.stubGlobal("fetch", fetchMock);
		const { ctx } = makeCtx();
		await expect(preloadPianoPreset(ctx)).rejects.toThrow(/Network error/);
		await preloadPianoPreset(ctx);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});

describe("triggerPianoNote", () => {
	it("is silent before the preset is ready", () => {
		const { ctx, sources } = makeCtx();
		triggerPianoNote(60, ctx, ctx.destination, 0);
		expect(sources).toHaveLength(0);
	});

	it("plays the zone's buffer at the right rate with a piano ring", () => {
		const buffer = { length: 1 } as unknown as AudioBuffer;
		_setReadyPianoPresetForTesting({
			zones: [makeZone({ keyRangeLow: 36, keyRangeHigh: 96, originalPitch: 6000, buffer })],
		});
		const { ctx, sources, gain } = makeCtx();
		triggerPianoNote(72, ctx, ctx.destination, 1.5);
		expect(sources).toHaveLength(1);
		expect(sources[0].buffer).toBe(buffer);
		expect(sources[0].playbackRate.value).toBeCloseTo(2); // an octave above the sample
		expect(sources[0].start).toHaveBeenCalledWith(1.5);
		expect(sources[0].stop).toHaveBeenCalledWith(1.5 + PIANO_RING_SECONDS + SOURCE_STOP_BUFFER_S);
		expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(PIANO_VOLUME, 1.5);
		expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 1.5, PIANO_RING_SECONDS / 3);
	});

	it("honours loop points and stops every ringing note on cancel", () => {
		const buffer = {} as AudioBuffer;
		_setReadyPianoPresetForTesting({
			zones: [makeZone({ loopStart: 4410, loopEnd: 8820, buffer })],
		});
		const { ctx, sources } = makeCtx();
		triggerPianoNote(60, ctx, ctx.destination, 0);
		triggerPianoNote(64, ctx, ctx.destination, 0);
		expect(sources[0].loop).toBe(true);
		cancelPianoNotes();
		for (const s of sources) expect(s.stop).toHaveBeenCalledTimes(2); // scheduled stop + cancel
	});
});
