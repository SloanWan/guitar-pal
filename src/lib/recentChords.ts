import type { ChordRef } from "./strumPatterns";

/** Where this device keeps the chords last picked from a chord search. */
export const RECENT_CHORDS_KEY = "guitarpal:recentChords";
/** How many are kept: one short row of chips. */
export const RECENT_CHORDS_LIMIT = 6;

/** The same chord, whatever shape it is pinned to. */
export function sameChord(a: ChordRef, b: ChordRef): boolean {
	return a.root === b.root && a.suffix === b.suffix;
}

/** `ref` first, an older entry for the same chord dropped, at most `limit` kept. */
export function pushRecentChord(list: readonly ChordRef[], ref: ChordRef, limit = RECENT_CHORDS_LIMIT): ChordRef[] {
	return [{ root: ref.root, suffix: ref.suffix, voicingId: ref.voicingId ?? null }, ...list.filter((r) => !sameChord(r, ref))].slice(
		0,
		limit,
	);
}

/** The stored list, its malformed entries left out; null when it is not a list at all. */
export function parseRecentChords(raw: string): ChordRef[] | null {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!Array.isArray(value)) return null;
	return value.flatMap((entry: unknown): ChordRef[] => {
		if (typeof entry !== "object" || entry === null) return [];
		const { root, suffix, voicingId } = entry as Record<string, unknown>;
		if (typeof root !== "string" || typeof suffix !== "string" || root === "") return [];
		return [{ root, suffix, voicingId: typeof voicingId === "string" ? voicingId : null }];
	});
}
