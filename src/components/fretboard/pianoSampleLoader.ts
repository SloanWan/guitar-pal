/**
 * The piano root selector's own voice: one WebAudioFont piano preset, fetched
 * once and decoded only for the zones the 61-key keyboard can reach.
 *
 * Reuses the guitar loader's parser, decoder and zone lookup so the CDN
 * handling lives in one place; what is separate is the cache (a piano is not
 * a fingerpick preset), the ring (a piano key sustains longer than a pluck)
 * and the active-source set (`cancelPianoNotes` stops only piano notes).
 *
 * Preset chosen in /dev/piano-preset-audition: Chaos Acoustic Grand, the
 * smallest of the eleven candidates (~180 KB) with no audible seams.
 */
import {
	SOURCE_STOP_BUFFER_S,
	SampleLoadError,
	WAF_BASE_URL,
	_decodeZone,
	findZoneForMidi,
	parsePresetFromJs,
	type WafPreset,
	type WafZone,
} from "@/components/strum/useGuitarSampleLoader";
import { PIANO_61, type PianoRange } from "@/lib/piano/keys";

export const PIANO_PRESET = {
	key: "0000_Chaos_sf2_file",
	varName: "_tone_0000_Chaos_sf2_file",
} as const;

/** How long a key rings after it is struck; the decay time constant is a third of it. */
export const PIANO_RING_SECONDS = 2.5;
export const PIANO_VOLUME = 0.8;

let _presetPromise: Promise<WafPreset> | null = null;
let _readyPreset: WafPreset | null = null;
const _activeSources = new Set<AudioBufferSourceNode>();

/** The distinct zones that sound any pitch in `range`, in preset order. */
export function zonesCovering(preset: WafPreset, range: PianoRange): WafZone[] {
	const wanted = new Set<WafZone>();
	for (let midi = range.fromMidi; midi <= range.toMidi; midi++) wanted.add(findZoneForMidi(preset, midi));
	return preset.zones.filter((zone) => wanted.has(zone));
}

async function fetchPreset(): Promise<WafPreset> {
	const url = `${WAF_BASE_URL}${PIANO_PRESET.key}.js`;
	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new SampleLoadError(`Network error fetching piano preset from ${url}`, err);
	}
	if (!response.ok) throw new SampleLoadError(`HTTP ${response.status} fetching piano preset from ${url}`);
	return parsePresetFromJs(await response.text(), PIANO_PRESET.varName);
}

/**
 * Fetch and decode the piano once. Concurrent callers share the download; a
 * failure is forgotten so the next call retries. Only the zones `range`
 * touches are decoded, so a 61-key board never pays for the piano's extremes.
 */
export async function preloadPianoPreset(ctx: AudioContext, range: PianoRange = PIANO_61): Promise<void> {
	if (_readyPreset) return;
	if (!_presetPromise) {
		_presetPromise = (async () => {
			const preset = await fetchPreset();
			for (const zone of zonesCovering(preset, range)) zone.buffer = await _decodeZone(zone, ctx);
			return preset;
		})();
		_presetPromise.catch(() => {
			_presetPromise = null;
		});
	}
	_readyPreset = await _presetPromise;
}

/**
 * Sound one piano key. Silent until `preloadPianoPreset` has resolved, or for
 * a pitch whose zone was not decoded. Same pitch model as the guitar's
 * `_scheduleNote`: playback rate from the zone's original pitch, loop points
 * honoured, decay from the strike.
 */
export function triggerPianoNote(midi: number, ctx: AudioContext, target: AudioNode, when: number): void {
	const preset = _readyPreset;
	if (!preset) return;
	const zone = findZoneForMidi(preset, midi);
	if (!zone.buffer) return;

	const baseDetune = zone.originalPitch - 100 * zone.coarseTune - zone.fineTune;
	const source = ctx.createBufferSource();
	source.buffer = zone.buffer;
	source.playbackRate.value = Math.pow(2, (100 * midi - baseDetune) / 1200);

	const loopStart = zone.loopStart / zone.sampleRate;
	const loopEnd = zone.loopEnd / zone.sampleRate;
	if (loopStart > 0 && loopEnd > loopStart) {
		source.loop = true;
		source.loopStart = loopStart;
		source.loopEnd = loopEnd;
	}

	const gain = ctx.createGain();
	gain.gain.setValueAtTime(PIANO_VOLUME, when);
	gain.gain.setTargetAtTime(0, when, PIANO_RING_SECONDS / 3);
	source.connect(gain).connect(target);
	source.start(when);
	source.stop(when + PIANO_RING_SECONDS + SOURCE_STOP_BUFFER_S);

	_activeSources.add(source);
	source.onended = () => {
		_activeSources.delete(source);
	};
}

/** Stop every piano note still ringing. Call on unmount (Constraint 4). */
export function cancelPianoNotes(): void {
	for (const source of _activeSources) {
		try {
			source.stop();
		} catch {
			// Already ended.
		}
	}
	_activeSources.clear();
}

/** For testing only — forgets the fetched preset. */
export function _resetPianoCacheForTesting(): void {
	_presetPromise = null;
	_readyPreset = null;
	_activeSources.clear();
}

/** For testing only — injects a preset without fetching. */
export function _setReadyPianoPresetForTesting(preset: WafPreset): void {
	_readyPreset = preset;
}
