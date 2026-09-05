import {
	DEFAULT_STRUM_BPM,
	STRUM_BPM_MAX,
	STRUM_BPM_MIN,
	type Bar,
	type Beat,
	type ChordRef,
	type StrumPattern,
} from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";

/** Max cells a single beat may hold (quarter / eighth / triplet / sixteenth). */
export const MAX_CELLS_PER_BEAT = 4;

/**
 * The single read path for every pattern consumer: a pattern is one chordless
 * bar. Multi-bar, chord-carrying sequences are `ChordProgression`s, which are
 * already stored as `Bar[]` and need no lifting.
 */
export function toBars(pattern: StrumPattern): Bar[] {
	return [{ beats: pattern.beats, chord: null }];
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
		const { beats, chord } = bar as Partial<Bar>;

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
				if (beat.length > MAX_CELLS_PER_BEAT) {
					errors.push(
						`bar ${barIndex} beat ${beatIndex}: has ${beat.length} cells, max is ${MAX_CELLS_PER_BEAT}`,
					);
				}
			});
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
 * Fetches the voicings stored for a chord identity. Injected so the resolution
 * boundary stays testable without a database.
 */
export type VoicingLookup = (ref: ChordRef) => Promise<ChordVoicing[] | null>;

/**
 * Resolve every bar's chord to MIDI pitches, index-aligned with `bars`.
 * Each distinct chord identity is fetched once, so a `C–G–C–G` progression
 * costs two lookups, not four.
 */
export async function resolveBarChords(
	bars: Bar[],
	lookup: VoicingLookup,
): Promise<(number[] | null)[]> {
	const cache = new Map<string, Promise<ChordVoicing[] | null>>();

	return Promise.all(
		bars.map(async (bar) => {
			const ref = bar.chord;
			if (!ref) return null;
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
 */
export function transposeBarPitches(
	pitches: readonly (readonly number[] | null)[],
	capo: number,
	fallback: readonly number[],
): (number[] | null)[] {
	if (capo === 0) return pitches.map((bar) => (bar ? [...bar] : null));
	return pitches.map((bar) => (bar ?? fallback).map((midi) => midi + capo));
}
