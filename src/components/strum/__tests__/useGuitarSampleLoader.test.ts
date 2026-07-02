import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  parsePresetFromJs,
  findZoneForMidi,
  getStrumBuffer,
  _resetCachesForTesting,
  _pcmSampleToBuffer,
  SampleLoadError,
} from "@/components/strum/useGuitarSampleLoader";
import type { WafPreset, WafZone } from "@/components/strum/useGuitarSampleLoader";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeZone(overrides: Partial<WafZone> = {}): WafZone {
  return {
    keyRangeLow: 48,
    keyRangeHigh: 65,
    originalPitch: 6000, // MIDI 60
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

// Minimal valid preset JSON for the steel guitar variable
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

function makeMockCtx(fakeBuffer?: AudioBuffer) {
  const buf = fakeBuffer ?? makeFakeBuffer();
  const decodeAudioData = vi.fn(() => Promise.resolve(buf));
  const ctx = { decodeAudioData } as unknown as AudioContext;
  return { ctx, decodeAudioData, buf };
}

// ─── _pcmSampleToBuffer ───────────────────────────────────────────────────────

/**
 * Build a base64-encoded 16-bit LE PCM string from an array of sample pairs.
 * Each element of `bytePairs` is [lo, hi] for one 16-bit sample.
 */
function makePcmBase64(bytePairs: [number, number][]): string {
  const bytes = bytePairs.flatMap(([lo, hi]) => [lo, hi]);
  return btoa(String.fromCharCode(...bytes));
}

function makePcmCtx(sampleCount: number): {
  ctx: AudioContext;
  float32: Float32Array;
} {
  const float32 = new Float32Array(sampleCount);
  const mockBuffer = { getChannelData: () => float32 } as unknown as AudioBuffer;
  const ctx = { createBuffer: vi.fn(() => mockBuffer) } as unknown as AudioContext;
  return { ctx, float32 };
}

describe("_pcmSampleToBuffer — 16-bit LE PCM decoding", () => {
  it("decodes a positive value correctly", () => {
    // [0x01, 0x00] → n = 0*256 + 1 = 1 → float = 1/32768
    const b64 = makePcmBase64([[0x01, 0x00]]);
    const { ctx, float32 } = makePcmCtx(1);
    _pcmSampleToBuffer(b64, 44100, ctx);
    expect(float32[0]).toBeCloseTo(1 / 32768, 5);
  });

  it("decodes the maximum positive value (32767) correctly", () => {
    // [0xFF, 0x7F] → n = 127*256 + 255 = 32767 → float ≈ 0.99997
    const b64 = makePcmBase64([[0xff, 0x7f]]);
    const { ctx, float32 } = makePcmCtx(1);
    _pcmSampleToBuffer(b64, 44100, ctx);
    expect(float32[0]).toBeCloseTo(32767 / 32768, 5);
  });

  it("wraps values >= 32768 to negative (signed conversion)", () => {
    // [0x00, 0x80] → n = 128*256 + 0 = 32768 → n -= 65536 → -32768 → float = -1.0
    const b64 = makePcmBase64([[0x00, 0x80]]);
    const { ctx, float32 } = makePcmCtx(1);
    _pcmSampleToBuffer(b64, 44100, ctx);
    expect(float32[0]).toBe(-1.0);
  });

  it("decodes -1 (0xFFFF) to the smallest negative float", () => {
    // [0xFF, 0xFF] → n = 255*256 + 255 = 65535 → n -= 65536 → -1 → float = -1/32768
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
    // [0x01, 0x00, 0x00, 0x80] → [1, -32768] → [1/32768, -1.0]
    const b64 = makePcmBase64([
      [0x01, 0x00],
      [0x00, 0x80],
    ]);
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
    const otherPreset = `{"zones":[]}`;
    const js =
      `var _tone_OTHER=${otherPreset};` +
      `var _tone_0250_Test={"zones":[${VALID_ZONE_JSON}]};`;
    const result = parsePresetFromJs(js, "_tone_0250_Test");
    expect(result.zones).toHaveLength(1);
  });

  it("parses real CDN format: unquoted keys, single-quoted strings, leading comma, JS comment", () => {
    // Mirrors actual webaudiofontdata CDN files — valid JS, NOT valid JSON.
    // CDN files include a //-comment after the last zone property and before
    // the closing brace, e.g. //_tone.mgtr on the line after sample:'...'.
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
    // base64 can legitimately contain // (two consecutive '/' chars).
    // The JS engine must treat // inside the string literal as data, not a comment.
    const sampleWithSlashes = "AA//BB=="; // synthetic base64 containing //
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
    // Matches the actual structure of 0250/0280 CDN files: two zones, each
    // with a //-comment between the last property and the closing brace.
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
    // _tone_0250_Test is a prefix of _tone_0250_TestLong — must not match
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
    // low zone covers 36-48, originalPitch 4200 (MIDI 42)
    // high zone covers 65-80, originalPitch 7200 (MIDI 72)
    // Target MIDI 52: |42-52|=10 < |72-52|=20 → low zone wins
    const low = makeZone({ keyRangeLow: 36, keyRangeHigh: 48, originalPitch: 4200 });
    const high = makeZone({ keyRangeLow: 65, keyRangeHigh: 80, originalPitch: 7200 });
    expect(findZoneForMidi(makePreset([low, high]), 52)).toBe(low);
  });

  it("picks the higher-pitch zone when it is nearer", () => {
    const low = makeZone({ keyRangeLow: 36, keyRangeHigh: 45, originalPitch: 3600 });
    const high = makeZone({ keyRangeLow: 70, keyRangeHigh: 80, originalPitch: 7800 });
    // Target MIDI 68: |36-68|=32 vs |78-68|=10 → high wins
    expect(findZoneForMidi(makePreset([low, high]), 68)).toBe(high);
  });

  it("throws SampleLoadError when preset has no zones", () => {
    expect(() => findZoneForMidi({ zones: [] }, 60)).toThrow(SampleLoadError);
    expect(() => findZoneForMidi({ zones: [] }, 60)).toThrow("no zones");
  });
});

// ─── getStrumBuffer — caching and error handling ──────────────────────────────

describe("getStrumBuffer — caching", () => {
  beforeEach(() => {
    _resetCachesForTesting();
    vi.restoreAllMocks();
  });

  it("returns the same Promise object on repeated calls (no duplicate work)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
    } as unknown as Response);

    const { ctx } = makeMockCtx();
    const p1 = getStrumBuffer("down", ctx);
    const p2 = getStrumBuffer("down", ctx);

    expect(p1).toBe(p2);
    await p1;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("issues a single fetch for two sound types sharing the same preset", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
    } as unknown as Response);

    const { ctx, decodeAudioData } = makeMockCtx();
    await getStrumBuffer("down", ctx);
    await getStrumBuffer("up", ctx);

    // "down" and "up" both use steelGuitar → only one fetch
    expect(fetch).toHaveBeenCalledTimes(1);
    // But they map to different MIDI notes → two separate decodes
    expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it("issues a separate fetch for a sound type using a different preset", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockPresetJs("_tone_0280_SoundBlasterOld_sf2")),
      } as unknown as Response);

    const { ctx } = makeMockCtx();
    await getStrumBuffer("down", ctx);
    await getStrumBuffer("muted", ctx);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("concurrent calls share one in-flight request (no race duplication)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
    } as unknown as Response);

    const { ctx, decodeAudioData } = makeMockCtx();
    const [r1, r2, r3] = await Promise.all([
      getStrumBuffer("down", ctx),
      getStrumBuffer("down", ctx),
      getStrumBuffer("down", ctx),
    ]);

    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });
});

describe("getStrumBuffer — error handling and cache eviction", () => {
  beforeEach(() => {
    _resetCachesForTesting();
    vi.restoreAllMocks();
  });

  it("throws SampleLoadError on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { ctx } = makeMockCtx();
    await expect(getStrumBuffer("down", ctx)).rejects.toThrow(SampleLoadError);
    await expect(getStrumBuffer("down", ctx)).rejects.toThrow("Network error");
  });

  it("throws SampleLoadError on non-2xx HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);
    const { ctx } = makeMockCtx();
    await expect(getStrumBuffer("down", ctx)).rejects.toMatchObject({
      name: "SampleLoadError",
      message: expect.stringContaining("404"),
    });
  });

  it("throws SampleLoadError when decodeAudioData fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
    } as unknown as Response);

    const decodeAudioData = vi.fn().mockRejectedValue(new Error("bad encoding"));
    const ctx = { decodeAudioData } as unknown as AudioContext;

    await expect(getStrumBuffer("down", ctx)).rejects.toMatchObject({
      name: "SampleLoadError",
      message: expect.stringContaining("decodeAudioData"),
    });
  });

  it("evicts a failed preset so the next call retries the fetch", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("transient failure"))
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
      } as unknown as Response);

    const { ctx } = makeMockCtx();

    await expect(getStrumBuffer("down", ctx)).rejects.toThrow(SampleLoadError);
    // Second call should succeed because the failed preset was evicted
    await expect(getStrumBuffer("down", ctx)).resolves.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("evicts a failed buffer so the next call re-decodes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockPresetJs("_tone_0250_SoundBlasterOld_sf2")),
    } as unknown as Response);

    const fakeBuffer = makeFakeBuffer();
    const decodeAudioData = vi
      .fn()
      .mockRejectedValueOnce(new Error("first decode fails"))
      .mockResolvedValueOnce(fakeBuffer);
    const ctx = { decodeAudioData } as unknown as AudioContext;

    await expect(getStrumBuffer("down", ctx)).rejects.toThrow(SampleLoadError);
    const result = await getStrumBuffer("down", ctx);

    expect(result).toBe(fakeBuffer);
    // Preset was cached after first (successful) fetch, so fetch is called only once
    expect(fetch).toHaveBeenCalledTimes(1);
    // Buffer decode was attempted twice
    expect(decodeAudioData).toHaveBeenCalledTimes(2);
  });
});

// ─── Live CDN integration ─────────────────────────────────────────────────────
//
// These tests fetch real CDN content and confirm end-to-end parsing with the
// Function() evaluator. They are skipped by default; run with:
//   INTEGRATION=1 npm test
//
// During development of the Function() approach both presets were verified
// manually via a Node.js script producing:
//   ✓ 0250_SoundBlasterOld_sf2: 3 zone(s)
//     zone1: MIDI range [0-72],  originalPitch=7400, sampleRate=44100
//     zone2: MIDI range [73-97], originalPitch=7600, sampleRate=44100
//     zone3: MIDI range [98-127], originalPitch=11100, sampleRate=44100
//   ✓ 0280_SoundBlasterOld_sf2: 2 zone(s)
//     zone1: MIDI range [0-98],  originalPitch=7600, sampleRate=44100
//     zone2: MIDI range [99-127], originalPitch=11100, sampleRate=44100

const CDN_BASE = "https://surikov.github.io/webaudiofontdata/sound/";

describe.skipIf(!process.env.INTEGRATION)(
  "parsePresetFromJs — live CDN integration (INTEGRATION=1 npm test)",
  () => {
    it.each([
      [
        "0250_SoundBlasterOld_sf2",
        "_tone_0250_SoundBlasterOld_sf2",
        3, // 3 key-range zones confirmed against live CDN
      ],
      [
        "0280_SoundBlasterOld_sf2",
        "_tone_0280_SoundBlasterOld_sf2",
        2, // 2 key-range zones confirmed against live CDN
      ],
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
          // Every zone must carry audio data
          expect(zone.sample !== undefined || zone.file !== undefined).toBe(true);
          if (zone.sample !== undefined) {
            // Base64 sample data must be non-empty and decodable by atob
            expect(zone.sample.length).toBeGreaterThan(0);
            expect(() => atob(zone.sample!)).not.toThrow();
          }
        }
      },
      15_000
    );
  }
);
