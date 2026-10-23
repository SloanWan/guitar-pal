"use client";

/**
 * Guitar strum player that renders multi-string chords using Web Audio API
 * scheduling and WebAudioFont preset data.
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
 * Preset data is read as JSON from PRESET_BASE_URL (the webaudiofontdata files,
 * converted once by scripts/convert-webaudiofont-presets.mjs), checked by
 * parsePreset, and decoded (16-bit PCM or compressed audio) into AudioBuffer
 * objects. Decoded buffers are cached on zone.buffer for reuse across strums.
 *
 * Playback rate for each note is adjusted so the sampled zone sounds at the
 * target MIDI pitch, matching the technique used by webaudiofont's queueWaveTable:
 *   playbackRate = 2 ^ ((100 × midiPitch − baseDetune) / 1200)
 *   baseDetune  = originalPitch − 100 × coarseTune − fineTune
 *
 * Loop points (stored as sample indices in the preset data) are converted to seconds
 * on the fly when scheduling: loopStartSec = loopStart / sampleRate.
 *
 * Caching:
 *   _presetCache  — deduplicates in-flight fetches (Map<PresetKey, Promise<WafPreset>>).
 *   _readyPresets — synchronous access for the audio scheduler (Map<PresetKey, WafPreset>).
 *
 * Security note:
 *   Presets are served from our own origin and read with response.json(); nothing
 *   downloaded is evaluated (#366). Evaluating the CDN's JS files would let whoever
 *   controls that host run code beside the player's session cookie. The /dev
 *   audition pages, which browse the whole CDN, keep their own parser in
 *   src/app/dev/_lib.
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
	/** Loop start as a sample index in the preset data; converted to seconds on playback. */
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

/**
 * Where the bundled presets are served: public/audio/webaudiofont/, the
 * webaudiofontdata files (MIT, see NOTICE.md there) as JSON. Shared with the
 * piano loader.
 */
export const PRESET_BASE_URL = "/audio/webaudiofont/";

const PRESET_DEFS = {
	steelGuitar: { key: "0250_LK_AcousticSteel_SF2_file" },
	mutedGuitar: { key: "0280_Chaos_sf2_file" },
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
 * Level of the loudest string in a strum, before the sweep taper below.
 *
 * A strum is five sample voices stacked, and since struck strings let ring for
 * STRUM_RING_SECONDS they pile onto the strums that follow — at eighth notes,
 * a dozen voices can sound at once. At full scale that sums well past 1.0 and
 * clips at the destination, which is heard as "too loud" long before the fader
 * is touched. Headroom is taken here, at the source, so the strum fader keeps
 * its whole 0–200% range for anyone who wants it hotter.
 */
export const STRUM_STRING_VOLUME = 0.35;

/** Per-string falloff across the sweep, applied on top of STRUM_STRING_VOLUME. */
const STRUM_SWEEP_TAPER = 0.9;

/**
 * Maximum effective duration (s) for muted strums regardless of the cell duration
 * passed by the caller. Preserves the percussive "chuck" character at all tempos.
 */
export const MUTED_MAX_DURATION_S = 0.08;

/**
 * Fraction of the cell duration used as the gain-decay time constant.
 * Applies to muted strums only — struck strings let ring (see STRUM_RING_SECONDS).
 * Exported so tests can reference it without duplicating the literal.
 */
export const DECAY_TIME_CONSTANT_RATIO = 1;

/**
 * How long a struck string rings, in seconds — chosen in /dev/strum-sound-lab.
 * Down and up strums let ring: the note decays over this window regardless of the
 * cell length, so consecutive strums overlap the way a real guitar does instead
 * of each cell being silenced before the next. Muted strums are unaffected; they
 * stay percussive under MUTED_MAX_DURATION_S.
 */
export const STRUM_RING_SECONDS = 1.5;

/**
 * Divisor turning the ring length into a decay time constant. setTargetAtTime
 * leaves e^-3 ≈ 5% of the peak after three time constants, so τ = ring / 3 puts
 * the note at the edge of audibility exactly when the ring is over.
 */
export const RING_DECAY_TC_DIVISOR = 3;

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

const ZONE_NUMBER_FIELDS = [
	"keyRangeLow",
	"keyRangeHigh",
	"originalPitch",
	"coarseTune",
	"fineTune",
	"loopStart",
	"loopEnd",
	"sampleRate",
] as const;

/**
 * Check a parsed preset file against what the scheduler reads: a non-empty
 * zones array, every zone with its numeric fields and its audio as a base64
 * string (`file` or `sample`). Fields the scheduler ignores (midi, anchor) pass
 * through. Throws SampleLoadError naming the first thing missing.
 */
export function parsePreset(value: unknown, key: string): WafPreset {
	const zones = typeof value === "object" && value !== null ? (value as { zones?: unknown }).zones : undefined;
	if (!Array.isArray(zones) || zones.length === 0) {
		throw new SampleLoadError(`Preset "${key}" has no zones`);
	}
	zones.forEach((zone: unknown, i) => {
		if (typeof zone !== "object" || zone === null) {
			throw new SampleLoadError(`Preset "${key}" zone ${i} is not an object`);
		}
		const fields = zone as Record<string, unknown>;
		for (const field of ZONE_NUMBER_FIELDS) {
			if (typeof fields[field] !== "number" || !Number.isFinite(fields[field])) {
				throw new SampleLoadError(`Preset "${key}" zone ${i} has no numeric ${field}`);
			}
		}
		if (typeof fields.file !== "string" && typeof fields.sample !== "string") {
			throw new SampleLoadError(`Preset "${key}" zone ${i} has neither file nor sample data`);
		}
	});
	return value as WafPreset;
}

/** Fetch and check one bundled preset by its webaudiofontdata name. Shared with the piano loader. */
export async function fetchPreset(key: string): Promise<WafPreset> {
	const url = `${PRESET_BASE_URL}${key}.json`;
	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new SampleLoadError(`Network error fetching preset "${key}" from ${url}`, err);
	}
	if (!response.ok) {
		throw new SampleLoadError(`HTTP ${response.status} fetching preset "${key}" from ${url}`);
	}
	let data: unknown;
	try {
		data = await response.json();
	} catch (err) {
		throw new SampleLoadError(`Preset "${key}" from ${url} is not valid JSON`, err);
	}
	return parsePreset(data, key);
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

/** Decode one zone's sample data. Exported so the dev sound lab can decode
 *  presets outside the two this module ships with, rather than duplicating the
 *  base64 / PCM handling. */
export async function _decodeZone(zone: WafZone, ctx: AudioContext): Promise<AudioBuffer> {
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

/**
 * Schedule one string of a strum.
 *
 * @param decayTimeConstant - τ for the gain's exponential decay from `when`.
 * @param ringSeconds       - how long the note is allowed to sound; the source is
 *                            stopped SOURCE_STOP_BUFFER_S past it.
 */
function _scheduleNote(
	ctx: AudioContext,
	target: AudioNode,
	zone: WafZone,
	buffer: AudioBuffer,
	when: number,
	midiPitch: number,
	decayTimeConstant: number,
	ringSeconds: number,
	volume: number,
): void {
	// Playback rate so this zone sounds at midiPitch.
	// originalPitch is centitones, coarseTune is semitones, fineTune is cents.
	const baseDetune = zone.originalPitch - 100.0 * zone.coarseTune - zone.fineTune;
	const playbackRate = Math.pow(2, (100.0 * midiPitch - baseDetune) / 1200.0);

	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.playbackRate.value = playbackRate;

	// Loop points are sample indices in the preset data; convert to seconds.
	const loopStartSec = zone.loopStart / zone.sampleRate;
	const loopEndSec = zone.loopEnd / zone.sampleRate;
	if (loopStartSec > 0 && loopEndSec > loopStartSec) {
		source.loop = true;
		source.loopStart = loopStartSec;
		source.loopEnd = loopEndSec;
	}

	// Decay starts immediately at `when` (guitar-pluck model: no hold phase).
	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(volume, when);
	gainNode.gain.setTargetAtTime(0, when, decayTimeConstant);

	source.connect(gainNode).connect(target);
	source.start(when);
	// Stop is set past the ring so the gain envelope has time to tail off cleanly.
	source.stop(when + ringSeconds + SOURCE_STOP_BUFFER_S);

	_activeSources.add(source);
	source.onended = () => {
		_activeSources.delete(source);
	};
}

// ─── Preset loading ────────────────────────────────────────────────────────────

function loadPreset(presetKey: PresetKey): Promise<WafPreset> {
	const cached = _presetCache.get(presetKey);
	if (cached) return cached;

	const promise = fetchPreset(PRESET_DEFS[presetKey].key);
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
			// Decode all remaining zones so any chord voicing pitch works.
			for (const zone of preset.zones) {
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
 *                       secondsPerCell from the scheduler). **Muted strums only**:
 *                       it caps their percussive chuck at MUTED_MAX_DURATION_S.
 *                       Struck strings ignore it and let ring for
 *                       STRUM_RING_SECONDS, so consecutive strums overlap.
 */
export function triggerStrum(
	type: StrumSoundType,
	ctx: AudioContext,
	target: AudioNode,
	when: number,
	noteDuration: number,
	customPitches?: readonly number[],
): void {
	const preset = _readyPresets.get(STRUM_PRESET[type]);
	if (!preset) return;

	const basePitches = customPitches && customPitches.length > 0 ? customPitches : STRUM_PITCHES;
	// Up strum: high-to-low sweep; down and muted: low-to-high sweep.
	const pitches =
		type === "up"
			? [...basePitches].sort((a, b) => b - a)
			: [...basePitches].sort((a, b) => a - b);

	const isMuted = type === "muted";
	// Muted strums cap at MUTED_MAX_DURATION_S regardless of tempo.
	const mutedDuration = Math.min(noteDuration, MUTED_MAX_DURATION_S);

	for (let i = 0; i < pitches.length; i++) {
		const zone = findZoneForMidi(preset, pitches[i]);
		if (!zone.buffer) continue;

		const noteOffset = i * STRUM_STAGGER_S;

		let decayTimeConstant: number;
		let ringSeconds: number;
		if (isMuted) {
			// Compensate for the stagger so every chuck stops on the same boundary,
			// keeping the mute percussive rather than smeared across the cell.
			const adjustedDuration = mutedDuration - noteOffset;
			if (adjustedDuration <= 0) continue;
			decayTimeConstant = Math.max(
				adjustedDuration * DECAY_TIME_CONSTANT_RATIO,
				MIN_DECAY_TC_S,
			);
			ringSeconds = adjustedDuration;
		} else {
			// Struck strings let ring: the cell length no longer cuts them, so a
			// strum still sounds while the next one lands on top of it.
			decayTimeConstant = STRUM_RING_SECONDS / RING_DECAY_TC_DIVISOR;
			ringSeconds = STRUM_RING_SECONDS;
		}

		// Slight taper toward the sweep end, under the shared headroom ceiling.
		const volume = STRUM_STRING_VOLUME * Math.pow(STRUM_SWEEP_TAPER, i);
		_scheduleNote(
			ctx,
			target,
			zone,
			zone.buffer,
			when + noteOffset,
			pitches[i],
			decayTimeConstant,
			ringSeconds,
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

/** Sustain duration (s) for chord preview playback. */
export const CHORD_PREVIEW_DURATION_S = 2.0;

/**
 * Synchronously trigger a chord preview using the steel guitar preset already loaded
 * for D/U strums. Notes are played low-to-high with the same 10 ms per-string stagger
 * as triggerStrum. Silently no-ops if preloadStrumPresets has not yet resolved.
 *
 * Added to _activeSources so cancelStrums() stops preview notes too.
 *
 * @param pitches  - MIDI pitch values for each string to play (any order; sorted internally).
 * @param ctx      - AudioContext (managed by the caller).
 * @param target   - Destination AudioNode.
 * @param when     - Absolute AudioContext time in seconds.
 */
export function triggerChordPreview(
	pitches: readonly number[],
	ctx: AudioContext,
	target: AudioNode,
	when: number,
): void {
	const preset = _readyFingerpickPresets.get("pluck");
	if (!preset) return;

	const sorted = [...pitches].sort((a, b) => a - b);

	for (let i = 0; i < sorted.length; i++) {
		const zone = findZoneForMidi(preset, sorted[i]);
		if (!zone.buffer) continue;

		const noteOffset = i * STRUM_STAGGER_S;
		const adjustedDuration = CHORD_PREVIEW_DURATION_S - noteOffset;
		if (adjustedDuration <= 0) continue;

		// The preview keeps its own decay: it is a chord audition, not a strum in
		// a pattern, so nothing else is about to land on top of it.
		_scheduleNote(
			ctx,
			target,
			zone,
			zone.buffer,
			when + noteOffset,
			sorted[i],
			Math.max(adjustedDuration * DECAY_TIME_CONSTANT_RATIO, MIN_DECAY_TC_S),
			adjustedDuration,
			0.7,
		);
	}
}

/**
 * React hook wrapper. Caches are module-level; multiple hook instances share
 * the same presets and active-source set.
 */
export function useGuitarSampleLoader(): {
	preloadStrumPresets: typeof preloadStrumPresets;
	triggerStrum: typeof triggerStrum;
	triggerChordPreview: typeof triggerChordPreview;
	cancelStrums: typeof cancelStrums;
} {
	return { preloadStrumPresets, triggerStrum, triggerChordPreview, cancelStrums };
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
 *
 * One set: a slap or dead note is the same string cut short in the scheduler
 * (as TuxGuitar, alphaTab and MuseScore play one), not a muted-guitar preset.
 * Deliberately distinct from StrumSoundType to prevent accidental cross-use
 * with the strumming machine's SoundBlaster presets.
 */
export type FingerpickSoundType = "pluck";

/**
 * Full guitar range preloaded for the fingerpick engine and the fretboard:
 * open low E (E2) to the 22nd fret of the high e (D6). Preload decodes every
 * zone a pitch in this range falls into; a pitch outside it plays silently.
 */
export const FINGERPICK_MIDI_LOW = 40;
export const FINGERPICK_MIDI_HIGH = 86;

const FINGERPICK_PRESET_DEFS: Record<FingerpickSoundType, { key: string }> = {
	pluck: { key: "0250_LK_AcousticSteel_SF2_file" },
};

// ─── Fingerpick module-level state ────────────────────────────────────────────

const _fingerpickPresetCache = new Map<FingerpickSoundType, Promise<WafPreset>>();
const _readyFingerpickPresets = new Map<FingerpickSoundType, WafPreset>();

// ─── Fingerpick preset loading (internal) ─────────────────────────────────────

function _loadFingerpickPreset(type: FingerpickSoundType): Promise<WafPreset> {
	const cached = _fingerpickPresetCache.get(type);
	if (cached) return cached;

	const promise = fetchPreset(FINGERPICK_PRESET_DEFS[type].key);
	_fingerpickPresetCache.set(type, promise);
	promise.catch(() => _fingerpickPresetCache.delete(type));
	return promise;
}

// ─── Fingerpick public API ────────────────────────────────────────────────────

/**
 * Fetch, parse, and decode the fingerpick guitar preset across the full guitar
 * range (MIDI 40–86). Call once before the first getBufferForMidi invocation.
 *
 * Presets loaded:
 *   "pluck" → 0250_LK_AcousticSteel_SF2_file (LK Acoustic Steel, GM 25)
 *
 * Caching follows the same pattern as preloadStrumPresets: in-flight fetches are
 * deduplicated by _fingerpickPresetCache; decoded buffers are stored on zone.buffer
 * and the ready preset is stored in _readyFingerpickPresets for synchronous access.
 */
export async function preloadFingerpickPresets(ctx: AudioContext): Promise<void> {
	const types: FingerpickSoundType[] = ["pluck"];
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
