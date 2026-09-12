import {
	DEFAULT_STRUM_BPM,
	STRUM_BPM_MAX,
	STRUM_BPM_MIN,
	type Bar,
	type Beat,
	type ChordRef,
	type StepValue,
	type StrumPattern,
} from "@/lib/strumPatterns";
import {
	VALID_CELL_COUNTS,
	isCompound,
	normalizeMeter,
	type Meter,
} from "@/lib/strumMeter";
import {
	chordVoicingToVexChords,
	type ChordVoicing,
	type VexChordDef,
} from "@/lib/chordVoicingToVexChords";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";

/** Max cells a single beat may hold (quarter / eighth / triplet / sixteenth). */
/**
 * Cells one beat can hold. Six, not four, because a compound beat divides into
 * three eighths and each of those halves again — the finest division 6/8 asks
 * for. Which counts are actually offered is a question of meter, not of this
 * cap: see `allowedCellsPerBeat` in strumMeter.ts.
 */
export const MAX_CELLS_PER_BEAT = 6;

/**
 * The single read path for every pattern consumer: a pattern is one chordless
 * bar. Multi-bar, chord-carrying sequences are `ChordProgression`s, which are
 * already stored as `Bar[]` and need no lifting.
 */
export function toBars(pattern: StrumPattern): Bar[] {
	return [{ beats: normalizeBeats(pattern.beats), chord: null }];
}

/**
 * Step values written by earlier versions of the app, and what they mean now.
 *
 * `DG`/`UG` were ghost strokes stored beside the struck cells; they are drawn
 * from the struck cells instead (`ghostedBeats` in strumGridLayout.ts), so a
 * stored one is simply a cell nobody struck. `D3`/`U3` marked a triplet before
 * `meter` existed to say so, and are ordinary strokes.
 */
const RETIRED_STEPS: Record<string, StepValue> = {
	DG: "",
	UG: "",
	// The grid's pure padding column, which had no business being stored either.
	G: "",
	D3: "D",
	U3: "U",
};

/** One cell, read from storage where anything could be in it. */
export function normalizeStep(raw: unknown): StepValue {
	if (raw === "D" || raw === "U" || raw === "X" || raw === "") return raw;
	if (typeof raw === "string" && raw in RETIRED_STEPS) return RETIRED_STEPS[raw];
	return "";
}

/**
 * The boundary every stored rhythm crosses on its way in: rows written before
 * ghosts became a drawing rather than a value keep working, and nothing
 * downstream has to know the retired states ever existed.
 */
export function normalizeBeats(beats: readonly (readonly unknown[])[]): Beat[] {
	return beats.map((beat) => beat.map(normalizeStep));
}

/** The same, for the `Bar[]` a chord sequence is stored as. Chords pass through. */
export function normalizeBars(bars: readonly Bar[]): Bar[] {
	return bars.map((bar) => ({ ...bar, beats: normalizeBeats(bar.beats) }));
}

/**
 * The name a bar carries with no chord behind it: a word the player typed that
 * the library has nothing for, kept as written.
 *
 * The one reader of `Bar.unknownChord`, so "a chord was picked, the placeholder
 * is gone" is decided in a single place rather than re-derived at every call
 * site. Null means an ordinary bar — chorded, or plainly chordless.
 */
export function barPlaceholder(bar: Bar): string | null {
	if (bar.chord) return null;
	const label = bar.unknownChord?.trim();
	return label ? label : null;
}

/**
 * Coerce anything that claims to be a tempo into a playable one: rounded and
 * clamped to the fader bounds, falling back to the default for a missing or
 * non-finite value (a legacy row, a null column, a blank editor field).
 */
export function normalizeBpm(raw: unknown): number {
	if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_STRUM_BPM;
	return Math.min(STRUM_BPM_MAX, Math.max(STRUM_BPM_MIN, Math.round(raw)));
}

/** The tempo a pattern loads at — its own BPM, or the default when it has none. */
export function patternBpm(pattern: StrumPattern): number {
	return normalizeBpm(pattern.bpm);
}

/**
 * The pattern's time signature, defaulted for every row written before meters
 * existed. The one reader of `pattern.meter`, so the fallback cannot drift.
 */
export function patternMeter(pattern: StrumPattern): Meter {
	return normalizeMeter(pattern.meter);
}

/**
 * A player's own patterns, newest first — the order the library lists them in.
 *
 * Newest first because the pattern someone is working on is the one they just
 * made: a list that grows downwards buries it deeper with every save.
 *
 * A pattern with no creation time predates the stamp itself, so it sinks below
 * everything stamped and keeps the order it was stored in against its equally
 * unstamped neighbours — `sort` is stable, which is what makes that work.
 */
export function sortPatternsByNewest(patterns: readonly StrumPattern[]): StrumPattern[] {
	const at = (pattern: StrumPattern): number => {
		const parsed = pattern.createdAt ? Date.parse(pattern.createdAt) : NaN;
		return Number.isNaN(parsed) ? -Infinity : parsed;
	};
	return [...patterns].sort((a, b) => at(b) - at(a));
}

/**
 * The tempo range worth offering in a meter.
 *
 * BPM counts the beat, and a compound beat is a dotted quarter — so the same
 * number is a much faster pulse in 6/8 than in 4/4. The simple-meter ceiling of
 * 220 would be 22 eighth notes a second in 6/8, which is not a tempo anyone
 * strums at; a compound meter tops out far lower.
 */
export function bpmRangeForMeter(meter: Meter): { min: number; max: number } {
	return isCompound(meter)
		? { min: STRUM_BPM_MIN, max: COMPOUND_BPM_MAX }
		: { min: STRUM_BPM_MIN, max: STRUM_BPM_MAX };
}

/** Fast jig territory; well past any strummed 6/8. */
const COMPOUND_BPM_MAX = 140;

export function clampBpmToMeter(bpm: number, meter: Meter): number {
	const { min, max } = bpmRangeForMeter(meter);
	return Math.min(max, Math.max(min, normalizeBpm(bpm)));
}

/**
 * Carry a tempo across a meter change so the music does not appear to leap.
 *
 * Read literally, 80 in 4/4 and 80 in 6/8 are different speeds: the beat is a
 * quarter in one and a dotted quarter in the other, so the eighth notes run 1.5x
 * quicker and the bar goes by twice as fast. Rescaling by 2/3 (or 3/2 coming
 * back) holds the *eighth note* still, which is what "the same speed" means to
 * the player. 80 in 4/4 becomes about 53 in 6/8.
 *
 * Returns an unrounded tempo; callers round and clamp.
 */
export function rescaleBpmForMeter(bpm: number, from: Meter, to: Meter): number {
	if (isCompound(from) === isCompound(to)) return bpm;
	return isCompound(to) ? (bpm * 2) / 3 : (bpm * 3) / 2;
}

/**
 * Flatten bars back into a pattern's `beats`. Only the first bar survives —
 * a progression edited down to its rhythm is the pattern it extends.
 */
export function barsToLegacyBeats(bars: Bar[]): Beat[] {
	return bars[0]?.beats ?? [];
}

export interface BarsValidationResult {
	ok: boolean;
	errors: string[];
}

/**
 * Reject malformed bars. This is the shape the AI generation endpoint will
 * validate its output against, so failures are reported as a list rather than
 * thrown — a caller wants every problem at once, not just the first.
 */
export function validateBars(bars: unknown): BarsValidationResult {
	const errors: string[] = [];

	if (!Array.isArray(bars)) {
		return { ok: false, errors: ["bars must be an array"] };
	}
	if (bars.length === 0) {
		return { ok: false, errors: ["bars must contain at least one bar"] };
	}

	bars.forEach((bar, barIndex) => {
		if (typeof bar !== "object" || bar === null) {
			errors.push(`bar ${barIndex}: must be an object`);
			return;
		}
		const { beats, chord, unknownChord } = bar as Partial<Bar>;

		if (!Array.isArray(beats)) {
			errors.push(`bar ${barIndex}: beats must be an array`);
		} else if (beats.length === 0) {
			errors.push(`bar ${barIndex}: must contain at least one beat`);
		} else {
			beats.forEach((beat, beatIndex) => {
				if (!Array.isArray(beat)) {
					errors.push(`bar ${barIndex} beat ${beatIndex}: must be an array of cells`);
					return;
				}
				if (beat.length === 0) {
					errors.push(`bar ${barIndex} beat ${beatIndex}: must contain at least one cell`);
				}
				// A count, not a cap: no meter divides a beat five ways, so five
				// cells is corruption rather than an unusually fine subdivision.
				if (beat.length > 0 && !VALID_CELL_COUNTS.includes(beat.length)) {
					errors.push(
						`bar ${barIndex} beat ${beatIndex}: has ${beat.length} cells, allowed are ${VALID_CELL_COUNTS.join(", ")}`,
					);
				}
			});
		}

		// Read back from storage, where anything could be in it. A blank one is
		// not a placeholder either: it would render as a nameless red bar.
		if (unknownChord !== undefined && (typeof unknownChord !== "string" || unknownChord.trim() === "")) {
			errors.push(`bar ${barIndex}: unknownChord must be a non-empty string when present`);
		}

		if (chord !== null && chord !== undefined) {
			if (typeof chord !== "object") {
				errors.push(`bar ${barIndex}: chord must be an object or null`);
			} else {
				if (typeof chord.root !== "string" || chord.root === "") {
					errors.push(`bar ${barIndex}: chord.root must be a non-empty string`);
				}
				if (typeof chord.suffix !== "string" || chord.suffix === "") {
					errors.push(`bar ${barIndex}: chord.suffix must be a non-empty string`);
				}
			}
		}
	});

	return { ok: errors.length === 0, errors };
}

/**
 * Pick the voicing a `ChordRef` points at: the pinned one when `voicingId`
 * still resolves, otherwise the standard voicing for the chord.
 */
export function selectRefVoicing(
	ref: ChordRef,
	voicings: ChordVoicing[],
): ChordVoicing | null {
	if (ref.voicingId) {
		const pinned = voicings.find((v) => v.id === ref.voicingId);
		if (pinned) return pinned;
	}
	return selectStandardVoicing(voicings);
}

/**
 * Pure half of the `ChordRef` → MIDI boundary: given the voicings fetched for a
 * chord, produce the pitches the audio engine plays. Returns null when the bar
 * has no chord or the chord has no usable voicing.
 */
export function chordRefToMidi(
	ref: ChordRef | null,
	voicings: ChordVoicing[],
): number[] | null {
	if (!ref) return null;
	const voicing = selectRefVoicing(ref, voicings);
	if (!voicing) return null;
	const pitches = chordVoicingToMidi(voicing).map((n) => n.midi);
	return pitches.length > 0 ? pitches : null;
}

/**
 * The other half of the same boundary, for the eye rather than the ear: the
 * fretboard shape a bar's chord draws. Picks the same voicing the engine
 * sounds — the pinned one if it still resolves, the standard shape otherwise —
 * so the diagram never contradicts what is playing.
 */
export function chordRefToDiagram(
	ref: ChordRef | null,
	voicings: ChordVoicing[],
): VexChordDef | null {
	if (!ref) return null;
	const voicing = selectRefVoicing(ref, voicings);
	return voicing ? chordVoicingToVexChords(voicing) : null;
}

/**
 * Fetches the voicings stored for a chord identity. Injected so the resolution
 * boundary stays testable without a database.
 */
export type VoicingLookup = (ref: ChordRef) => Promise<ChordVoicing[] | null>;

/**
 * Resolve every bar's chord to MIDI pitches, index-aligned with `bars`.
 * Each distinct chord identity is fetched once, so a `C–G–C–G` progression
 * costs two lookups, not four.
 *
 * Three outcomes per bar, and this is the one place that tells them apart:
 * pitches for a chord, `null` for a chordless bar (the engine sounds its own
 * default voicing), and `[]` for a bar holding a chord the library does not
 * have — that one sounds nothing at all.
 */
export async function resolveBarChords(
	bars: Bar[],
	lookup: VoicingLookup,
): Promise<(number[] | null)[]> {
	const cache = new Map<string, Promise<ChordVoicing[] | null>>();

	return Promise.all(
		bars.map(async (bar) => {
			const ref = bar.chord;
			// A name with no chord behind it is silence, not the default voicing.
			if (!ref) return barPlaceholder(bar) ? [] : null;
			const key = `${ref.root} ${ref.suffix}`;
			let voicings = cache.get(key);
			if (!voicings) {
				voicings = lookup(ref);
				cache.set(key, voicings);
			}
			return chordRefToMidi(ref, (await voicings) ?? []);
		}),
	);
}

/**
 * Raise a resolved pitch table by a capo. The chords name the shapes the player
 * fingers, so a capo at fret N sounds every string N semitones higher.
 *
 * A bar with no chord of its own sounds the engine's default voicing, which the
 * capo raises too — `fallback` is that voicing, transposed in its place. At capo
 * 0 the table is returned untouched, nulls included, so the engine keeps using
 * its own default.
 *
 * A silent bar's empty table is carried through as it is: a capo on silence is
 * silence, and `??` leaves an empty array alone where it would replace a null.
 */
export function transposeBarPitches(
	pitches: readonly (readonly number[] | null)[],
	capo: number,
	fallback: readonly number[],
): (number[] | null)[] {
	if (capo === 0) return pitches.map((bar) => (bar ? [...bar] : null));
	return pitches.map((bar) => (bar ?? fallback).map((midi) => midi + capo));
}
