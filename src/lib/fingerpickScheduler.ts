import {
	isBrush,
	strokeDirection,
	type EffectKind,
	type FingerpickPattern,
	type Duration,
	type Link,
	type LinkKind,
	type NoteEffects,
	type Percussion,
	type PercussionKind,
	type Stroke,
} from "@/lib/fingerpickTypes";
import { patternCapo } from "@/lib/fingerpickChords";
import {
	bendTimeline,
	composeExpression,
	expressionForEffects,
	releaseDecayTc,
	whammyTimeline,
} from "@/lib/fingerpickExpression";
import { indexPattern, slurredInside, spanCovers } from "@/lib/fingerpickIndex";
import { harmonicShift, soundingMidi } from "@/lib/fingerpickPitch";
import { beatTicks } from "@/lib/fingerpickEdit";
import type { Meter } from "@/lib/strumMeter";

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
	muted: boolean;
	measureIndex: number;
	slotIndex: number;
	/** How the note is reached (model v2): a slide glides the sounding voice, a hammer / pull plays legato. */
	link?: Link;
	/** What is done to the note (model v2): bend, vibrato, accent, staccato, ghost, tap, trill … */
	effects?: NoteEffects;
	/** Let the note ring past its notated duration; termination comes from voice stealing only. */
	letRing?: boolean;
	/** Under a palm-mute span: damped, short and dull. */
	palmMute?: boolean;
	/** A right-hand hit this event voices (a slap's dead strike on this string). */
	percussion?: Percussion;
	/**
	 * The hand landing on the strings: one a slot that has an x on any string or a
	 * slap hit, filed under the low E, voiced as noise (`scheduleSlapNoise`) and
	 * never registered as a voice. `slapStrings` are the strings it lands on.
	 */
	slapNoise?: true;
	slapStrings?: number[];
	/**
	 * A tremolo stroke after the first: played a touch softer (`gains.tremoloAltGain`)
	 * on every second stroke, so the run reads as a hand, not a machine.
	 */
	altStroke?: true;
	/** Inside a slur span, after its first note: played legato, like a hammer-on. */
	slurred?: true;
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

// Open-string pitches live with the pitch labels (fingerpickPitch.ts); re-exported
// here for the callers that have always read them from the scheduler.
export { OPEN_STRING_MIDI } from "@/lib/fingerpickPitch";

/** Exponential time constant (s) for voice-steal fade. ~5 ms avoids clicks. */
export const VOICE_STEAL_FADE_TAU = 0.005;

/** Seconds added to stop() beyond fade onset to let the envelope tail off. */
export const VOICE_STEAL_STOP_BUFFER = 0.05;

/** Length of each Duration in quarter notes. */
const DURATION_QUARTERS: Record<Duration, number> = {
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

/**
 * Seconds per quarter note at `bpm` in a meter. BPM counts the meter's beat,
 * as a score prints it — ♩ = 90 in 4/4, ♩. = 60 in 6/8 — so in a compound
 * meter a quarter is two thirds of a beat. Every duration here is measured in
 * quarters, so this is the one place the meter enters the timing.
 */
export function secondsPerQuarter(bpm: number, timeSignature: Meter): number {
	return (60 / bpm) * (QUARTER_TICKS / beatTicks(timeSignature));
}

const QUARTER_TICKS = 24;

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
/**
 * A brush is a strum: the strings land close enough together to read as one
 * chord, so the stagger is a fixed few milliseconds with no direction asymmetry
 * and no gain taper — every string sounds at full weight.
 */
export const BRUSH_STAGGER_SECONDS = 0.007;

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

	const sweepPos = (s: number): number => (strokeDirection(stroke) === "down" ? 5 - s : s);
	// Hand-travel order (ascending sweep position).
	const ordered = [...struckStringIndices].sort((a, b) => sweepPos(a) - sweepPos(b));
	const minSweep = sweepPos(ordered[0]);

	// Step index of each struck string: rank (collapse) or full sweep distance (consume).
	const stepOf = (s: number, rank: number): number =>
		params.gapMode === "collapse" ? rank : sweepPos(s) - minSweep;

	// Per-step stagger by mode. A brush ignores the roll's modes: it is fast by
	// definition, the same in both directions.
	const brush = isBrush(stroke);
	let stepSize = brush
		? BRUSH_STAGGER_SECONDS
		: params.staggerMode === "proportional"
			? slotDurationSeconds * params.proportionalFraction
			: params.baseStagger;

	// Direction asymmetry: widen roll-up only.
	if (stroke === "roll-up") stepSize *= params.rollUpMultiplier;

	const maxStep = ordered.reduce((mx, s, rank) => Math.max(mx, stepOf(s, rank)), 0);

	if (maxStep > 0) {
		// Mode "fixed-with-cap" actively clamps the total span to spanCapFraction.
		if (!brush && params.staggerMode === "fixed-with-cap") {
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
		result.set(s, { timeOffset, gain: brush ? 1 : Math.pow(params.gainTaper, rank) });
	});

	return result;
}

// ─── Pure scheduling functions ────────────────────────────────────────────────

/**
 * Convert a FingerpickPattern into a flat, time-sorted array of note events.
 *
 * Rules:
 *  - Rest slots advance time but produce no events.
 *  - Tied strings produce no re-attack event: the previous note on that string
 *    sustains, its `duration` lengthened by the tied slot so the decay is the
 *    written length, not the first slot's.
 *  - Pitch is always derived from `fret` when non-null (even for muted strings —
 *    the `muted` flag only sets the strike's gain and length). Falls back to
 *    open-string MIDI when `fret === null` (an x: a slap on the string).
 *  - An x is a slap, not a silent dead note: the string's own sample at full
 *    velocity, cut off as the hand lands (`SlapParams.strikeS`, the way TuxGuitar,
 *    alphaTab and MuseScore play a dead note), plus one `slapNoise` event a slot
 *    — the strings hitting the frets and the body under them, which a MIDI
 *    engine cannot make — sounding with the slot's other notes.
 *  - A slot without a `stroke` behaves exactly as before: all its events share the same
 *    `time`, `measureIndex`, `slotIndex`, and carry no `rollGain`. When a slot HAS a
 *    `stroke`, its per-string events are staggered (arpeggiated) per `rollParams`; the
 *    slot's own duration and the following slot's start time are unchanged.
 */
/** A tremolo speed as the note value it names. */
const TREMOLO_DURATION: Record<NonNullable<NoteEffects["tremolo"]>["speed"], Duration> = {
	"8th": "eighth",
	"16th": "sixteenth",
	"32nd": "32nd",
};

/**
 * Where a tremolo-picked note's strokes fall inside its slot, as seconds from
 * the slot's start, with each stroke's length. The strokes are spaced evenly
 * at the nearest count to the speed's note value, so they always add up to
 * the slot (a dotted slot or an odd grid never leaves a gap or a spill); a
 * slot shorter than one stroke is one stroke.
 */
export function tremoloStrokes(slotDuration: number, speed: NonNullable<NoteEffects["tremolo"]>["speed"], quarter: number): { offset: number; duration: number }[] {
	const nominal = DURATION_QUARTERS[TREMOLO_DURATION[speed]] * quarter;
	const count = Math.max(1, Math.round(slotDuration / nominal));
	const duration = slotDuration / count;
	return Array.from({ length: count }, (_, k) => ({ offset: k * duration, duration }));
}

/** How fast a trill alternates — a hand's speed, whatever the tempo. */
export const TRILL_RATE_HZ = 10;

/**
 * Where a trilled note's strokes fall inside its slot: evenly spaced at the
 * count nearest `TRILL_RATE_HZ`, at least two (the note and its upper
 * neighbour), so they add up to the slot like tremolo strokes.
 */
export function trillStrokes(slotDuration: number): { offset: number; duration: number }[] {
	const count = Math.max(2, Math.round(slotDuration * TRILL_RATE_HZ));
	const duration = slotDuration / count;
	return Array.from({ length: count }, (_, k) => ({ offset: k * duration, duration }));
}

/** The strings a hit of each kind strikes dead; a body tap strikes none — it is one knock, voiced on its own (`BODY_TAP_STRING`). */
export const PERCUSSION_STRINGS: Record<PercussionKind, readonly number[]> = {
	slap: [0, 1, 2, 3, 4, 5],
	thumbSlap: [3, 4, 5],
	bodyTap: [],
};
/** The string index a body tap's event is filed under; it registers no voice there. */
export const BODY_TAP_STRING = 5;

export function fingerpickPatternToScheduleEvents(
	pattern: FingerpickPattern,
	bpm: number,
	rollParams: RollParams = DEFAULT_ROLL_PARAMS,
): ScheduleEvent[] {
	const index = indexPattern(pattern);
	const quarter = secondsPerQuarter(bpm, pattern.timeSignature);
	// The TAB is written relative to the capo, so every string sounds this much
	// higher than its written fret — folded in once here, at compile time.
	const capo = patternCapo(pattern);
	const events: ScheduleEvent[] = [];
	let currentTime = 0;
	// The last event struck on each string, for a tied slot to lengthen.
	const sounding: (ScheduleEvent | null)[] = [null, null, null, null, null, null];
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
				? DURATION_QUARTERS["32nd"] * quarter
				: DURATION_QUARTERS[slot.duration] * quarter;

			if (!slot.isRest) {
				// A rolled slot staggers its attacks; gather the strings that will fire
				// (same predicate as the push below) and resolve per-string offsets.
				let rollOffsets: Map<number, RollOffset> | null = null;
				if (slot.stroke !== undefined) {
					const struck: number[] = [];
					slot.strings.forEach((sf, i) => {
						if (sf.link?.kind === "tie") return;
						if (sf.fret !== null || sf.muted) struck.push(i);
					});
					rollOffsets = computeRollOffsets(struck, slot.stroke, slotDuration, rollParams);
					anyRoll = true;
				}

				const struckHere = new Set<number>();
				const slapped: number[] = [];
				slot.strings.forEach((sf, stringIndex) => {
					if (sf.link?.kind === "tie") {
						const held = sounding[stringIndex];
						if (held && !slot.isGraceNote) held.duration += slotDuration;
						return;
					}
					const isPlayed = sf.fret !== null || sf.muted;
					if (!isPlayed) return;
					struckHere.add(stringIndex);
					if (sf.muted) slapped.push(stringIndex);

					// fret takes priority over muted for pitch; muted only shapes the strike.
					// The same formula the reading page labels frets with, so they agree; a
					// harmonic sounds the partial its node gives, not the fret.
					const midi = soundingMidi(stringIndex, sf.fret ?? 0, capo) + (sf.effects?.harmonic ? harmonicShift(sf.effects.harmonic, sf.fret ?? 0) : 0);

					const roll = rollOffsets?.get(stringIndex);
					const common = {
						stringIndex,
						midi,
						muted: sf.muted,
						measureIndex,
						slotIndex,
						...(sf.link && { link: sf.link }),
						...(spanCovers(index, slot.id, "letRing", stringIndex) && { letRing: true }),
						...(spanCovers(index, slot.id, "palmMute", stringIndex) && { palmMute: true }),
						...(slurredInside(index, slot.id, stringIndex) && { slurred: true as const }),
						...(roll && { rollGain: roll.gain }),
					};
					const start = currentTime + (roll?.timeOffset ?? 0);

					// A trill alternates the note with its upper neighbour at a hand's speed:
					// the first stroke is the picked note, the rest are hammered up and
					// pulled back down, so the legato treatment falls out of the link.
					const trill = sf.effects?.trill;
					if (trill && !slot.isGraceNote && sf.fret !== null) {
						const { trill: _trill, ...rest } = sf.effects ?? {};
						void _trill;
						const effects = Object.keys(rest).length > 0 ? { effects: rest as NoteEffects } : {};
						const interval = Math.max(1, (trill.fret ?? sf.fret + 1) - sf.fret);
						let last: ScheduleEvent | null = null;
						trillStrokes(slotDuration).forEach((stroke, k) => {
							const upper = k % 2 === 1;
							const event: ScheduleEvent = {
								time: start + stroke.offset,
								duration: stroke.duration,
								...common,
								...effects,
								midi: midi + (upper ? interval : 0),
								...(k > 0 && { link: { kind: upper ? "hammer" : "pull" } as Link }),
							};
							events.push(event);
							last = event;
						});
						sounding[stringIndex] = last;
						return;
					}

					// Tremolo picking: the same note struck again and again for the slot's
					// length — one event per stroke, the tremolo itself taken off them.
					// A tie after the slot lengthens the last stroke, as a player would.
					const tremolo = sf.effects?.tremolo;
					if (tremolo && !slot.isGraceNote) {
						const { tremolo: _speed, ...rest } = sf.effects ?? {};
						void _speed;
						const effects = Object.keys(rest).length > 0 ? { effects: rest as NoteEffects } : {};
						let last: ScheduleEvent | null = null;
						tremoloStrokes(slotDuration, tremolo.speed, quarter).forEach((stroke, k) => {
							const event: ScheduleEvent = {
								time: start + stroke.offset,
								duration: stroke.duration,
								...common,
								...effects,
								...(k % 2 === 1 && { altStroke: true as const }),
							};
							events.push(event);
							last = event;
						});
						sounding[stringIndex] = last;
						return;
					}

					const event: ScheduleEvent = {
						time: start,
						duration: slotDuration,
						...common,
						...(sf.effects && Object.keys(sf.effects).length > 0 && { effects: sf.effects }),
					};
					events.push(event);
					sounding[stringIndex] = event;
				});

				// A body tap is one knock, not a strike on any string: one event, filed
				// under the low E but voiced as noise and never registered as a voice.
				if (slot.percussion?.kind === "bodyTap") {
					events.push({
						time: currentTime,
						duration: slotDuration,
						stringIndex: BODY_TAP_STRING,
						midi: soundingMidi(BODY_TAP_STRING, 0, capo),
						muted: true,
						measureIndex,
						slotIndex,
						percussion: slot.percussion,
					});
				}
				// A hit strikes its strings dead, over whatever notes the slot holds:
				// one muted event per string the hit covers that nothing else strikes.
				if (slot.percussion) {
					for (const stringIndex of PERCUSSION_STRINGS[slot.percussion.kind]) {
						if (struckHere.has(stringIndex)) continue;
						events.push({
							time: currentTime,
							duration: slotDuration,
							stringIndex,
							midi: soundingMidi(stringIndex, 0, capo),
							muted: true,
							measureIndex,
							slotIndex,
							percussion: slot.percussion,
						});
						slapped.push(stringIndex);
					}
				}
				// The hand lands once however many strings it slaps: one noise event a
				// slot, under the strikes. A body tap is its own knock and gets none.
				if (slapped.length > 0) {
					events.push({
						time: currentTime,
						duration: slotDuration,
						stringIndex: BODY_TAP_STRING,
						midi: soundingMidi(BODY_TAP_STRING, 0, capo),
						muted: true,
						measureIndex,
						slotIndex,
						slapNoise: true,
						slapStrings: slapped.sort((a, b) => a - b),
						...(slot.percussion && { percussion: slot.percussion }),
					});
				}
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
	const hasSlide = events.some((e) => isGlide(e.link));
	if (!hasSlide) return;

	// Per-string predecessor lookup needs time order; `events` may still be in insertion order.
	const ordered = [...events].sort((a, b) => a.time - b.time);
	const lastByString = new Map<number, ScheduleEvent>();
	for (const ev of ordered) {
		if (isGlide(ev.link)) {
			const origin = lastByString.get(ev.stringIndex);
			if (origin) origin.letRing = true;
		}
		lastByString.set(ev.stringIndex, ev);
	}
}

/** A slide that glides the sounding voice: a shift slide (`picked`) strikes its target again instead. */
export function isGlide(link: Link | undefined): boolean {
	return link?.kind === "slide" && !link.picked;
}

/** Sum of all slot durations across all measures, in seconds. */
export function getTotalPatternDuration(pattern: FingerpickPattern, bpm: number): number {
	const quarter = secondsPerQuarter(bpm, pattern.timeSignature);
	let total = 0;
	for (const measure of pattern.measures) {
		for (const slot of measure.slots) {
			total += DURATION_QUARTERS[slot.duration] * quarter;
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
	const quarter = secondsPerQuarter(bpm, pattern.timeSignature);
	const boundaries: MeasureBoundary[] = [];
	let currentTime = 0;
	for (let measureIndex = 0; measureIndex < pattern.measures.length; measureIndex++) {
		boundaries.push({ measureIndex, startTime: currentTime });
		const measure = pattern.measures[measureIndex];
		for (const slot of measure.slots) {
			currentTime += DURATION_QUARTERS[slot.duration] * quarter;
		}
	}
	return boundaries;
}

/** Where one slot starts, in seconds from the pattern's start. */
export interface SlotStart {
	measureIndex: number;
	slotIndex: number;
	time: number;
}

/**
 * The start of every slot, in order — a rest or an empty slot as much as a
 * sounding one, since a slot with nothing struck has no event to find it by.
 */
export function computeSlotStarts(pattern: FingerpickPattern, bpm: number): SlotStart[] {
	const quarter = secondsPerQuarter(bpm, pattern.timeSignature);
	const starts: SlotStart[] = [];
	let time = 0;
	pattern.measures.forEach((measure, measureIndex) => {
		measure.slots.forEach((slot, slotIndex) => {
			starts.push({ measureIndex, slotIndex, time });
			time += DURATION_QUARTERS[slot.duration] * quarter;
		});
	});
	return starts;
}

/** The slot sounding `elapsed` seconds in (the last to have started); null before the first. */
export function slotAtTime(starts: readonly SlotStart[], elapsed: number): SlotStart | null {
	let lo = 0;
	let hi = starts.length - 1;
	let found: SlotStart | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (starts[mid].time <= elapsed) {
			found = starts[mid];
			lo = mid + 1;
		} else hi = mid - 1;
	}
	return found;
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
	link: Link | undefined;
	origin: SlideOriginVoice | undefined;
	targetMidi: number;
	targetRate: number;
	targetDuration: number;
	when: number;
	now: number;
	params: SlideParams;
	sourceStopBuffer: number;
}): SlideResolution {
	const { link, origin, targetMidi, targetRate, targetDuration, when, now, params, sourceStopBuffer } =
		args;

	if (!isGlide(link)) {
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
	/** A slap: an x on a string, and a hit's dead strike across its strings — full velocity, cut short. */
	slap: number;
	/** Multiplier under a palm mute. */
	palmMute: number;
	/** Multiplier on every second stroke of a tremolo. */
	tremoloAltGain: number;
	/** A harmonic: the partial, lighter than a pluck. */
	harmonic: number;
	/** The quiet octave a harmonic carries under its partial, as a share of the harmonic gain. */
	harmonicBody: number;
	/** A pick scrape's noise sweep. */
	scrape: number;
	/** A knock on the body. */
	bodyTap: number;
	accentMultiplier: number;
	letRingLifetimeTaus: number;
}

/** Envelope shape scheduleFingerpickNote reads (structurally EnvelopeParams). */
export interface NoteEnvelope {
	decayTcRatio: number;
	minDecayTc: number;
	voiceStealFadeTau: number;
	letRingDecayTc: number;
	/** Ceiling on a palm-muted note's decay time constant (s). */
	palmMuteDecayTc: number;
	/** Ceiling on a harmonic's decay time constant (s): a partial dies sooner than the string. */
	harmonicDecayTc: number;
	sourceStopBuffer: number;
}

// ─── What each kind does to the voice ────────────────────────────────────────
// The registry's `audio` flag for a kind means it has an entry here (or in the
// scheduler's event pass, for spans and hits); a kind with no entry plays as a
// plain note.

/** The gain a link plays at; a hammer / pull is quieter than a pick unless the legato A/B says "dry". */
const LINK_GAIN: Partial<Record<LinkKind, (gains: NoteGains, legato: LegatoTreatment) => number>> = {
	hammer: (gains, legato) => (legato === "dry" ? gains.normal : gains.technique),
	pull: (gains, legato) => (legato === "dry" ? gains.normal : gains.technique),
};

/** The gain an effect plays at, in the order they are consulted; the first present wins. */
const EFFECT_GAIN: [EffectKind, (gains: NoteGains) => number][] = [
	["ghost", (gains) => gains.ghost],
	["trill", (gains) => gains.technique],
	["tap", (gains) => gains.tapping],
	["harmonic", (gains) => gains.harmonic],
];

/** Lowpass cutoff (Hz) a kind puts on the voice; the lowest of those present applies. */
const LEGATO_LOWPASS_HZ = 2000;
const PALM_MUTE_LOWPASS_HZ = 900;
/** A tapped note skips the sample's pick transient and eases in. */
export const TAP_SKIP_S = 0.008;
const TAP_RAMP_S = 0.005;
/** A slide into / out of a note travels this far, in semitones. */
export const SLIDE_IN_OUT_SEMITONES = 2;
/** A pick scrape's bandpass sweeps from the bridge-side rasp down to the wound strings' thud. */
const SCRAPE_FROM_HZ = 3000;
const SCRAPE_TO_HZ = 400;
const SCRAPE_Q = 2;
/** A body tap: a low thump with a little wood resonance under it. */
const BODY_TAP_LOWPASS_HZ = 150;
const BODY_TAP_TONE_HZ = 80;
const BODY_TAP_DECAY_TC = 0.06;
const BODY_TAP_ATTACK_S = 0.002;

/** Whether the legato lowpass masks the pick transient for this event. */
function legatoFilter(event: ScheduleEvent, legato: LegatoTreatment): boolean {
	if (event.effects?.trill || event.effects?.tap) return true;
	const kind = event.link?.kind;
	return (kind === "hammer" || kind === "pull" || event.slurred === true) && legato === "current";
}

/** Two seconds of white noise, made once per context — the raw material of a scrape and a body tap. */
const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();
export function noiseBufferFor(ctx: AudioContext): AudioBuffer {
	const cached = noiseBuffers.get(ctx);
	if (cached) return cached;
	const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 2), ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
	noiseBuffers.set(ctx, buffer);
	return buffer;
}

/**
 * Every kind the scheduler voices: the links it plays legato or glides, the
 * effects with a gain, a shape or a curve, the spans and hits the event pass
 * reads. The registry's `audio` flags are tested against this list.
 */
export const AUDIO_KINDS: ReadonlySet<string> = new Set([
	"tie",
	"hammer",
	"pull",
	"slide",
	"bend",
	"vibrato",
	"tap",
	"trill",
	"accent",
	"staccato",
	"ghost",
	"tremolo",
	"harmonic",
	"slideIn",
	"slideOut",
	"whammy",
	"scrape",
	"letRing",
	"palmMute",
	"slur",
	"slap",
	"thumbSlap",
	"bodyTap",
]);

/** The attack gain for an event, from the tables above. */
export function noteGain(event: ScheduleEvent, gains: NoteGains, legato: LegatoTreatment): number {
	let volume: number | null = null;
	// An x is a slap on its string, hit or not.
	if (event.percussion || event.muted) volume = gains.slap;
	else if (event.effects?.ghost) volume = gains.ghost;
	else if (event.link && LINK_GAIN[event.link.kind]) volume = LINK_GAIN[event.link.kind]!(gains, legato);
	else {
		for (const [kind, gain] of EFFECT_GAIN) {
			if (event.effects?.[kind]) {
				volume = gain(gains);
				break;
			}
		}
	}
	if (volume === null && event.slurred && LINK_GAIN.hammer) volume = LINK_GAIN.hammer(gains, legato);
	if (volume === null) volume = gains.normal;
	if (event.effects?.accent || event.percussion?.accent) volume *= gains.accentMultiplier;
	if (event.palmMute) volume *= gains.palmMute;
	if (event.altStroke) volume *= gains.tremoloAltGain;
	if (event.rollGain !== undefined) volume *= event.rollGain;
	return volume;
}

/** Resolves the decoded buffer + playbackRate for a pitch; returns null if unavailable. */
export type NoteDataResolver = (midi: number) => { buffer: AudioBuffer; playbackRate: number } | null;

/**
 * How a slap sounds (an x on a string, or a hit's strike), in three layers:
 *
 *  - the strike: the string's own sample cut off as the hand lands, the attack
 *    being all that sounds. TuxGuitar and alphaTab give a dead note 30 ticks at
 *    960 a quarter (≈ 31 ms whatever the tempo), MuseScore 50 ms, and alphaTab's
 *    whole-hand dead slap is a 64th on every open string at forte — none of
 *    them reach for a muted-guitar preset;
 *  - the clack: the strings hitting the frets, a bandpassed noise burst a few
 *    milliseconds long, once a slot;
 *  - the thud: the hand on the body, lowpassed noise with a sine dropping under
 *    it, once a slot and mostly on the bass strings.
 *
 * A MIDI engine stops at the first layer; the other two are what a listener
 * hears as a slap. Tuned by ear on `/dev/slap-lab`.
 */
export interface SlapParams {
	/** The strike's length (s) and gain decay τ (s). */
	strikeS: number;
	strikeTc: number;
	/** The clack: bandpass centre (Hz), its Q, gain decay τ (s) and gain. */
	clackHz: number;
	clackQ: number;
	clackTc: number;
	clackGain: number;
	/** The thud: lowpass cutoff (Hz), gain decay τ (s), gain, and the sine's start and end (Hz). */
	thudHz: number;
	thudTc: number;
	thudGain: number;
	thudToneFromHz: number;
	thudToneToHz: number;
	/** How much of the thud a slap on the treble strings alone keeps. */
	trebleThud: number;
}

export const DEFAULT_SLAP_PARAMS: SlapParams = {
	strikeS: 0.06,
	strikeTc: 0.02,
	clackHz: 2500,
	clackQ: 1.2,
	clackTc: 0.008,
	clackGain: 0.5,
	thudHz: 200,
	thudTc: 0.045,
	thudGain: 0.55,
	thudToneFromHz: 110,
	thudToneToHz: 60,
	trebleThud: 0.35,
};

/** Attack ramp for the thud (s), so it does not click. */
const SLAP_THUD_ATTACK_S = 0.002;
/** Strings whose slap carries the whole thud (the bass side). */
const SLAP_BASS_FROM_STRING = 3;

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
	/** The noise a scrape, a body tap and a slap's clack and thud are made of (`noiseBufferFor`); without it they are silent. */
	noiseBuffer?: AudioBuffer | null;
	/** How a slap is voiced; `DEFAULT_SLAP_PARAMS` when absent. */
	slapParams?: SlapParams;
}

/**
 * A sound with no string behind it: a pick scrape (noise swept down through a
 * bandpass over the slot) or a body tap (a low thump with a little wood under
 * it). Registers no voice — nothing can be slid from or stolen here — and
 * leaves the string's own voice alone.
 */
export function scheduleNoiseEvent(deps: FingerpickNoteSchedulerDeps, event: ScheduleEvent, when: number): void {
	const { ctx, target, allSources, gains } = deps;
	const buffer = deps.noiseBuffer;
	if (!buffer) return;
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.loop = true;
	const gainNode = ctx.createGain();
	const filter = ctx.createBiquadFilter();
	const accent = event.percussion?.accent || event.effects?.accent ? gains.accentMultiplier : 1;
	let stopTime: number;
	if (event.percussion?.kind === "bodyTap") {
		filter.type = "lowpass";
		filter.frequency.value = BODY_TAP_LOWPASS_HZ;
		filter.Q.value = 1.5;
		gainNode.gain.setValueAtTime(0, when);
		gainNode.gain.linearRampToValueAtTime(gains.bodyTap * accent, when + BODY_TAP_ATTACK_S);
		gainNode.gain.setTargetAtTime(0, when + BODY_TAP_ATTACK_S, BODY_TAP_DECAY_TC);
		// The wood: a short sine under the thump, on the same envelope.
		const tone = ctx.createOscillator();
		tone.type = "sine";
		tone.frequency.value = BODY_TAP_TONE_HZ;
		tone.connect(gainNode);
		tone.start(when);
		stopTime = when + BODY_TAP_DECAY_TC * 5;
		tone.stop(stopTime);
	} else {
		const duration = Math.max(event.duration, 0.05);
		filter.type = "bandpass";
		filter.Q.value = SCRAPE_Q;
		filter.frequency.setValueAtTime(SCRAPE_FROM_HZ, when);
		filter.frequency.exponentialRampToValueAtTime(SCRAPE_TO_HZ, when + duration);
		gainNode.gain.setValueAtTime(gains.scrape * accent, when);
		gainNode.gain.setTargetAtTime(0, when, duration * 0.6);
		stopTime = when + duration + deps.envelope.sourceStopBuffer;
	}
	source.connect(filter).connect(gainNode).connect(target);
	source.start(when);
	source.stop(stopTime);
	allSources.add(source);
	source.onended = () => {
		allSources.delete(source);
	};
}

/**
 * The hand landing on the strings: the clack of the strings on the frets and the
 * thud of the body, one of each a slot (`slapNoise` events). Registers no voice;
 * the strings' own strikes are separate events through `scheduleFingerpickNote`.
 */
export function scheduleSlapNoise(deps: FingerpickNoteSchedulerDeps, event: ScheduleEvent, when: number): void {
	const { ctx, target, allSources, gains } = deps;
	const buffer = deps.noiseBuffer;
	if (!buffer) return;
	const p = deps.slapParams ?? DEFAULT_SLAP_PARAMS;
	const accent = event.percussion?.accent ? gains.accentMultiplier : 1;
	const bass = (event.slapStrings ?? []).some((i) => i >= SLAP_BASS_FROM_STRING);
	const track = (source: AudioBufferSourceNode) => {
		allSources.add(source);
		source.onended = () => {
			allSources.delete(source);
		};
	};

	// The clack: strings on the frets.
	const clack = ctx.createBufferSource();
	clack.buffer = buffer;
	clack.loop = true;
	const clackFilter = ctx.createBiquadFilter();
	clackFilter.type = "bandpass";
	clackFilter.frequency.value = p.clackHz;
	clackFilter.Q.value = p.clackQ;
	const clackGain = ctx.createGain();
	clackGain.gain.setValueAtTime(p.clackGain * accent, when);
	clackGain.gain.setTargetAtTime(0, when, p.clackTc);
	clack.connect(clackFilter).connect(clackGain).connect(target);
	clack.start(when);
	clack.stop(when + p.clackTc * 6);
	track(clack);

	// The thud: the hand on the body, with a sine dropping under it.
	const thud = ctx.createBufferSource();
	thud.buffer = buffer;
	thud.loop = true;
	const thudFilter = ctx.createBiquadFilter();
	thudFilter.type = "lowpass";
	thudFilter.frequency.value = p.thudHz;
	thudFilter.Q.value = 1;
	const thudGain = ctx.createGain();
	const peak = p.thudGain * (bass ? 1 : p.trebleThud) * accent;
	thudGain.gain.setValueAtTime(0, when);
	thudGain.gain.linearRampToValueAtTime(peak, when + SLAP_THUD_ATTACK_S);
	thudGain.gain.setTargetAtTime(0, when + SLAP_THUD_ATTACK_S, p.thudTc);
	const tone = ctx.createOscillator();
	tone.type = "sine";
	tone.frequency.setValueAtTime(p.thudToneFromHz, when);
	tone.frequency.exponentialRampToValueAtTime(p.thudToneToHz, when + p.thudTc * 2);
	const thudStop = when + SLAP_THUD_ATTACK_S + p.thudTc * 5;
	thud.connect(thudFilter).connect(thudGain).connect(target);
	tone.connect(thudGain);
	thud.start(when);
	thud.stop(thudStop);
	tone.start(when);
	tone.stop(thudStop);
	track(thud);
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

	// A scrape, a body tap and a slap's landing have no string behind them.
	if (event.slapNoise) {
		scheduleSlapNoise(deps, event, when);
		return;
	}
	if (event.effects?.scrape || event.percussion?.kind === "bodyTap") {
		scheduleNoiseEvent(deps, event, when);
		return;
	}

	const noteData = resolveNoteData(event.midi);
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
		link: event.link,
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
		const noteDuration = event.effects?.staccato ? event.duration * 0.2 : event.duration;
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

	// ── Gain ladder (+ legato A/B for hammer / pull) ──────────────────────────
	const volume = noteGain(event, gains, legatoTreatment);

	// Staccato shortens the sounding duration to 20% of the slot duration. A slap
	// is only its strike: the hand is on the string by `strikeS`.
	const noteDuration = event.effects?.staccato ? event.duration * 0.2 : event.duration;
	const slap = deps.slapParams ?? DEFAULT_SLAP_PARAMS;

	const source = ctx.createBufferSource();
	source.buffer = noteData.buffer;
	let harmonicBody: AudioBufferSourceNode | null = null;

	const effectiveDuration = event.muted ? slap.strikeS : noteDuration;
	source.playbackRate.value = noteData.playbackRate;

	// ── Slides into and out of the note: pitch motion on its own voice ────────
	// A slide in starts the sample a couple of frets away and ramps to pitch
	// over the slide's travel; a slide out leaves the pitch the same way at the
	// end of the written duration, the gain fading with it so the note dies on
	// the way rather than landing anywhere. Both ride on playbackRate, so a
	// bend or vibrato (on detune) composes with them.
	const semis = (dir: "below" | "above") => (dir === "below" ? -SLIDE_IN_OUT_SEMITONES : SLIDE_IN_OUT_SEMITONES);
	const rampS = slideParams.rampDurationS;
	if (event.effects?.slideIn) {
		const fromRate = noteData.playbackRate * Math.pow(2, semis(event.effects.slideIn.from) / 12);
		source.playbackRate.setValueAtTime(fromRate, when);
		source.playbackRate.exponentialRampToValueAtTime(noteData.playbackRate, when + rampS);
	}

	// A palm mute damps the string, and a slap is over before it could ring: neither
	// rings on, however the playback mode is set.
	const letRing = (event.letRing === true || forceLetRing) && !event.palmMute && !event.muted;

	const gainNode = ctx.createGain();
	if (event.effects?.tap) {
		// No pick on a tapped note: ease the gain in over the first milliseconds.
		gainNode.gain.setValueAtTime(MIN_RAMP_GAIN, when);
		gainNode.gain.linearRampToValueAtTime(volume, when + TAP_RAMP_S);
	} else {
		gainNode.gain.setValueAtTime(volume, when);
	}
	let decayTc = letRing
		? env.letRingDecayTc
		: Math.max(effectiveDuration * env.decayTcRatio, env.minDecayTc);
	if (event.palmMute) decayTc = Math.min(decayTc, env.palmMuteDecayTc);
	if (event.effects?.harmonic) decayTc = Math.min(decayTc, env.harmonicDecayTc);
	if (event.muted) decayTc = slap.strikeTc;

	// ── Pitch expression: bend / vibrato ─────────────────────────────────────
	// One detune curve for the note's whole audible life, set once on its own
	// source. playbackRate is left alone, so a later slide handoff ramping this
	// voice composes with the curve (the two params multiply). The gain envelope
	// is untouched except that a released bend keeps enough level to be heard
	// coming back down.
	const expression = expressionForEffects(event.effects);
	if (expression) {
		const curveDuration = letRing ? env.letRingDecayTc * gains.letRingLifetimeTaus : effectiveDuration;
		const curve = composeExpression(expression, curveDuration);
		source.detune.setValueCurveAtTime(curve.values, when + curve.startTime, curve.duration);
		if (expression.bend?.release) {
			decayTc = releaseDecayTc(decayTc, bendTimeline(expression.bend, curveDuration));
		}
		if (expression.whammy?.release) {
			decayTc = releaseDecayTc(decayTc, whammyTimeline(expression.whammy, curveDuration));
		}
	}
	gainNode.gain.setTargetAtTime(0, event.effects?.tap ? when + TAP_RAMP_S : when, decayTc);

	if (event.effects?.slideOut) {
		const outStart = Math.max(when, when + effectiveDuration - rampS);
		const toRate = noteData.playbackRate * Math.pow(2, semis(event.effects.slideOut.to) / 12);
		source.playbackRate.setValueAtTime(noteData.playbackRate, outStart);
		source.playbackRate.exponentialRampToValueAtTime(toRate, outStart + rampS);
		gainNode.gain.setTargetAtTime(0, outStart, Math.min(decayTc, rampS / 2));
	}

	// Legato lowpass masks the sample's pick transient. Trill keeps it always; hammer/pull
	// get it only in "current" treatment (the A/B: "gain-only"/"dry" drop the filter).
	// A palm mute dulls the note further; the lower cutoff wins when both apply.
	const cutoffs: number[] = [];
	if (legatoFilter(event, legatoTreatment)) cutoffs.push(LEGATO_LOWPASS_HZ);
	if (event.palmMute) cutoffs.push(PALM_MUTE_LOWPASS_HZ);
	if (cutoffs.length > 0) {
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = Math.min(...cutoffs);
		filter.Q.value = 0.7;
		source.connect(filter).connect(gainNode).connect(target);
	} else {
		source.connect(gainNode).connect(target);
	}
	// A harmonic is the sample at its partial's pitch — the way TuxGuitar and
	// alphaTab play one — with a quiet copy an octave under it for the body the
	// string still gives (TuxGuitar's second, softer note). No filter: the pluck
	// an octave or two up already chimes.
	if (event.effects?.harmonic) {
		const body = resolveNoteData(event.midi - 12);
		if (body) {
			const under = ctx.createBufferSource();
			under.buffer = body.buffer;
			under.playbackRate.value = body.playbackRate;
			const underGain = ctx.createGain();
			underGain.gain.value = gains.harmonicBody;
			under.connect(underGain).connect(gainNode);
			under.start(when);
			allSources.add(under);
			under.onended = () => {
				allSources.delete(under);
			};
			// Stopped with the main source below, by the same clock.
			harmonicBody = under;
		}
	}
	// A tapped note skips the sample's pick transient.
	if (event.effects?.tap) source.start(when, TAP_SKIP_S);
	else source.start(when);
	const stopTime = letRing
		? when + env.letRingDecayTc * gains.letRingLifetimeTaus + env.sourceStopBuffer
		: when + effectiveDuration + env.sourceStopBuffer;
	source.stop(stopTime);
	if (harmonicBody) harmonicBody.stop(stopTime);

	allSources.add(source);
	// Grace notes (very short duration) are not registered so the next same-string note
	// does not steal and immediately silence them, and a slap is over before anything
	// could slide from or steal it. letRing notes are always registered — voice
	// stealing is their only terminator (and a slide's only origin).
	if ((event.duration >= 0.1 && !event.muted) || letRing) {
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
