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

			if (!slot.isRest) {
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

	promoteSlideOriginsToLetRing(events);

	return events;
}

/**
 * A slide bends the note already sounding on its string — it never re-plucks. For that the
 * origin (the immediately preceding same-string note) must still be a live, registered
 * voice when the slide lands. A short, non-letRing origin falls below the voice-map
 * registration threshold, so the slide finds no voice and falls back to a fresh pluck — an
 * audible SECOND attack instead of a glide. This promotes every slide origin to letRing so
 * the slide always has a voice to bend.
 *
 * Mutates events in place. Touches only the origins of slides, so a slide-free pattern is
 * left byte-identical (early-out below). A slide that is the FIRST note on its string has no
 * origin and is left to fall back — correctly, since there is nothing to slide from.
 */
export function promoteSlideOriginsToLetRing(events: ScheduleEvent[]): void {
	const hasSlide = events.some((e) => e.technique === "slide-up" || e.technique === "slide-down");
	if (!hasSlide) return;

	// Per-string predecessor lookup needs time order; `events` may still be in insertion order.
	const ordered = [...events].sort((a, b) => a.time - b.time);
	const lastByString = new Map<number, ScheduleEvent>();
	for (const ev of ordered) {
		if (ev.technique === "slide-up" || ev.technique === "slide-down") {
			const origin = lastByString.get(ev.stringIndex);
			if (origin) origin.letRing = true;
		}
		lastByString.set(ev.stringIndex, ev);
	}
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

// ─── Slide (real pitch motion) ──────────────────────────────────────────────
//
// Every other technique modifies a NEW note. A slide does not: on a real guitar the
// string is never re-plucked — one sounding note changes pitch. So a slide event does
// NOT emit a new AudioBufferSourceNode; instead it ramps playbackRate on the voice that
// is ALREADY sounding on that string (the origin note), and extends that voice's life to
// cover the slid-into note. This is only feasible because letRing keeps notes ringing
// long enough to still be alive when the slide arrives. When no live origin voice exists
// (first note on the string, origin already voice-stolen/decayed, or interval too wide),
// the slide falls back to an ordinary retriggered pluck.

/** How the ramp duration is derived. */
export type SlideDurationScaling = "fixed" | "interval-scaled";

/**
 * Where the ramp sits relative to the target note's beat.
 *  - "finish-on-target" — the ramp ENDS on the beat: the note arrives on time and the
 *    slide happens just before it, consuming the tail of the origin note (real playing).
 *  - "start-on-target"  — the ramp STARTS on the beat and travels after it.
 */
export type SlideAnchor = "finish-on-target" | "start-on-target";

export interface SlideParams {
	/** Ramp duration (s) for "fixed" scaling. */
	rampDurationS: number;
	/** How the ramp duration scales. */
	durationScaling: SlideDurationScaling;
	/** For "interval-scaled": ramp duration = interval(semitones) × this. */
	intervalScaleSecPerSemitone: number;
	/** Where the ramp sits relative to the target beat. */
	anchor: SlideAnchor;
	/**
	 * Interval (semitones) beyond which the slide falls back to a normal retriggered
	 * note. Large intervals resample the buffer far from its recorded pitch (12 frets =
	 * 2× rate) and sound artificial.
	 */
	maxIntervalSemitones: number;
	/** Optional mid-ramp gain dip (0 = off, 0.3 = dip to 70% at the ramp midpoint). */
	gainDip: number;
	/**
	 * Floor for the slid-into note's gain, as a fraction of the ORIGIN voice's attack
	 * volume (0 = no floor). A slide re-plucks nothing: the target inherits whatever the
	 * origin's decay has left, which — for a slow origin or a late slide — can be nearly
	 * inaudible. This clamps the hand-off gain to at least `minGainRatio × attackVolume`
	 * so the target still speaks. 0.5 ≈ "never quieter than half the origin's attack".
	 */
	minGainRatio: number;
}

/**
 * Production defaults, each with reasoning:
 *  - rampDurationS 0.08 — fast enough to read as a connecting slide between two beats,
 *    slow enough that the pitch motion is audible rather than a click.
 *  - durationScaling "fixed" — predictable; a wide and a narrow slide take the same time.
 *  - intervalScaleSecPerSemitone 0.02 — for "interval-scaled": a 2-fret slide = 0.04 s,
 *    a 7-fret slide = 0.14 s, matching a real hand travelling further in more time.
 *  - anchor "start-on-target" — the slide begins on the beat and travels after it, so the
 *    hand-off starts from the origin's gain at the beat rather than one ramp-duration
 *    earlier into its decay. Keeps the slid-into note more audible than "finish-on-target"
 *    (which consumes the origin's tail before the beat even arrives).
 *  - maxIntervalSemitones 12 — permissive by default so wide slides still bend and their
 *    resampling artefact is audible for the listening decision; a tighter ceiling (≈5–7)
 *    is the suggested production value once the artefact is judged unacceptable.
 *  - gainDip 0.4 — dip to 60% mid-travel then recover, so the slide has an audible
 *    "finger sliding across frets loses energy" swell rather than a flat glide.
 *  - minGainRatio 0.75 — floor the hand-off gain at 75% of the origin's attack so a
 *    slid-into note is never swallowed by the origin's decay. Set 0 in the lab to hear
 *    the raw decay.
 */
export const DEFAULT_SLIDE_PARAMS: SlideParams = {
	rampDurationS: 0.08,
	durationScaling: "fixed",
	intervalScaleSecPerSemitone: 0.02,
	anchor: "start-on-target",
	maxIntervalSemitones: 12,
	gainDip: 0.4,
	minGainRatio: 0.75,
};

/** Floor for a computed ramp duration so a zero-interval slide still ramps briefly. */
const MIN_SLIDE_RAMP_S = 0.005;

export type SlideFallbackReason =
	| "not-a-slide"
	| "no-origin-voice"
	| "origin-not-ringing"
	| "interval-too-wide";

/** Everything the engine needs to bend an already-sounding voice into the target note. */
export interface SlidePlan {
	/** Rate the ramp starts from — the origin voice's CURRENT logical rate (tracks chains). */
	fromRate: number;
	/** Rate the ramp reaches — the target pitch's playbackRate. */
	targetRate: number;
	/** Absolute time the ramp (and its rate anchor) begins. */
	rampStartTime: number;
	/** Absolute time of the ramp midpoint — used only for the optional gain dip. */
	rampMidTime: number;
	/** Absolute time the ramp reaches targetRate. */
	rampEndTime: number;
	/** New hard-stop for the origin source, extended to cover the slid-into note. */
	newStopTime: number;
	/** Time from which the re-armed gain decay runs (the target note's beat). */
	decayFromTime: number;
	/** Mid-ramp gain dip fraction (0 = none), copied from params for the engine. */
	gainDip: number;
}

export type SlideResolution =
	| { action: "handoff"; plan: SlidePlan }
	| { action: "fallback"; reason: SlideFallbackReason };

/** Minimal live-voice state a slide needs from the origin note. */
export interface SlideOriginVoice {
	/** Current logical playbackRate (NOT AudioParam.value, which is unreliable at schedule time). */
	currentRate: number;
	/** Current logical MIDI pitch of the origin (updated across chained slides). */
	currentMidi: number;
	/** Absolute time the origin source is scheduled to hard-stop. */
	stopTime: number;
}

/**
 * Decide whether a slide event can hand off to a live origin voice, and if so compute
 * the full ramp/envelope geometry. Pure — no Web Audio side effects. `now` is the
 * AudioContext time at schedule time; it clamps a "finish-on-target" ramp so it never
 * starts in the past (which would make the exponential ramp behave oddly).
 */
export function resolveSlide(args: {
	technique: Technique;
	origin: SlideOriginVoice | undefined;
	targetMidi: number;
	targetRate: number;
	targetDuration: number;
	when: number;
	now: number;
	params: SlideParams;
	sourceStopBuffer: number;
}): SlideResolution {
	const { technique, origin, targetMidi, targetRate, targetDuration, when, now, params, sourceStopBuffer } =
		args;

	if (technique !== "slide-up" && technique !== "slide-down") {
		return { action: "fallback", reason: "not-a-slide" };
	}
	if (!origin) return { action: "fallback", reason: "no-origin-voice" };
	// Origin source already hard-stopped (voice-stolen or decayed past its lifetime) by
	// the time the slide arrives — nothing left to bend.
	if (when >= origin.stopTime) return { action: "fallback", reason: "origin-not-ringing" };

	const interval = Math.abs(targetMidi - origin.currentMidi);
	if (interval > params.maxIntervalSemitones) {
		return { action: "fallback", reason: "interval-too-wide" };
	}

	const rampDuration =
		params.durationScaling === "interval-scaled"
			? Math.max(interval * params.intervalScaleSecPerSemitone, MIN_SLIDE_RAMP_S)
			: params.rampDurationS;

	let rampStartTime: number;
	let rampEndTime: number;
	if (params.anchor === "finish-on-target") {
		rampEndTime = when;
		rampStartTime = Math.max(when - rampDuration, now);
	} else {
		rampStartTime = Math.max(when, now);
		rampEndTime = rampStartTime + rampDuration;
	}
	// Guarantee a strictly positive ramp window for exponentialRampToValueAtTime.
	if (rampEndTime <= rampStartTime) rampEndTime = rampStartTime + MIN_SLIDE_RAMP_S;
	const rampMidTime = (rampStartTime + rampEndTime) / 2;

	const newStopTime = Math.max(origin.stopTime, when + targetDuration + sourceStopBuffer);

	return {
		action: "handoff",
		plan: {
			fromRate: origin.currentRate,
			targetRate,
			rampStartTime,
			rampMidTime,
			rampEndTime,
			newStopTime,
			decayFromTime: when,
			gainDip: params.gainDip,
		},
	};
}

/**
 * Minimal Web Audio surface a slide handoff manipulates — the ALREADY-PLAYING origin
 * voice. Both real nodes and test mocks satisfy this.
 */
export interface SlideVoiceHandle {
	source: {
		stop: (when?: number) => void;
		playbackRate: {
			cancelScheduledValues: (startTime: number) => void;
			setValueAtTime: (value: number, startTime: number) => void;
			exponentialRampToValueAtTime: (value: number, endTime: number) => void;
		};
	};
	gainNode: {
		gain: {
			cancelScheduledValues: (startTime: number) => void;
			setValueAtTime: (value: number, startTime: number) => void;
			setTargetAtTime: (value: number, startTime: number, timeConstant: number) => void;
			exponentialRampToValueAtTime: (value: number, endTime: number) => void;
		};
	};
}

/** Smallest positive gain used to anchor exponential ramps (which cannot reach zero). */
const MIN_RAMP_GAIN = 1e-4;

/**
 * Bend an already-sounding voice into the slide's target: ramp its playbackRate and
 * extend its gain envelope + hard-stop to cover the slid-into note. Creates NO new source.
 *
 * Uses exponentialRampToValueAtTime for the pitch ramp — pitch is logarithmic in
 * playbackRate, so a LINEAR ramp would sound fast-then-slow and not read as a slide.
 * Exponential ramps can neither cross nor reach zero; both playbackRate and gain values
 * here are strictly positive, and the dipped/anchor gains are floored at MIN_RAMP_GAIN.
 */
export function applySlideToVoice(
	voice: SlideVoiceHandle,
	plan: SlidePlan,
	opts: { gainAtRampStart: number; decayTc: number },
): void {
	const pr = voice.source.playbackRate;
	pr.cancelScheduledValues(plan.rampStartTime);
	pr.setValueAtTime(plan.fromRate, plan.rampStartTime);
	pr.exponentialRampToValueAtTime(plan.targetRate, plan.rampEndTime);

	const g = voice.gainNode.gain;
	const start = Math.max(opts.gainAtRampStart, MIN_RAMP_GAIN);
	g.cancelScheduledValues(plan.rampStartTime);
	if (plan.gainDip > 0) {
		// Dip mid-travel (a real slide loses energy) then recover to the sustain level.
		g.setValueAtTime(start, plan.rampStartTime);
		g.exponentialRampToValueAtTime(Math.max(start * (1 - plan.gainDip), MIN_RAMP_GAIN), plan.rampMidTime);
		g.exponentialRampToValueAtTime(start, plan.rampEndTime);
	} else {
		// Hold the current level across the ramp so the note does not die on the origin's
		// decay timetable before the target beat.
		g.setValueAtTime(start, plan.rampStartTime);
	}
	// Re-arm the decay from the target beat so the slid-into note rings for its own duration.
	g.setTargetAtTime(0, plan.decayFromTime, opts.decayTc);

	voice.source.stop(plan.newStopTime);
}

// ─── Dependency-injected note scheduler ──────────────────────────────────────
//
// Extracted from useFingerpickAudioEngine.scheduleNote so the create-or-handoff decision
// is unit-testable with a mock AudioContext (a slide that silently created no ramp — or
// dropped the note entirely — must be caught by a test, not shipped). The engine wires
// its refs/constants into `deps` and this function performs identical work for every
// non-slide event; a pattern with no slides never enters the handoff branch.

export type LegatoTreatment = "current" | "gain-only" | "dry";

/** Gain ladder + letRing lifetime, injected so tests control every value. */
export interface NoteGains {
	normal: number;
	technique: number;
	tapping: number;
	ghost: number;
	accentMultiplier: number;
	letRingLifetimeTaus: number;
}

/** Envelope shape scheduleFingerpickNote reads (structurally EnvelopeParams). */
export interface NoteEnvelope {
	decayTcRatio: number;
	minDecayTc: number;
	voiceStealFadeTau: number;
	letRingDecayTc: number;
	sourceStopBuffer: number;
}

/** Resolves the decoded buffer + playbackRate for a note; returns null if unavailable. */
export type NoteDataResolver = (
	muted: boolean,
	midi: number,
) => { buffer: AudioBuffer; playbackRate: number } | null;

/** A live per-string voice, with the extra logical state a slide handoff needs. */
export interface SlideActiveVoice extends VoiceHandle {
	gainNode: GainNode;
	source: AudioBufferSourceNode;
	/** The event that created this voice — identity for the steal observer + cleanup. */
	event: ScheduleEvent;
	/** Absolute time of this voice's hard source.stop(). */
	stopTime: number;
	/** Current logical playbackRate (tracks slide ramps across a chain). */
	currentRate: number;
	/** Current logical MIDI pitch (updated on each handoff for chained-slide intervals). */
	currentMidi: number;
	/** Attack gain, onset time and decay τ — used to reconstruct the mid-ramp gain for a dip. */
	attackVolume: number;
	attackTime: number;
	decayTc: number;
}

export interface FingerpickNoteSchedulerDeps {
	ctx: AudioContext;
	target: AudioNode;
	voices: Map<number, SlideActiveVoice>;
	allSources: Set<AudioBufferSourceNode>;
	resolveNoteData: NoteDataResolver;
	gains: NoteGains;
	envelope: NoteEnvelope;
	forceLetRing: boolean;
	legatoTreatment: LegatoTreatment;
	slideParams: SlideParams;
	/** Read-only voice-steal observer; invoked only when a still-ringing voice is stolen. */
	onVoiceSteal?: (outgoing: SlideActiveVoice, incoming: ScheduleEvent) => void;
}

/**
 * Schedule one note. A slide with a live origin voice bends that voice in place (no new
 * source); every other event — including a slide that falls back — creates a source
 * exactly as the pre-slide engine did.
 */
export function scheduleFingerpickNote(
	deps: FingerpickNoteSchedulerDeps,
	event: ScheduleEvent,
	when: number,
): void {
	const {
		ctx,
		target,
		voices,
		allSources,
		resolveNoteData,
		gains,
		envelope: env,
		forceLetRing,
		legatoTreatment,
		slideParams,
	} = deps;

	const noteData = resolveNoteData(event.muted, event.midi);
	if (!noteData) return;

	const existing = voices.get(event.stringIndex);

	// ── Slide voice handoff ──────────────────────────────────────────────────
	// A handoff keeps playing the ORIGIN's buffer and only ramps its playbackRate, so the
	// ramp target must be the origin buffer's rate transposed by the pitch interval — NOT
	// the target note's own resolved playbackRate. With a multi-sampled instrument the
	// target note maps to a DIFFERENT zone played near rate 1.0, so `noteData.playbackRate`
	// would be ≈ the origin's rate and the ramp would move no pitch at all (silent slide).
	// Deriving it from origin.currentRate × 2^(Δsemitones/12) bends the sounding buffer by
	// the correct interval regardless of which zone the target would have used.
	const rampTargetRate = existing
		? existing.currentRate * Math.pow(2, (event.midi - existing.currentMidi) / 12)
		: noteData.playbackRate;
	const slide = resolveSlide({
		technique: event.technique,
		origin: existing
			? { currentRate: existing.currentRate, currentMidi: existing.currentMidi, stopTime: existing.stopTime }
			: undefined,
		targetMidi: event.midi,
		targetRate: rampTargetRate,
		targetDuration: event.duration,
		when,
		now: ctx.currentTime,
		params: slideParams,
		sourceStopBuffer: env.sourceStopBuffer,
	});

	if (slide.action === "handoff" && existing) {
		const letRing = event.letRing === true || forceLetRing;
		const noteDuration = event.staccato ? event.duration * 0.2 : event.duration;
		const decayTc = letRing
			? env.letRingDecayTc
			: Math.max(noteDuration * env.decayTcRatio, env.minDecayTc);
		// Reconstruct the origin's gain at the ramp start from its decay envelope so a dip
		// (and the sustain hold) start from the true current level, then floor it so a
		// slid-into note is never swallowed by a far-decayed origin (see minGainRatio).
		const decayedGain =
			existing.attackVolume *
			Math.exp(-Math.max(slide.plan.rampStartTime - existing.attackTime, 0) / existing.decayTc);
		const gainAtRampStart = Math.max(decayedGain, existing.attackVolume * slideParams.minGainRatio);

		applySlideToVoice(existing, slide.plan, { gainAtRampStart, decayTc });

		// Keep the voice registered under the same string so a later note steals it
		// normally; update its logical state so a chained slide anchors from the new pitch.
		existing.currentRate = slide.plan.targetRate;
		existing.currentMidi = event.midi;
		existing.stopTime = slide.plan.newStopTime;
		existing.attackVolume = gainAtRampStart;
		existing.attackTime = slide.plan.decayFromTime;
		existing.decayTc = decayTc;
		return;
	}

	// ── Voice-steal instrumentation (read-only; no-op without an observer) ─────
	if (existing && deps.onVoiceSteal && when < existing.stopTime) {
		deps.onVoiceSteal(existing, event);
	}

	// Steal (fade + stop) any ringing voice on this string.
	stealVoice(voices, event.stringIndex, when, env.voiceStealFadeTau);

	// ── Gain ladder (+ legato A/B for hammer-on / pull-off) ───────────────────
	const isHammerOrPull = event.technique === "hammer-on" || event.technique === "pull-off";
	let volume: number;
	if (event.ghostNote) {
		volume = gains.ghost;
	} else if (isHammerOrPull) {
		// "dry" plays a hammer/pull identically to a plucked note; "current" and
		// "gain-only" keep the reduced technique gain (they differ only in the filter).
		volume = legatoTreatment === "dry" ? gains.normal : gains.technique;
	} else if (event.technique === "trill") {
		volume = gains.technique;
	} else if (event.technique === "tapping") {
		volume = gains.tapping;
	} else {
		volume = gains.normal;
	}
	if (event.accent) volume *= gains.accentMultiplier;
	if (event.rollGain !== undefined) volume *= event.rollGain;

	// Staccato shortens the sounding duration to 20% of the slot duration.
	const noteDuration = event.staccato ? event.duration * 0.2 : event.duration;

	const source = ctx.createBufferSource();
	source.buffer = noteData.buffer;

	const effectiveDuration = noteDuration;
	source.playbackRate.value = noteData.playbackRate;

	const letRing = event.letRing === true || forceLetRing;

	const gainNode = ctx.createGain();
	gainNode.gain.setValueAtTime(volume, when);
	const decayTc = letRing
		? env.letRingDecayTc
		: Math.max(effectiveDuration * env.decayTcRatio, env.minDecayTc);
	gainNode.gain.setTargetAtTime(0, when, decayTc);

	// Legato lowpass masks the sample's pick transient. Trill keeps it always; hammer/pull
	// get it only in "current" treatment (the A/B: "gain-only"/"dry" drop the filter).
	const applyFilter = event.technique === "trill" || (isHammerOrPull && legatoTreatment === "current");
	if (applyFilter) {
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 2000;
		filter.Q.value = 0.7;
		source.connect(filter).connect(gainNode).connect(target);
	} else {
		source.connect(gainNode).connect(target);
	}
	source.start(when);
	const stopTime = letRing
		? when + env.letRingDecayTc * gains.letRingLifetimeTaus + env.sourceStopBuffer
		: when + effectiveDuration + env.sourceStopBuffer;
	source.stop(stopTime);

	allSources.add(source);
	// Grace notes (very short duration) are not registered so the next same-string note
	// does not steal and immediately silence them. letRing notes are always registered —
	// voice stealing is their only terminator (and a slide's only origin).
	if (event.duration >= 0.1 || letRing) {
		const voice: SlideActiveVoice = {
			gainNode,
			source,
			event,
			stopTime,
			currentRate: noteData.playbackRate,
			currentMidi: event.midi,
			attackVolume: volume,
			attackTime: when,
			decayTc,
		};
		voices.set(event.stringIndex, voice);
		source.onended = () => {
			allSources.delete(source);
			if (voices.get(event.stringIndex) === voice) {
				voices.delete(event.stringIndex);
			}
		};
	} else {
		source.onended = () => {
			allSources.delete(source);
		};
	}
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
