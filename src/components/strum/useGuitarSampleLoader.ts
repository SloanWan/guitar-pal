"use client";

/**
 * Guitar strum player that renders multi-string chords using Web Audio API
 * scheduling and webaudiofont CDN preset data.
 *
 * Sound-type → preset mapping:
 *  "down"  → Acoustic Steel Guitar (GM 25, preset 0250), pitches played low→high
 *             with 10 ms per-string stagger (mimics a downstroke sweep).
 *  "up"    → Acoustic Steel Guitar (GM 25, preset 0250), pitches played high→low
 *             with 10 ms per-string stagger (mimics an upstroke sweep).
 *  "muted" → Electric Guitar Muted (GM 28, preset 0280), pitches played low→high
 *             with 10 ms stagger and short duration (0.08 s) for percussive "chuck".
 *             queueStrumDown semantics are used rather than a single-note snap
 *             because a muted chuck is still a sweep across strings; the muted
 *             timbre comes from the 0280 preset, not from a different schedule shape.
 *
 * Chord voicing (fixed, C major open shape):
 *   [48 C3, 52 E3, 55 G3, 60 C4, 64 E4]
 *   Low E string muted / not played. A future issue will let users pick the chord.
 *
 * Preset data is fetched from the webaudiofontdata CDN, parsed with Function(),
 * and decoded (16-bit PCM or compressed audio) into AudioBuffer objects. Decoded
 * buffers are cached on zone.buffer for reuse across strums.
 *
 * Playback rate for each note is adjusted so the sampled zone sounds at the
 * target MIDI pitch, matching the technique used by webaudiofont's queueWaveTable:
 *   playbackRate = 2 ^ ((100 × midiPitch − baseDetune) / 1200)
 *   baseDetune  = originalPitch − 100 × coarseTune − fineTune
 *
 * Loop points (stored as sample indices in CDN data) are converted to seconds
 * on the fly when scheduling: loopStartSec = loopStart / sampleRate.
 *
 * Caching:
 *   _presetCache  — deduplicates in-flight CDN fetches (Map<PresetKey, Promise<WafPreset>>).
 *   _readyPresets — synchronous access for the audio scheduler (Map<PresetKey, WafPreset>).
 *
 * Security note:
 *   parsePresetFromJs evaluates the extracted object literal from the pinned
 *   WAF_BASE_URL CDN with Function(). No user input reaches Function(). The app
 *   does not currently set a strict CSP, but Function() requires 'unsafe-eval'
 *   if one is ever added.
 */

// ─── Public types ──────────────────────────────────────────────────────────────

export type StrumSoundType = "down" | "up" | "muted";

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
	/** Loop start as a sample index in CDN files; converted to seconds on playback. */
	loopStart: number;
	loopEnd: number;
	sampleRate: number;
	ahdsr?: boolean | WafAHDSR[];
	/** Base64-encoded compressed audio. Decoded via AudioContext.decodeAudioData. */
	file?: string;
	/** Base64-encoded 16-bit signed little-endian PCM. Decoded synchronously. */
	sample?: string;
	/** AudioBuffer decoded by preloadStrumPresets; null until then. */
	buffer?: AudioBuffer;
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

export type PresetKey = keyof typeof PRESET_DEFS;

const STRUM_PRESET: Record<StrumSoundType, PresetKey> = {
	down: "steelGuitar",
	up: "steelGuitar",
	muted: "mutedGuitar",
};

// ─── Chord and strum parameters ───────────────────────────────────────────────

/** Fixed C major open chord voicing (A-string root, low E string not played). */
export const STRUM_PITCHES: readonly number[] = [48, 52, 55, 60, 64];

/** Seconds between each string in the strum sweep (matches webaudiofont queueStrum). */
const STRUM_STAGGER_S = 0.01;

/**
 * Maximum effective duration (s) for muted strums regardless of the cell duration
 * passed by the caller. Preserves the percussive "chuck" character at all tempos.
 */
export const MUTED_MAX_DURATION_S = 0.08;

/**
 * Fraction of the cell duration used as the gain-decay time constant.
 * Exported so tests can reference it without duplicating the literal.
 */
export const DECAY_TIME_CONSTANT_RATIO = 0.8;

/**
 * Minimum gain-decay time constant (s).
 * Below ~30 ms, setTargetAtTime changes from a smooth exponential into an audible
 * click-like step for any non-trivial starting gain. Floor preserves natural decay
 * feel even at fast tempos (180+ BPM with 4-cell beats).
 */
export const MIN_DECAY_TC_S = 0.03;

/**
 * Seconds added to source.stop() beyond the cell boundary.
 * Ensures the source node outlives the gain envelope tail so the WebAudio
 * scheduler can silence the node cleanly rather than hard-cutting it.
 */
export const SOURCE_STOP_BUFFER_S = 0.05;

// ─── Module-level state ───────────────────────────────────────────────────────

const _presetCache = new Map<PresetKey, Promise<WafPreset>>();
const _readyPresets = new Map<PresetKey, WafPreset>();
const _activeSources = new Set<AudioBufferSourceNode>();

// ─── Preset parsing ────────────────────────────────────────────────────────────

/**
 * Extract and evaluate the preset object from a webaudiofont instrument JS file.
 * (insert for triggering CD)
 * (insert for testing if main branch protection works)
 * The CDN file format is valid JavaScript but not valid JSON:
 *   console.log('load _tone_XXXX_...');
 *   var _tone_XXXX_...={zones:[{midi:25,originalPitch:7400,...,sample:'BASE64...'}]};
 *
 * CDN quirks handled by delegating to the JS engine via Function():
 *   - Unquoted identifier keys  (midi:25)
 *   - Single-quoted strings     (sample:'BASE64...')
 *   - Inline // comments        (//_tone.mgtr between last property and closing })
 *
 * Extraction: a regex locates the variable assignment; brace-counting (tracking
 * only double-quote strings, sufficient since base64 contains no braces) finds
 * the matching closing brace. The extracted text is the sole input to Function() —
 * the full file script is never executed, so the leading console.log() is skipped.
 */
export function parsePresetFromJs(text: string, varName: string): WafPreset {
	const assignmentRe = new RegExp(String.raw`\b${varName}\s*=\s*\{`);
	const match = assignmentRe.exec(text);
	if (!match) {
		throw new SampleLoadError(`Preset variable "${varName}" not found in fetched content`);
	}

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

	if (jsEnd === -1) {
		throw new SampleLoadError(`Unbalanced braces parsing preset "${varName}"`);
	}

	const jsText = text.slice(jsStart, jsEnd + 1);
	let result: unknown;
	try {
		result = new Function(`"use strict"; return (${jsText})`)();
	} catch (err) {
		throw new SampleLoadError(
			`Failed to evaluate preset "${varName}" as a JavaScript object`,
			err,
		);
	}

	if (!isWafPreset(result)) {
		throw new SampleLoadError(`Preset "${varName}" has unexpected shape (missing zones array)`);
	}

	return result;
}

function isWafPreset(value: unknown): value is WafPreset {
	return (
		typeof value === "object" &&
		value !== null &&
		"zones" in value &&
		Array.isArray((value as Record<string, unknown>).zones)
	);
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
 * Decode a base64-encoded 16-bit signed little-endian PCM sample into an AudioBuffer.
 * Exported with underscore prefix for unit testing only.
 */
export function _pcmSampleToBuffer(
	b64Sample: string,
	sampleRate: number,
	ctx: AudioContext,
): AudioBuffer {
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

async function _decodeZone(zone: WafZone, ctx: AudioContext): Promise<AudioBuffer> {
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
				err,
			);
		}
	}
	throw new SampleLoadError(
		`Zone at originalPitch=${zone.originalPitch} has neither file nor sample data`,
	);
}

// ─── Zone selection ────────────────────────────────────────────────────────────

/**
 * Return the zone whose key range covers pitch. Falls back to the zone whose
 * originalPitch is nearest to the target if no range matches.
 */
export function findZoneForMidi(preset: WafPreset, midiNote: number): WafZone {
	const exact = preset.zones.find((z) => z.keyRangeLow <= midiNote && midiNote <= z.keyRangeHigh);
	if (exact) return exact;

	if (preset.zones.length === 0) {
		throw new SampleLoadError(`Preset has no zones; cannot resolve MIDI note ${midiNote}`);
	}

	return [...preset.zones].sort(
		(a, b) =>
			Math.abs(a.originalPitch / 100 - midiNote) - Math.abs(b.originalPitch / 100 - midiNote),
	)[0];
}

// ─── Strum scheduling ─────────────────────────────────────────────────────────

function _scheduleNote(
	ctx: AudioContext,
	target: AudioNode,
	zone: WafZone,
	buffer: AudioBuffer,
	when: number,
	midiPitch: number,
	noteDuration: number,
	volume: number,
): void {
	// Playback rate so this zone sounds at midiPitch.
	// originalPitch is centitones, coarseTune is semitones, fineTune is cents.
	const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
	const playbackRate = Math.pow(2, (100.0 * midiPitch - baseDetune) / 1200.0);

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = playbackRate;

	// Loop points are sample indices in CDN data; convert to seconds.
	const loopStartSec = zone.loopStart / zone.sampleRate;
	const loopEndSec = zone.loopEnd / zone.sampleRate;
	if (loopStartSec > 0 && loopEndSec > loopStartSec) {
		source.loop = true;
		source.loopStart = loopStartSec;
		source.loopEnd = loopEndSec;
	}

	// Decay starts immediately at `when` (guitar-pluck model: no hold phase).
	// Floor of MIN_DECAY_TC_S prevents click-like transitions at very fast tempos.
	const decayTimeConstant = Math.max(noteDuration * DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S);

	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(volume, when);
	gainNode.gain.setTargetAtTime(0, when, decayTimeConstant);

	source.connect(gainNode).connect(target);
	source.start(when);
	// Stop is set past the cell end so the gain envelope has time to tail off cleanly.
	source.stop(when + noteDuration + SOURCE_STOP_BUFFER_S);

	_activeSources.add(source);
	source.onended = () => {
		_activeSources.delete(source);
	};
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
				err,
			);
		}
		if (!response.ok) {
			throw new SampleLoadError(
				`HTTP ${response.status} fetching preset "${presetKey}" from ${url}`,
			);
		}
		const text = await response.text();
		return parsePresetFromJs(text, def.varName);
	})();

	_presetCache.set(presetKey, promise);
	promise.catch(() => _presetCache.delete(presetKey));
	return promise;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and parse both guitar presets, then decode all zones used by
 * STRUM_PITCHES so the first triggerStrum call is stutter-free.
 *
 * Call once at playback-start time before the audio scheduler begins ticking.
 */
export async function preloadStrumPresets(ctx: AudioContext): Promise<void> {
	const keys = Object.keys(PRESET_DEFS) as PresetKey[];
	await Promise.all(
		keys.map(async (key) => {
			const preset = await loadPreset(key);
			const decoded = new Set<WafZone>();
			for (const pitch of STRUM_PITCHES) {
				const zone = findZoneForMidi(preset, pitch);
				if (!decoded.has(zone)) {
					decoded.add(zone);
					zone.buffer = await _decodeZone(zone, ctx);
				}
			}
			_readyPresets.set(key, preset);
		}),
	);
}

/**
 * Synchronously trigger a multi-string strum using Web Audio API scheduling.
 * Silently no-ops if preloadStrumPresets has not yet resolved for this type.
 *
 * @param type         - Strum direction and timbre.
 * @param ctx          - AudioContext (managed by the caller).
 * @param target       - Destination AudioNode (e.g. a master gain node).
 * @param when         - Absolute AudioContext time in seconds.
 * @param noteDuration - Time in seconds until the next scheduled event (e.g.
 *                       secondsPerCell from the scheduler). Notes are enveloped
 *                       to decay within this window, preventing beat-to-beat overlap.
 *                       Muted strums are additionally capped at MUTED_MAX_DURATION_S.
 */
export function triggerStrum(
	type: StrumSoundType,
	ctx: AudioContext,
	target: AudioNode,
	when: number,
	noteDuration: number,
): void {
	const preset = _readyPresets.get(STRUM_PRESET[type]);
	if (!preset) return;

	// Up strum: high-to-low sweep; down and muted: low-to-high sweep.
	const pitches = type === "up" ? [...STRUM_PITCHES].sort((a, b) => b - a) : [...STRUM_PITCHES];

	// Muted strums cap at MUTED_MAX_DURATION_S regardless of tempo.
	const effectiveDuration =
		type === "muted" ? Math.min(noteDuration, MUTED_MAX_DURATION_S) : noteDuration;

	for (let i = 0; i < pitches.length; i++) {
		const zone = findZoneForMidi(preset, pitches[i]);
		if (!zone.buffer) continue;

		const noteOffset = i * STRUM_STAGGER_S;
		// Compensate for the stagger so all sources stop at when + effectiveDuration + buffer,
		// ensuring no note bleeds past the cell boundary regardless of string index.
		const adjustedDuration = effectiveDuration - noteOffset;
		if (adjustedDuration <= 0) continue;

		const volume = Math.pow(0.9, i); // slight taper toward the sweep end
		_scheduleNote(
			ctx,
			target,
			zone,
			zone.buffer,
			when + noteOffset,
			pitches[i],
			adjustedDuration,
			volume,
		);
	}
}

/**
 * Stop all in-progress strum notes immediately.
 * Call on playback stop and component unmount.
 */
export function cancelStrums(): void {
	for (const source of _activeSources) {
		try {
			source.stop();
		} catch {
			/* already ended */
		}
	}
	_activeSources.clear();
}

/**
 * @deprecated Use preloadStrumPresets + triggerStrum instead.
 * Retained as a stub so useAudioEngine.ts compiles unchanged until 53-b
 * replaces the AudioBuffer-based scheduler with triggerStrum.
 */
export function getStrumBuffer(_type: StrumSoundType, _ctx: AudioContext): Promise<AudioBuffer> {
	return Promise.reject(
		new SampleLoadError(
			"getStrumBuffer is deprecated — use preloadStrumPresets + triggerStrum",
		),
	);
}

/**
 * React hook wrapper. Caches are module-level; multiple hook instances share
 * the same presets and active-source set.
 */
export function useGuitarSampleLoader(): {
	preloadStrumPresets: typeof preloadStrumPresets;
	triggerStrum: typeof triggerStrum;
	cancelStrums: typeof cancelStrums;
} {
	return { preloadStrumPresets, triggerStrum, cancelStrums };
}

/** For testing only — clears all in-memory caches and active sources. */
export function _resetCachesForTesting(): void {
	_presetCache.clear();
	_readyPresets.clear();
	_activeSources.clear();
}

/** For testing only — injects a preset into the ready map without preloadStrumPresets. */
export function _setReadyPresetForTesting(presetKey: PresetKey, preset: WafPreset): void {
	_readyPresets.set(presetKey, preset);
}

// ─── Fingerpick preset configuration ─────────────────────────────────────────

/**
 * Tone types for the fingerpick audio engine.
 *   "pluck" → LK Acoustic Steel (0250_LK_AcousticSteel_SF2_file)
 *   "muted" → FluidR3 Muted Guitar (0280_FluidR3_GM_sf2_file)
 *
 * Deliberately distinct from StrumSoundType to prevent accidental cross-use
 * with the strumming machine's SoundBlaster presets.
 */
export type FingerpickSoundType = "pluck" | "muted";

/** Full guitar range preloaded for the fingerpick engine (open E2 → 20th fret E5). */
export const FINGERPICK_MIDI_LOW = 40;
export const FINGERPICK_MIDI_HIGH = 76;

const FINGERPICK_PRESET_DEFS: Record<FingerpickSoundType, { key: string; varName: string }> = {
	pluck: {
		key: "0250_LK_AcousticSteel_SF2_file",
		varName: "_tone_0250_LK_AcousticSteel_SF2_file",
	},
	muted: {
		key: "0280_FluidR3_GM_sf2_file",
		varName: "_tone_0280_FluidR3_GM_sf2_file",
	},
};

// ─── Fingerpick module-level state ────────────────────────────────────────────

const _fingerpickPresetCache = new Map<FingerpickSoundType, Promise<WafPreset>>();
const _readyFingerpickPresets = new Map<FingerpickSoundType, WafPreset>();

// ─── Fingerpick preset loading (internal) ─────────────────────────────────────

function _loadFingerpickPreset(type: FingerpickSoundType): Promise<WafPreset> {
	const cached = _fingerpickPresetCache.get(type);
	if (cached) return cached;

	const def = FINGERPICK_PRESET_DEFS[type];
	const url = `${WAF_BASE_URL}${def.key}.js`;

	const promise = (async (): Promise<WafPreset> => {
		let response: Response;
		try {
			response = await fetch(url);
		} catch (err) {
			throw new SampleLoadError(
				`Network error fetching fingerpick preset "${type}" from ${url}`,
				err,
			);
		}
		if (!response.ok) {
			throw new SampleLoadError(
				`HTTP ${response.status} fetching fingerpick preset "${type}" from ${url}`,
			);
		}
		const text = await response.text();
		return parsePresetFromJs(text, def.varName);
	})();

	_fingerpickPresetCache.set(type, promise);
	promise.catch(() => _fingerpickPresetCache.delete(type));
	return promise;
}

// ─── Fingerpick public API ────────────────────────────────────────────────────

/**
 * Fetch, parse, and decode both fingerpick guitar presets across the full guitar
 * range (MIDI 40–76). Call once before the first getBufferForMidi invocation.
 *
 * Presets loaded:
 *   "pluck" → 0250_LK_AcousticSteel_SF2_file (LK Acoustic Steel, GM 25)
 *   "muted" → 0280_FluidR3_GM_sf2_file (FluidR3 Muted Guitar, GM 28)
 *
 * Caching follows the same pattern as preloadStrumPresets: in-flight fetches are
 * deduplicated by _fingerpickPresetCache; decoded buffers are stored on zone.buffer
 * and the ready preset is stored in _readyFingerpickPresets for synchronous access.
 */
export async function preloadFingerpickPresets(ctx: AudioContext): Promise<void> {
	const types: FingerpickSoundType[] = ["pluck", "muted"];
	const midiRange = Array.from(
		{ length: FINGERPICK_MIDI_HIGH - FINGERPICK_MIDI_LOW + 1 },
		(_, i) => FINGERPICK_MIDI_LOW + i,
	);
	await Promise.all(
		types.map(async (type) => {
			const preset = await _loadFingerpickPreset(type);
			const decoded = new Set<WafZone>();
			for (const midi of midiRange) {
				const zone = findZoneForMidi(preset, midi);
				if (!decoded.has(zone)) {
					decoded.add(zone);
					zone.buffer = await _decodeZone(zone, ctx);
				}
			}
			_readyFingerpickPresets.set(type, preset);
		}),
	);
}

/**
 * Synchronously return the decoded AudioBuffer for an arbitrary MIDI pitch.
 * Throws SampleLoadError if preloadFingerpickPresets has not resolved, or if
 * the zone covering the requested pitch has no decoded buffer (i.e. the pitch
 * was outside FINGERPICK_MIDI_LOW–FINGERPICK_MIDI_HIGH during preload).
 *
 * Intended as an infrastructure helper for the fingerpick audio engine — callers
 * do not need to know about zone internals or the preset structure.
 */
export function getBufferForMidi(type: FingerpickSoundType, midi: number): AudioBuffer {
	const preset = _readyFingerpickPresets.get(type);
	if (!preset) {
		throw new SampleLoadError(
			`Fingerpick preset "${type}" not loaded — call preloadFingerpickPresets first`,
		);
	}
	const zone = findZoneForMidi(preset, midi);
	if (!zone.buffer) {
		throw new SampleLoadError(
			`No decoded buffer for MIDI ${midi} in fingerpick preset "${type}" — ` +
				`MIDI ${midi} was likely outside the preload range [${FINGERPICK_MIDI_LOW}–${FINGERPICK_MIDI_HIGH}]`,
		);
	}
	return zone.buffer;
}

// ─── Fingerpick note data ─────────────────────────────────────────────────────

export interface FingerpickNoteData {
	buffer: AudioBuffer;
	/** Playback rate to sound at the target MIDI pitch using the matched zone. */
	playbackRate: number;
}

/**
 * Synchronously return the decoded AudioBuffer and correct playback rate for a
 * MIDI pitch in a fingerpick preset.
 *
 * Playback rate formula (same as webaudiofont queueWaveTable):
 *   baseDetune   = originalPitch − 100 × coarseTune − fineTune
 *   playbackRate = 2 ^ ((100 × midiPitch − baseDetune) / 1200)
 *
 * Throws SampleLoadError if the preset is not loaded or the zone has no buffer.
 */
export function getFingerpickNoteData(type: FingerpickSoundType, midi: number): FingerpickNoteData {
	const preset = _readyFingerpickPresets.get(type);
	if (!preset) {
		throw new SampleLoadError(
			`Fingerpick preset "${type}" not loaded — call preloadFingerpickPresets first`,
		);
	}
	const zone = findZoneForMidi(preset, midi);
	if (!zone.buffer) {
		throw new SampleLoadError(
			`No decoded buffer for MIDI ${midi} in fingerpick preset "${type}" — ` +
				`MIDI ${midi} was likely outside the preload range [${FINGERPICK_MIDI_LOW}–${FINGERPICK_MIDI_HIGH}]`,
		);
	}
	const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
	const playbackRate = Math.pow(2, (100.0 * midi - baseDetune) / 1200.0);
	return { buffer: zone.buffer, playbackRate };
}

// ─── Fingerpick testing exports ───────────────────────────────────────────────

/** For testing only — clears all fingerpick in-memory caches. */
export function _resetFingerpickCachesForTesting(): void {
	_fingerpickPresetCache.clear();
	_readyFingerpickPresets.clear();
}

/** For testing only — injects a fingerpick preset without preloadFingerpickPresets. */
export function _setReadyFingerpickPresetForTesting(
	type: FingerpickSoundType,
	preset: WafPreset,
): void {
	_readyFingerpickPresets.set(type, preset);
}
