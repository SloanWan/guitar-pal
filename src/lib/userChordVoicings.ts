import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_SHAPE_WINDOW, MAX_SHAPE_START_FRET } from "@/lib/chordShape";

/**
 * Chord shapes the player wrote themselves.
 *
 * A user shape is a `ChordVoicing` like any other — that is the point. Pitch and
 * diagram both come from the frets, never from the name, so a borrowed shape
 * sounds and draws correctly whatever it is called, and `selectRefVoicing`,
 * `chordVoicingToMidi` and `chordRefToDiagram` need no change at all.
 *
 * What it also carries is the chord identity it hangs off, so `ChordRef` can
 * stay `{root, suffix, voicingId}`. A free-standing named shape with no root or
 * suffix would need a new identity kind in `ChordRef`, and every consumer —
 * abbreviations, progression names, the search index, `validateBars` — would
 * have to learn it, for a gain the `label` field already provides.
 */

export interface UserChordVoicing extends ChordVoicing {
	/** The chord this shape is functioning as. */
	root: string;
	suffix: string;
}

/**
 * Marks an id as the player's own.
 *
 * A `ChordRef` stores only a `voicingId`, so anything holding one later has to
 * be able to tell where it came from without carrying extra state alongside it.
 * The prefix makes that a pure question about the id itself.
 */
export const USER_VOICING_ID_PREFIX = "u:";

export function isUserVoicingId(id: string): boolean {
	return id.startsWith(USER_VOICING_ID_PREFIX);
}

export function userVoicingId(rawId: string): string {
	return isUserVoicingId(rawId) ? rawId : `${USER_VOICING_ID_PREFIX}${rawId}`;
}

/** The database id behind a prefixed one. */
export function rawUserVoicingId(id: string): string {
	return isUserVoicingId(id) ? id.slice(USER_VOICING_ID_PREFIX.length) : id;
}

export function voicingsMatch(voicing: UserChordVoicing, root: string, suffix: string): boolean {
	return voicing.root === root && voicing.suffix === suffix;
}

/**
 * The voicings offered for a chord: the library's, then the player's own.
 *
 * The player's come last so the standard voicing a chord loads with is still the
 * library's — a shape written for one song should not silently become what every
 * bar of that chord sounds like.
 */
export function mergeVoicings(
	library: readonly ChordVoicing[],
	user: readonly UserChordVoicing[],
	root: string,
	suffix: string,
): ChordVoicing[] {
	return [...library, ...user.filter((v) => voicingsMatch(v, root, suffix))];
}

/**
 * Whether two rows describe the same shape.
 *
 * The shape is the frets, the fingering, where the window sits and what is
 * barred — everything that decides how it sounds and how it is drawn. The name
 * is not part of it: the same grip written twice under two names is still one
 * grip, and storing it twice would leave the player choosing between identical
 * diagrams.
 */
export function sameShape(a: ChordVoicing, b: ChordVoicing): boolean {
	return (
		a.frets === b.frets &&
		a.fingers === b.fingers &&
		a.start_fret === b.start_fret &&
		a.barre_fret === b.barre_fret &&
		a.capo === b.capo
	);
}

/**
 * The row to actually store for a shape the player just wrote.
 *
 * Saving mints a fresh id every time, so writing the same grip twice — which
 * happens simply by opening the editor and pressing apply again — would file it
 * twice. When the shape is already on record, its own row is reused and keeps
 * its id, so anything pinned to it stays pinned.
 *
 * A name on the incoming save is taken when the stored row has none: naming a
 * shape you already wrote should not require a second copy of it.
 */
export function dedupeUserVoicing(
	stored: readonly UserChordVoicing[],
	candidate: UserChordVoicing,
): UserChordVoicing {
	const existing = stored.find(
		(v) => voicingsMatch(v, candidate.root, candidate.suffix) && sameShape(v, candidate),
	);
	if (!existing) return candidate;
	return candidate.label !== null && existing.label === null
		? { ...existing, label: candidate.label }
		: existing;
}

/**
 * Wrap a library lookup so the player's own shapes are part of what it returns.
 *
 * A named function rather than an inline merge at each call site, because
 * forgetting the merge fails silently and in two places at once: the bar keeps
 * its `voicingId`, `selectRefVoicing` cannot find an id that is not in the list
 * it was handed, and the bar falls back to the library's standard voicing — so
 * the shape is drawn wrong *and* played wrong, with nothing raised anywhere.
 */
export function withUserVoicings(
	base: (root: string, suffix: string) => Promise<ChordVoicing[]>,
	user: readonly UserChordVoicing[],
): (ref: { root: string; suffix: string }) => Promise<ChordVoicing[]> {
	return async (ref) => mergeVoicings(await base(ref.root, ref.suffix), user, ref.root, ref.suffix);
}

/**
 * The searchable chord index, plus the chords the player's own shapes are filed
 * under.
 *
 * A shape written for a chord the library does not carry is the only record
 * that chord exists. Without this it stays unfindable: the player types the
 * name again next week, nothing matches, and they are asked to keep or skip a
 * chord they have already drawn. Identities the library already has are not
 * repeated — the library's spelling wins, since that is what everything else
 * indexes by.
 */
export function chordIndexWithUser(
	index: readonly ChordIndexEntry[],
	user: readonly UserChordVoicing[],
): ChordIndexEntry[] {
	const seen = new Set(index.map((entry) => `${entry.root} ${entry.suffix}`));
	const extra: ChordIndexEntry[] = [];
	for (const { root, suffix } of user) {
		const key = `${root} ${suffix}`;
		if (seen.has(key)) continue;
		seen.add(key);
		extra.push({ root, suffix });
	}
	return extra.length === 0 ? [...index] : [...index, ...extra];
}

/** The row shape of `user_chord_voicings`, as it comes back from the database. */
export interface UserVoicingRow {
	id: string;
	root: string;
	suffix: string;
	label: string | null;
	start_fret: number | null;
	barre_fret: number | null;
	capo: boolean | null;
	frets: string;
	fingers: string | null;
}

const FRETS_PATTERN = /^[x0-9]{6}$/;
const FINGERS_PATTERN = /^[0-4]{6}$/;

/**
 * Read a stored row, or reject it.
 *
 * Storage is untrusted whether it is a database row or a localStorage blob, and
 * a malformed shape is a silent wrong pitch rather than a crash — so a row that
 * does not parse is dropped rather than repaired into something plausible.
 */
export function rowToUserVoicing(row: UserVoicingRow): UserChordVoicing | null {
	if (typeof row.id !== "string" || row.id === "") return null;
	if (typeof row.root !== "string" || row.root === "") return null;
	if (typeof row.suffix !== "string" || row.suffix === "") return null;
	if (typeof row.frets !== "string" || !FRETS_PATTERN.test(row.frets)) return null;

	const fingers = typeof row.fingers === "string" && FINGERS_PATTERN.test(row.fingers)
		? row.fingers
		: "000000";
	const startFret = Number.isInteger(row.start_fret) ? (row.start_fret as number) : 1;
	if (startFret < 1 || startFret > MAX_SHAPE_START_FRET) return null;

	const barre = row.barre_fret;
	const barreFret =
		Number.isInteger(barre) && (barre as number) >= 1 && (barre as number) <= CHORD_SHAPE_WINDOW
			? (barre as number)
			: null;

	return {
		id: userVoicingId(row.id),
		root: row.root,
		suffix: row.suffix,
		label: typeof row.label === "string" && row.label.trim() !== "" ? row.label.trim() : null,
		start_fret: startFret,
		barre_fret: barreFret,
		capo: row.capo === true,
		frets: row.frets,
		fingers,
	};
}

/** The columns written back. Ids are stored bare; the prefix is a client concern. */
export function userVoicingColumns(
	voicing: UserChordVoicing,
	userId: string,
): UserVoicingRow & { user_id: string } {
	return {
		id: rawUserVoicingId(voicing.id),
		user_id: userId,
		root: voicing.root,
		suffix: voicing.suffix,
		label: voicing.label,
		start_fret: voicing.start_fret,
		barre_fret: voicing.barre_fret,
		capo: voicing.capo,
		frets: voicing.frets,
		fingers: voicing.fingers,
	};
}
