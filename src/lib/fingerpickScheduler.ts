import type { FingerpickPattern, Duration, Technique } from "@/lib/fingerpickTypes";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface MeasureBoundary {
	measureIndex: number;
	/** Absolute seconds from pattern start. */
	startTime: number;
}

export interface ScheduleEvent {
	/** Absolute seconds from pattern start. */
	time: number;
	/** Slot duration in seconds (used for gain-decay envelope). */
	duration: number;
	/** String index 0-5 (0 = high e, 5 = low E). */
	stringIndex: number;
	/** Resolved MIDI pitch: open-string MIDI + fret. */
	midi: number;
	technique: Technique;
	muted: boolean;
	measureIndex: number;
	slotIndex: number;
}

/**
 * Minimal shape that an active voice must satisfy for voice stealing.
 * Both real AudioNode objects and test mocks satisfy this interface.
 */
export interface VoiceHandle {
	gainNode: {
		gain: {
			cancelScheduledValues: (startTime: number) => void;
			setTargetAtTime: (value: number, startTime: number, timeConstant: number) => void;
		};
	};
	source: {
		stop: (when?: number) => void;
	};
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Standard guitar tuning MIDI notes for open strings.
 * Index 0 = high e (E4 = 64), index 5 = low E (E2 = 40).
 */
export const OPEN_STRING_MIDI: readonly number[] = [64, 59, 55, 50, 45, 40];

/** Exponential time constant (s) for voice-steal fade. ~5 ms avoids clicks. */
export const VOICE_STEAL_FADE_TAU = 0.005;

/** Seconds added to stop() beyond fade onset to let the envelope tail off. */
export const VOICE_STEAL_STOP_BUFFER = 0.05;

const DURATION_BEATS: Record<Duration, number> = {
	whole: 4,
	half: 2,
	quarter: 1,
	"dotted-quarter": 1.5,
	eighth: 0.5,
	"dotted-eighth": 0.75,
	"eighth-triplet": 1 / 3,
	sixteenth: 0.25,
	"sixteenth-triplet": 1 / 6,
	"32nd": 0.125,
	rest: 1,
};

// ─── Pure scheduling functions ────────────────────────────────────────────────

/**
 * Convert a FingerpickPattern into a flat, time-sorted array of note events.
 *
 * Rules:
 *  - Rest slots advance time but produce no events.
 *  - Tied strings produce no re-attack event (the previous note sustains).
 *  - Pitch is always derived from `fret` when non-null (even for muted strings —
 *    a palm-muted note at fret 5 has the same pitch as an unmuted fret 5; the
 *    `muted` flag only drives preset selection and envelope shaping).
 *    Falls back to open-string MIDI when `fret === null` (open dead note).
 *  - All events within a slot share the same `time`, `measureIndex`, `slotIndex`.
 */
export function fingerpickPatternToScheduleEvents(
	pattern: FingerpickPattern,
	bpm: number,
): ScheduleEvent[] {
	const secondsPerBeat = 60 / bpm;
	const events: ScheduleEvent[] = [];
	let currentTime = 0;

	for (let measureIndex = 0; measureIndex < pattern.measures.length; measureIndex++) {
		const measure = pattern.measures[measureIndex];
		for (let slotIndex = 0; slotIndex < measure.slots.length; slotIndex++) {
			const slot = measure.slots[slotIndex];
			// Grace notes use a fixed 1/32-beat duration and do not advance currentTime.
			const slotDuration = slot.isGraceNote
				? DURATION_BEATS["32nd"] * secondsPerBeat
				: DURATION_BEATS[slot.duration] * secondsPerBeat;

			if (slot.duration !== "rest") {
				slot.strings.forEach((sf, stringIndex) => {
					if (sf.tied) return;
					const isPlayed = sf.fret !== null || sf.muted;
					if (!isPlayed) return;

					const openMidi = OPEN_STRING_MIDI[stringIndex];
					// fret takes priority over muted for pitch; muted only shapes the envelope.
					const midi = sf.fret !== null ? openMidi + sf.fret : openMidi;

					events.push({
						time: currentTime,
						duration: slotDuration,
						stringIndex,
						midi,
						technique: sf.technique,
						muted: sf.muted,
						measureIndex,
						slotIndex,
					});
				});
			}

			if (!slot.isGraceNote) {
				currentTime += slotDuration;
			}
		}
	}

	return events;
}

/** Sum of all slot durations across all measures, in seconds. */
export function getTotalPatternDuration(pattern: FingerpickPattern, bpm: number): number {
	const secondsPerBeat = 60 / bpm;
	let total = 0;
	for (const measure of pattern.measures) {
		for (const slot of measure.slots) {
			total += DURATION_BEATS[slot.duration] * secondsPerBeat;
		}
	}
	return total;
}

/**
 * Absolute time offset (seconds from playback start) at which loop pass N begins.
 * Pass 0 offset is always 0.
 */
export function computeLoopOffset(
	passIndex: number,
	patternDuration: number,
	loopGapSeconds: number,
): number {
	return passIndex * (patternDuration + loopGapSeconds);
}

/**
 * Find the start time (seconds from pass start) of the first event whose
 * measureIndex and slotIndex both match. Returns 0 if not found (safe fallback
 * to the beginning of the pattern).
 *
 * Used when changing BPM mid-playback: given the current musical position
 * (measureIndex / slotIndex derived from the old-BPM event list), this returns
 * the corresponding absolute time in the recomputed new-BPM event list so
 * scheduling can resume from the same musical position at the new tempo.
 */
export function findSlotStartTime(
	events: ScheduleEvent[],
	measureIndex: number,
	slotIndex: number,
): number {
	for (const event of events) {
		if (event.measureIndex === measureIndex && event.slotIndex === slotIndex) {
			return event.time;
		}
	}
	return 0;
}

/**
 * Return the measure/slot index of the event most recently started at `elapsed`
 * seconds into a single pass. Returns null if no events have started yet.
 *
 * When `boundaries` is provided, elapsed time that has crossed into a later
 * measure than the last fired event (e.g. a measure that starts with a rest)
 * returns slot 0 of that measure instead of stalling at the previous event.
 */
export function getProgressAtTime(
	events: ScheduleEvent[],
	elapsed: number,
	boundaries?: MeasureBoundary[],
): { measureIndex: number; slotIndex: number } | null {
	if (events.length === 0 || elapsed < 0) return null;
	let result: { measureIndex: number; slotIndex: number } | null = null;
	for (const event of events) {
		if (event.time > elapsed) break;
		result = { measureIndex: event.measureIndex, slotIndex: event.slotIndex };
	}

	if (boundaries) {
		let boundaryMeasureIndex = result?.measureIndex ?? 0;
		for (const b of boundaries) {
			if (b.startTime <= elapsed) {
				boundaryMeasureIndex = b.measureIndex;
			} else {
				break;
			}
		}
		if (boundaryMeasureIndex > (result?.measureIndex ?? -1)) {
			return { measureIndex: boundaryMeasureIndex, slotIndex: 0 };
		}
	}

	return result;
}

/** Absolute start time (seconds from pattern start) for each measure. */
export function computeMeasureBoundaries(
	pattern: FingerpickPattern,
	bpm: number,
): MeasureBoundary[] {
	const secondsPerBeat = 60 / bpm;
	const boundaries: MeasureBoundary[] = [];
	let currentTime = 0;
	for (let measureIndex = 0; measureIndex < pattern.measures.length; measureIndex++) {
		boundaries.push({ measureIndex, startTime: currentTime });
		const measure = pattern.measures[measureIndex];
		for (const slot of measure.slots) {
			currentTime += DURATION_BEATS[slot.duration] * secondsPerBeat;
		}
	}
	return boundaries;
}

// ─── Voice stealing ───────────────────────────────────────────────────────────

/**
 * Schedule a rapid gain fade-out and source stop on the current voice for
 * `stringIndex` (if one exists), then remove it from the map.
 *
 * Callers register the new voice in the map after this call.
 * Extracted as a standalone function so the stealing logic is testable
 * without a real AudioContext.
 */
export function stealVoice(
	voices: Map<number, VoiceHandle>,
	stringIndex: number,
	when: number,
): void {
	const prev = voices.get(stringIndex);
	if (!prev) return;
	prev.gainNode.gain.cancelScheduledValues(when);
	prev.gainNode.gain.setTargetAtTime(0, when, VOICE_STEAL_FADE_TAU);
	prev.source.stop(when + VOICE_STEAL_STOP_BUFFER);
	// Remove immediately so a second steal for the same string within the same
	// scheduling pass doesn't attempt to stop the already-scheduled fade.
	voices.delete(stringIndex);
}

// ─── Engine shutdown ──────────────────────────────────────────────────────────

/**
 * Stop all active voices and clear any pending scheduling timers.
 * Called by both stop/pause and the useEffect cleanup in useFingerpickAudioEngine.
 * Exported so it can be unit-tested without a React render context.
 *
 * @param allSources - When provided, every source in this Set is stopped and the
 *   Set is cleared. This covers intermediate pre-scheduled sources that are no
 *   longer tracked in `voices` (i.e. notes that were voice-stolen by later events
 *   but whose source.start(futureTimestamp) was already handed to the Web Audio
 *   scheduler). When omitted, falls back to stopping only the `voices` map entries.
 */
export function _shutdownEngine(
	voices: Map<number, { source: { stop: (when?: number) => void } }>,
	timerIds: (ReturnType<typeof setTimeout> | null)[],
	allSources?: Set<{ stop: (when?: number) => void }>,
): void {
	for (const id of timerIds) {
		if (id !== null) clearTimeout(id);
	}
	if (allSources) {
		for (const src of allSources) {
			try {
				src.stop();
			} catch {
				/* already ended */
			}
		}
		allSources.clear();
	} else {
		for (const voice of voices.values()) {
			try {
				voice.source.stop();
			} catch {
				/* already ended */
			}
		}
	}
	voices.clear();
}
