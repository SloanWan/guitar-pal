"use client";

/**
 * Guitar sample loader using webaudiofont preset data.
 *
 * Sound-type mapping rationale:
 *  "down" (D / D3) → Acoustic Steel Guitar (GM 25), MIDI 52
 *    Falls in zone 1 (keyRange 0–72, sampled at D5). Full-body, lower-register
 *    character typical of a downward strum across the strings.
 *  "up"   (U / U3) → Acoustic Steel Guitar (GM 25), MIDI 76
 *    Falls in zone 2 (keyRange 73–97, sampled at E5) — a genuinely separate
 *    recording from zone 1. Using the zone boundary ensures the two strum
 *    directions draw from different samples rather than the same audio file
 *    pitch-shifted. (MIDI 64 was tried first but it also falls in zone 1.)
 *  "muted" (X) → Muted Electric Guitar (GM 28), MIDI 57
 *    The webaudiofont collection has no acoustic palm-mute preset; GM program
 *    28 (Electric Guitar Muted) is the closest analog for the percussive
 *    "chk" scratch of a muted strum.
 *
 * Caching strategy:
 *  Module-level Maps of Promise<T> so concurrent callers share one in-flight
 *  request. Failed entries are evicted so callers can retry on transient errors.
 *
 * AudioBuffer sharing:
 *  AudioBuffer objects are not tied to a specific AudioContext in modern
 *  browsers (spec-compliant since Chrome 66 / Firefox 53), so the buffer
 *  cache is safe if the same module instance is reused across AudioContext
 *  lifecycles.
 *
 * No AudioContext is created here; callers supply the one managed by
 * useAudioEngine.ts.
 *
 * Why fetch preset data directly instead of using the webaudiofont npm API:
 *  — The npm package bundles no preset data (only WebAudioFontPlayer.js);
 *    presets always come from a remote host regardless of approach.
 *  — WebAudioFontLoader.startLoad() injects <script> tags, sets global window
 *    variables, and uses a polling waitLoad() callback — incompatible with
 *    async/await and problematic under Next.js CSP and strict-mode TypeScript.
 *  — adjustZone() calls decodeAudioData() with the old callback form (not a
 *    Promise), making it impossible to await or compose with a Promise cache.
 *  — Manual fetch gives full control: lazy loading, Promise-based cache,
 *    typed error propagation, and zero dependency on global window state.
 *  The webaudiofont npm package is therefore not imported or used here.
 *
 * Note: the preset JS files contain a leading console.log() call before the
 * variable assignment. parsePresetFromJs handles this safely: the regex
 * requires `varName\s*=\s*{` which does not match the string inside the log.
 */

// ─── Public types ──────────────────────────────────────────────────────────────

export type StrumSoundType = "down" | "up" | "muted";

// Mirrors webaudiofont WaveZone / WavePreset from npm/src/otypes.ts, read-only.
export interface WafAHDSR {
  duration: number;
  volume: number;
}

export interface WafZone {
  keyRangeLow: number;
  keyRangeHigh: number;
  /** Pitch of the recorded sample in centitones (midiNote × 100). */
  originalPitch: number;
  coarseTune: number;
  fineTune: number;
  loopStart: number;
  loopEnd: number;
  sampleRate: number;
  ahdsr?: boolean | WafAHDSR[];
  /** Base64-encoded compressed audio (no data-URI prefix). Decoded via decodeAudioData. */
  file?: string;
  /** Base64-encoded 16-bit signed PCM. Decoded synchronously via createBuffer. */
  sample?: string;
}

export interface WafPreset {
  zones: WafZone[];
}

export class SampleLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SampleLoadError";
  }
}

// ─── Preset configuration ──────────────────────────────────────────────────────

const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";

const PRESET_DEFS = {
  steelGuitar: {
    key: "0250_SoundBlasterOld_sf2",
    varName: "_tone_0250_SoundBlasterOld_sf2",
  },
  mutedGuitar: {
    key: "0280_SoundBlasterOld_sf2",
    varName: "_tone_0280_SoundBlasterOld_sf2",
  },
} as const;

type PresetKey = keyof typeof PRESET_DEFS;

const STRUM_CONFIG: Record<StrumSoundType, { presetKey: PresetKey; midiNote: number }> = {
  down: { presetKey: "steelGuitar", midiNote: 52 }, // zone 1 (0–72, sampled at D5/74)
  up: { presetKey: "steelGuitar", midiNote: 76 },   // zone 2 (73–97, sampled at E5/76) — distinct sample
  muted: { presetKey: "mutedGuitar", midiNote: 57 }, // zone 1 (0–98)
};

// ─── Module-level caches ───────────────────────────────────────────────────────

const _presetCache = new Map<PresetKey, Promise<WafPreset>>();
const _bufferCache = new Map<string, Promise<AudioBuffer>>();

function _bufferKey(presetKey: PresetKey, midiNote: number): string {
  return `${presetKey}:${midiNote}`;
}

// ─── Preset parsing ────────────────────────────────────────────────────────────

/**
 * Normalize a JavaScript object literal extracted from a webaudiofont preset
 * file into valid JSON. CDN preset files use:
 *   - Unquoted identifier keys:   midi:28        → "midi":28
 *   - Single-quoted strings:      sample:'AAA'   → "sample":"AAA"
 *   - Single-line JS comments:    //_tone.mgtr   → (stripped)
 *
 * The first pass is a character-by-character scan that tracks string
 * boundaries so that "//" inside base64 sample data (which is possible) is
 * never mistaken for a comment. The second pass quotes unquoted keys using
 * a regex that is safe because all string content is already double-quoted.
 */
function jsToJson(js: string): string {
  const out: string[] = [];
  let i = 0;
  const n = js.length;

  while (i < n) {
    const ch = js[i];

    // Single-line comment — skip to end of line (only safe outside strings)
    if (ch === "/" && js[i + 1] === "/") {
      while (i < n && js[i] !== "\n") i++;
      continue;
    }

    // Single-quoted string — convert to JSON double-quoted string
    if (ch === "'") {
      out.push('"');
      i++;
      while (i < n && js[i] !== "'") {
        if (js[i] === "\\") {
          out.push(js[i]);
          i++;
          if (i < n) { out.push(js[i]); i++; }
        } else {
          out.push(js[i]);
          i++;
        }
      }
      out.push('"');
      i++; // skip closing '
      continue;
    }

    // Double-quoted string — copy verbatim (already JSON-safe)
    if (ch === '"') {
      out.push(ch);
      i++;
      while (i < n && js[i] !== '"') {
        if (js[i] === "\\") {
          out.push(js[i]);
          i++;
          if (i < n) { out.push(js[i]); i++; }
        } else {
          out.push(js[i]);
          i++;
        }
      }
      out.push('"');
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  // Second pass: quote unquoted identifier keys now that all strings are
  // double-quoted and comments are gone.
  return out.join("").replace(
    /([{[,\n][\s]*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g,
    '$1"$2"$3'
  );
}

/**
 * Extract and parse the preset object from a webaudiofont instrument JS file
 * without executing the script. The CDN file format is:
 *   console.log('load _tone_XXXX_...');
 *   var _tone_XXXX_...={zones:[{midi:25,originalPitch:7400,...,sample:'BASE64...'}]};
 *
 * Keys are unquoted and strings use single quotes — see jsToJson above.
 * Brace-counting is used instead of a greedy regex so that content after the
 * assignment does not interfere.
 */
export function parsePresetFromJs(text: string, varName: string): WafPreset {
  const assignmentRe = new RegExp(String.raw`\b${varName}\s*=\s*\{`);
  const match = assignmentRe.exec(text);
  if (!match) {
    throw new SampleLoadError(
      `Preset variable "${varName}" not found in fetched content`
    );
  }

  // match[0] ends with `{`; rewind one char to get the JSON start index.
  const jsonStart = match.index + match[0].length - 1;

  let depth = 0;
  let inString = false;
  let escape = false;
  let jsonEnd = -1;

  for (let i = jsonStart; i < text.length; i++) {
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
        jsonEnd = i;
        break;
      }
    }
  }

  if (jsonEnd === -1) {
    throw new SampleLoadError(`Unbalanced braces parsing preset "${varName}"`);
  }

  const jsonText = jsToJson(text.slice(jsonStart, jsonEnd + 1));
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!isWafPreset(parsed)) {
      throw new SampleLoadError(
        `Preset "${varName}" has unexpected shape (missing zones array)`
      );
    }
    return parsed;
  } catch (err) {
    if (err instanceof SampleLoadError) throw err;
    throw new SampleLoadError(`JSON.parse failed for preset "${varName}"`, err);
  }
}

function isWafPreset(value: unknown): value is WafPreset {
  return (
    typeof value === "object" &&
    value !== null &&
    "zones" in value &&
    Array.isArray((value as Record<string, unknown>).zones)
  );
}

// ─── Zone selection ────────────────────────────────────────────────────────────

/**
 * Find the zone whose key range covers midiNote. Falls back to the zone
 * whose originalPitch is nearest to the target note when no range matches.
 */
export function findZoneForMidi(preset: WafPreset, midiNote: number): WafZone {
  const exact = preset.zones.find(
    (z) => z.keyRangeLow <= midiNote && midiNote <= z.keyRangeHigh
  );
  if (exact) return exact;

  if (preset.zones.length === 0) {
    throw new SampleLoadError(
      `Preset has no zones; cannot resolve MIDI note ${midiNote}`
    );
  }

  const byDistance = [...preset.zones].sort(
    (a, b) =>
      Math.abs(a.originalPitch / 100 - midiNote) -
      Math.abs(b.originalPitch / 100 - midiNote)
  );
  return byDistance[0];
}

// ─── Audio decoding ────────────────────────────────────────────────────────────

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const decoded = atob(b64);
  const buf = new ArrayBuffer(decoded.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < decoded.length; i++) {
    view[i] = decoded.charCodeAt(i);
  }
  return buf;
}

/**
 * Decode a base64-encoded 16-bit signed little-endian PCM sample into an
 * AudioBuffer. Exported with an underscore prefix for unit testing only.
 *
 * The `lo < 0` guard that appeared in the original webaudiofont source is
 * removed: String.prototype.charCodeAt() returns a value in [0, 65535] (or
 * NaN for out-of-range indices). For atob() output — Latin-1 byte strings —
 * the range is [0, 255], so a negative return is impossible per spec.
 */
export function _pcmSampleToBuffer(
  b64Sample: string,
  sampleRate: number,
  ctx: AudioContext
): AudioBuffer {
  const decoded = atob(b64Sample);
  const sampleCount = Math.floor(decoded.length / 2);
  const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
  const float32 = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const lo = decoded.charCodeAt(i * 2);   // always 0–255
    const hi = decoded.charCodeAt(i * 2 + 1); // always 0–255
    let n = hi * 256 + lo;                   // unsigned 16-bit, 0–65535
    if (n >= 32768) n -= 65536;              // to signed 16-bit, -32768–32767
    float32[i] = n / 32768;                  // normalize to [-1.0, ~1.0]
  }
  return buffer;
}

async function decodeZone(zone: WafZone, ctx: AudioContext): Promise<AudioBuffer> {
  if (zone.sample) {
    return _pcmSampleToBuffer(zone.sample, zone.sampleRate ?? 44100, ctx);
  }
  if (zone.file) {
    const arrayBuffer = base64ToArrayBuffer(zone.file);
    try {
      return await ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      throw new SampleLoadError(
        `AudioContext.decodeAudioData failed for zone at originalPitch=${zone.originalPitch}`,
        err
      );
    }
  }
  throw new SampleLoadError(
    `Zone at originalPitch=${zone.originalPitch} has neither file nor sample data`
  );
}

// ─── Preset loading ────────────────────────────────────────────────────────────

function loadPreset(presetKey: PresetKey): Promise<WafPreset> {
  const cached = _presetCache.get(presetKey);
  if (cached) return cached;

  const def = PRESET_DEFS[presetKey];
  const url = `${WAF_BASE_URL}${def.key}.js`;

  const promise = (async (): Promise<WafPreset> => {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new SampleLoadError(
        `Network error fetching preset "${presetKey}" from ${url}`,
        err
      );
    }
    if (!response.ok) {
      throw new SampleLoadError(
        `HTTP ${response.status} fetching preset "${presetKey}" from ${url}`
      );
    }
    const text = await response.text();
    return parsePresetFromJs(text, def.varName);
  })();

  _presetCache.set(presetKey, promise);
  // Evict on failure so callers can retry on transient errors.
  promise.catch(() => _presetCache.delete(presetKey));
  return promise;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns an AudioBuffer for the requested strum sound type.
 *
 * Lazy: preset data is fetched on first call, not at module load.
 * Cached: repeated calls with the same type return the same Promise.
 *
 * @param type   - "down" | "up" | "muted"
 * @param ctx    - The AudioContext to use for decoding (managed by the caller).
 * @throws {SampleLoadError} on network failure, non-2xx HTTP status, parse
 *   error, or AudioContext.decodeAudioData failure.
 */
export function getStrumBuffer(
  type: StrumSoundType,
  ctx: AudioContext
): Promise<AudioBuffer> {
  const { presetKey, midiNote } = STRUM_CONFIG[type];
  const cacheKey = _bufferKey(presetKey, midiNote);

  const cached = _bufferCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async (): Promise<AudioBuffer> => {
    const preset = await loadPreset(presetKey);
    const zone = findZoneForMidi(preset, midiNote);
    return decodeZone(zone, ctx);
  })();

  _bufferCache.set(cacheKey, promise);
  // Evict on failure so callers can retry.
  promise.catch(() => _bufferCache.delete(cacheKey));
  return promise;
}

/**
 * React hook wrapper. Returns the getStrumBuffer function.
 * Caches are module-level, so multiple hook instances share the same buffers.
 */
export function useGuitarSampleLoader(): { getStrumBuffer: typeof getStrumBuffer } {
  return { getStrumBuffer };
}

/** For testing only — clears all in-memory caches. */
export function _resetCachesForTesting(): void {
  _presetCache.clear();
  _bufferCache.clear();
}
