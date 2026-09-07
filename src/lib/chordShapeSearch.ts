import { MUTED, voicingToChordShape, type ShapeFret } from "@/lib/chordShape";
import { getSuffixCategory, isSlashChord } from "@/lib/chordSuffixes";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { TAB_STRING_COUNT } from "@/lib/chordTabSequence";
import type { UserChordVoicing } from "@/lib/userChordVoicings";

/**
 * Finding a chord by the shape of the hand rather than by its name.
 *
 * Tabs frequently give the grip and never say what it is called. The player can
 * read the frets straight off the page, so that is what this searches on: the
 * six frets, compared against every voicing in the library.
 *
 * Comparison is on frets on the neck, never on the stored `frets` string — that
 * one is written relative to a diagram window, so the same grip stored in two
 * windows would compare as two different shapes.
 */

/** A chord and the shapes it is played with. */
export interface ShapeSearchChord {
	root: string;
	suffix: string;
	chord_voicings: ChordVoicing[];
	/**
	 * True for a chord only the player has. The library has no page for one of
	 * those, so a row that answers with it leads somewhere else entirely.
	 */
	mine?: boolean;
}

/**
 * The library, plus the chords only the player has.
 *
 * Searching a grip has to find a chord they wrote themselves — otherwise the
 * shape they invented last week comes back as "not in the library", inviting
 * them to invent it a second time. A shape written for a chord the library
 * already carries joins that chord's own list rather than starting a rival
 * entry: it is another way to play a C, not another C.
 */
export function withUserChords(
	library: readonly ShapeSearchChord[],
	user: readonly UserChordVoicing[],
): ShapeSearchChord[] {
	if (user.length === 0) return [...library];

	const merged = new Map<string, ShapeSearchChord>();
	for (const chord of library) {
		merged.set(`${chord.root} ${chord.suffix}`, chord);
	}

	for (const voicing of user) {
		const key = `${voicing.root} ${voicing.suffix}`;
		const existing = merged.get(key);
		if (existing) {
			// Copied, never appended in place: the library list is shared and cached.
			merged.set(key, {
				...existing,
				chord_voicings: [...existing.chord_voicings, voicing],
			});
			continue;
		}
		merged.set(key, {
			root: voicing.root,
			suffix: voicing.suffix,
			chord_voicings: [voicing],
			mine: true,
		});
	}

	return [...merged.values()];
}

/** How a stored shape answers the one that was typed. */
export type ShapeMatchKind =
	/** The same frets. */
	| { kind: "exact" }
	/** Nearly the same: `differences` strings are fretted elsewhere. */
	| { kind: "near"; differences: number }
	/** The same grip, played `semitones` further up (or down) the neck. */
	| { kind: "transposed"; semitones: number };

export interface ShapeMatch {
	root: string;
	suffix: string;
	/** Display category, the same one the name search reports. */
	category: string;
	voicing: ChordVoicing;
	/** The voicing's frets on the neck, low E first. */
	frets: ShapeFret[];
	match: ShapeMatchKind;
	/** A chord only the player has, which is opened rather than browsed. */
	mine: boolean;
}

/** How far from exact a match may be and still be worth showing. */
const MAX_DIFFERENCES = 2;

/** A stored voicing as frets on the neck, low E first. */
export function voicingFrets(voicing: ChordVoicing): ShapeFret[] {
	return voicingToChordShape(voicing).frets;
}

function sameFret(a: ShapeFret, b: ShapeFret): boolean {
	return a === b;
}

/**
 * Whether two shapes are one grip played in two places.
 *
 * Every sounding string has to move by the same number of semitones, open ones
 * included — a barre chord is the open shape with a finger where the nut was, so
 * E (022100) and F (133211) are the same grip and have to read as one. Muted
 * strings stay muted: a string the hand is not sounding does not move with it.
 */
function transposition(a: readonly ShapeFret[], b: readonly ShapeFret[]): number | null {
	let delta: number | null = null;
	for (let i = 0; i < TAB_STRING_COUNT; i++) {
		const left = a[i];
		const right = b[i];
		if (left === MUTED || right === MUTED) {
			if (!sameFret(left, right)) return null;
			continue;
		}
		const step = right - left;
		if (delta === null) delta = step;
		else if (step !== delta) return null;
	}
	return delta === null || delta === 0 ? null : delta;
}

/**
 * How a stored shape answers a typed one, or null when it does not.
 *
 * Exact first, then near misses, and a transposed grip last: a shape one string
 * off is very likely the chord in front of the player, while the same grip
 * elsewhere on the neck is a different chord that happens to be held the same
 * way — useful to know, but not what was being looked up.
 */
export function shapeMatch(
	target: readonly ShapeFret[],
	candidate: readonly ShapeFret[],
): ShapeMatchKind | null {
	let differences = 0;
	for (let i = 0; i < TAB_STRING_COUNT; i++) {
		if (!sameFret(target[i], candidate[i])) differences++;
	}
	if (differences === 0) return { kind: "exact" };

	const semitones = transposition(target, candidate);
	if (differences <= MAX_DIFFERENCES) return { kind: "near", differences };
	return semitones === null ? null : { kind: "transposed", semitones };
}

/** Lower sorts first: exact, then by how many strings differ, then transposed. */
function matchRank(match: ShapeMatchKind): number {
	if (match.kind === "exact") return 0;
	if (match.kind === "near") return match.differences;
	return MAX_DIFFERENCES + 1 + Math.abs(match.semitones);
}

function categoryOf(suffix: string): string {
	return isSlashChord(suffix) ? "Slash Chords" : (getSuffixCategory(suffix) ?? "Other");
}

const DEFAULT_LIMIT = 8;

/**
 * The chords played with a shape like this one, best first.
 *
 * One row per chord, not per voicing: a chord stored with four shapes of which
 * two are near misses would otherwise fill the list with itself. The shape that
 * answered best is the one shown.
 */
export function searchChordsByShape(
	chords: readonly ShapeSearchChord[],
	target: readonly ShapeFret[],
	limit: number = DEFAULT_LIMIT,
): ShapeMatch[] {
	const best = new Map<string, ShapeMatch>();

	for (const chord of chords) {
		for (const voicing of chord.chord_voicings ?? []) {
			const frets = voicingFrets(voicing);
			const match = shapeMatch(target, frets);
			if (!match) continue;

			const key = `${chord.root} ${chord.suffix}`;
			const existing = best.get(key);
			if (existing && matchRank(existing.match) <= matchRank(match)) continue;
			best.set(key, {
				root: chord.root,
				suffix: chord.suffix,
				category: categoryOf(chord.suffix),
				voicing,
				frets,
				match,
				mine: chord.mine === true,
			});
		}
	}

	return [...best.values()]
		.sort(
			(a, b) =>
				matchRank(a.match) - matchRank(b.match) ||
				// Between two equally good answers, the player's own comes first: a
				// grip they wrote down themselves is the one they are looking for.
				Number(b.mine) - Number(a.mine),
		)
		.slice(0, limit);
}
