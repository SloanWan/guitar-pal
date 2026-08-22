import type { FingerpickPattern, Duration, Technique, Stroke } from "@/lib/fingerpickTypes";

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
	/** Propagated from StringFret for audio shaping — all optional to preserve backward compat. */
	ghostNote?: boolean;
	accent?: boolean;
	staccato?: boolean;
	/** Let the note ring past its notated duration; termination comes from voice stealing only. */
	letRing?: boolean;
	/**
	 * Per-string gain multiplier from a roll's stagger taper (arpeggiated chord). Present
	 * only on events belonging to a slot that carries a `stroke`; applied on top of the
	 * normal gain ladder in the engine. Absent on non-rolled slots (backward compat).
	 */
	rollGain?: number;
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

// ─── Roll (arpeggiated chord) parameters ──────────────────────────────────────

/**
 * Gap handling when a rolled slot has holes (inactive strings between active ones).
 *  - "consume"  — the hand still travels across skipped strings, so a skipped string
 *                 consumes a stagger step (physically faithful across a full sweep).
 *  - "collapse" — skipped strings are removed; only active strings consume steps, so
 *                 sparse voicings roll as an even, tight arpeggio of the played notes.
 */
export type RollGapMode = "consume" | "collapse";

/**
 * Which struck string lands exactly on the beat.
 *  - "first-on-beat" — the first attack is on the beat, the rest spread AFTER it
 *                      (offsets ≥ 0; the roll begins on the beat).
 *  - "last-on-beat"  — the last attack is on the beat, earlier attacks lead INTO it
 *                      (offsets ≤ 0; the roll anticipates the beat).
 */
export type RollAnchor = "first-on-beat" | "last-on-beat";

/**
 * How the per-string stagger scales with the slot's duration.
 *  - "fixed"          — always `baseStagger`, no scaling (only the hard safety ceiling
 *                       ever clamps it, to prevent bleed into the next slot).
 *  - "proportional"   — stagger = slotDurationSeconds × `proportionalFraction`.
 *  - "fixed-with-cap" — `baseStagger`, but the TOTAL roll span is clamped so it never
 *                       exceeds `spanCapFraction` × the slot duration.
 */
export type RollStaggerMode = "fixed" | "proportional" | "fixed-with-cap";

export interface RollParams {
	/** Seconds between adjacent strings for "fixed" / "fixed-with-cap" modes. */
	baseStagger: number;
	/** Scaling mode for the per-string stagger. */
	staggerMode: RollStaggerMode;
	/** For "proportional" mode: per-adjacent-string stagger = slotSeconds × this. */
	proportionalFraction: number;
	/**
	 * Total-roll-span cap as a fraction of the slot duration. Actively clamps mode
	 * "fixed-with-cap". In every mode a separate hard ceiling (`ROLL_HARD_SPAN_CEILING`)
	 * additionally guarantees the roll never bleeds into the next slot.
	 */
	spanCapFraction: number;
	/** Multiplier applied to the stagger for "roll-up" only (up/down are not symmetric). */
	rollUpMultiplier: number;
	/** Per-successive-string gain taper (e.g. 0.9 ⇒ each later note is 0.9× the previous). */
	gainTaper: number;
	/** Gap handling for sparse voicings. */
	gapMode: RollGapMode;
	/** Which struck string lands on the beat. */
	anchor: RollAnchor;
}

/**
 * Hard safety ceiling on the total roll span, as a fraction of the slot duration.
 * Always applied in every stagger mode so a roll can never bleed into the next slot,
 * independent of the tunable `spanCapFraction` (which is mode-"fixed-with-cap"'s target).
 * Kept below 1 with margin so the last attack still lands well inside the slot.
 */
export const ROLL_HARD_SPAN_CEILING = 0.9;

/**
 * Production defaults. Each note the reasoning:
 *  - baseStagger 0.03 s — perceptible arpeggiation; a touch wider than the strum
 *    machine's 10 ms so a roll reads as individual notes rather than a fast strum.
 *  - staggerMode "fixed-with-cap" — a consistent tactile roll at normal tempo, with
 *    the cap protecting fast subdivisions from bleeding.
 *  - proportionalFraction 0.08 — a 6-string roll then spans ~40% of the slot.
 *  - spanCapFraction 0.5 — a roll occupies at most half its slot, leaving the chord
 *    time to ring; beyond ~half it stops reading as a single chord.
 *  - rollUpMultiplier 1.2 — up-strokes are slightly slower/less even than down-strokes.
 *  - gainTaper 0.9 — matches the strum machine; later notes in the sweep are softer.
 *  - gapMode "collapse" — sparse fingerstyle voicings roll as an even arpeggio.
 *  - anchor "first-on-beat" — standard notation: the arpeggio begins on the beat, and
 *    offsets stay ≥ 0 so a roll can never produce an unschedulable time < 0.
 */
export const DEFAULT_ROLL_PARAMS: RollParams = {
	baseStagger: 0.03,
	staggerMode: "fixed-with-cap",
	proportionalFraction: 0.08,
	spanCapFraction: 0.5,
	rollUpMultiplier: 1.2,
	gainTaper: 0.9,
	gapMode: "collapse",
	anchor: "first-on-beat",
};

/** Per-string result of a roll: a time offset (seconds, relative to the slot start) and a gain multiplier. */
export interface RollOffset {
	/** Seconds relative to the slot's nominal start (≥ 0 for first-on-beat, ≤ 0 for last-on-beat). */
	timeOffset: number;
	/** Multiplier applied on top of the note's base gain (per-successive-string taper). */
	gain: number;
}

/**
 * Compute per-string time offsets and gain tapers for a rolled slot. Pure — no timing
 * side effects; the slot's duration and the following slot are unaffected (the caller
 * still advances time by the full slot duration). Returns an empty map for an empty
 * input or a single struck string (no roll possible).
 *
 * `sweepPos` orders strings by the hand's travel direction (0 = first string reached):
 *   roll-down: 5 - stringIndex (low E first), roll-up: stringIndex (high e first).
 */
export function computeRollOffsets(
	struckStringIndices: number[],
	stroke: Stroke,
	slotDurationSeconds: number,
	params: RollParams,
): Map<number, RollOffset> {
	const result = new Map<number, RollOffset>();
	if (struckStringIndices.length === 0) return result;

	const sweepPos = (s: number): number => (stroke === "roll-down" ? 5 - s : s);
	// Hand-travel order (ascending sweep position).
	const ordered = [...struckStringIndices].sort((a, b) => sweepPos(a) - sweepPos(b));
	const minSweep = sweepPos(ordered[0]);

	// Step index of each struck string: rank (collapse) or full sweep distance (consume).
	const stepOf = (s: number, rank: number): number =>
		params.gapMode === "collapse" ? rank : sweepPos(s) - minSweep;

	// Per-step stagger by mode.
	let stepSize =
		params.staggerMode === "proportional"
			? slotDurationSeconds * params.proportionalFraction
			: params.baseStagger;

	// Direction asymmetry: widen roll-up only.
	if (stroke === "roll-up") stepSize *= params.rollUpMultiplier;

	const maxStep = ordered.reduce((mx, s, rank) => Math.max(mx, stepOf(s, rank)), 0);

	if (maxStep > 0) {
		// Mode "fixed-with-cap" actively clamps the total span to spanCapFraction.
		if (params.staggerMode === "fixed-with-cap") {
			const cap = params.spanCapFraction * slotDurationSeconds;
			if (stepSize * maxStep > cap) stepSize = cap / maxStep;
		}
		// Hard safety ceiling in EVERY mode — a roll must never bleed into the next slot.
		const ceiling = ROLL_HARD_SPAN_CEILING * slotDurationSeconds;
		if (stepSize * maxStep > ceiling) stepSize = ceiling / maxStep;
	}

	const totalSpan = maxStep * stepSize;
	ordered.forEach((s, rank) => {
		const base = stepOf(s, rank) * stepSize;
		// first-on-beat: attacks spread after the beat (base ≥ 0).
		// last-on-beat: shift so the final attack lands on the beat (base - totalSpan ≤ 0).
		const timeOffset = params.anchor === "last-on-beat" ? base - totalSpan : base;
		result.set(s, { timeOffset, gain: Math.pow(params.gainTaper, rank) });
	});

	return result;
}

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
 *  - A slot without a `stroke` behaves exactly as before: all its events share the same
 *    `time`, `measureIndex`, `slotIndex`, and carry no `rollGain`. When a slot HAS a
 *    `stroke`, its per-string events are staggered (arpeggiated) per `rollParams`; the
 *    slot's own duration and the following slot's start time are unchanged.
 */
export function fingerpickPatternToScheduleEvents(
	pattern: FingerpickPattern,
	bpm: number,
	rollParams: RollParams = DEFAULT_ROLL_PARAMS,
): ScheduleEvent[] {
	const secondsPerBeat = 60 / bpm;
	const events: ScheduleEvent[] = [];
	let currentTime = 0;
	// A roll can place attacks before their slot's nominal start (last-on-beat anchor),
	// so the flat array is only re-sorted when at least one slot was actually rolled —
	// a stroke-free pattern keeps its original insertion order (byte-identical output).
	let anyRoll = false;

	for (let measureIndex = 0; measureIndex < pattern.measures.length; measureIndex++) {
		const measure = pattern.measures[measureIndex];
		for (let slotIndex = 0; slotIndex < measure.slots.length; slotIndex++) {
			const slot = measure.slots[slotIndex];
			// Grace notes use a fixed 1/32-beat duration and do not advance currentTime.
			const slotDuration = slot.isGraceNote
				? DURATION_BEATS["32nd"] * secondsPerBeat
				: DURATION_BEATS[slot.duration] * secondsPerBeat;

			if (slot.duration !== "rest") {
				// A rolled slot staggers its attacks; gather the strings that will fire
				// (same predicate as the push below) and resolve per-string offsets.
				let rollOffsets: Map<number, RollOffset> | null = null;
				if (slot.stroke !== undefined) {
					const struck: number[] = [];
					slot.strings.forEach((sf, i) => {
						if (sf.tied) return;
						if (sf.fret !== null || sf.muted) struck.push(i);
					});
					rollOffsets = computeRollOffsets(struck, slot.stroke, slotDuration, rollParams);
					anyRoll = true;
				}

				slot.strings.forEach((sf, stringIndex) => {
					if (sf.tied) return;
					const isPlayed = sf.fret !== null || sf.muted;
					if (!isPlayed) return;

					const openMidi = OPEN_STRING_MIDI[stringIndex];
					// fret takes priority over muted for pitch; muted only shapes the envelope.
					const midi = sf.fret !== null ? openMidi + sf.fret : openMidi;

					const roll = rollOffsets?.get(stringIndex);
					events.push({
						time: currentTime + (roll?.timeOffset ?? 0),
						duration: slotDuration,
						stringIndex,
						midi,
						technique: sf.technique,
						muted: sf.muted,
						measureIndex,
						slotIndex,
						...(sf.ghostNote && { ghostNote: true }),
						...(sf.accent && { accent: true }),
						...(sf.staccato && { staccato: true }),
						...(sf.letRing && { letRing: true }),
						...(roll && { rollGain: roll.gain }),
					});
				});
			}

			if (!slot.isGraceNote) {
				currentTime += slotDuration;
			}
		}
	}

	// Restore the time-sorted invariant only when a roll may have perturbed it. The
	// comparator returns 0 for equal times, and the sort is stable, so a stroke-free
	// pattern would be untouched even if this ran — but it never runs for one.
	if (anyRoll) {
		events.sort((a, b) => a.time - b.time);
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
	fadeTau: number = VOICE_STEAL_FADE_TAU,
): void {
	const prev = voices.get(stringIndex);
	if (!prev) return;
	prev.gainNode.gain.cancelScheduledValues(when);
	prev.gainNode.gain.setTargetAtTime(0, when, fadeTau);
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
