/**
 * The chords a player keeps (#387), by name: `root` + `suffix`, never a voicing,
 * so a favourite survives its shapes changing and an unnamed chord can be kept
 * like any other. Pure helpers; the reads and writes are in `favouriteChordStore`.
 */

export interface FavouriteChord {
	readonly root: string;
	readonly suffix: string;
}

export function favouriteKey(root: string, suffix: string): string {
	return `${root}|${suffix}`;
}

export function isFavourite(favourites: readonly FavouriteChord[], root: string, suffix: string): boolean {
	return favourites.some((f) => f.root === root && f.suffix === suffix);
}

/** The list with the chord taken off when it was on, else added at the end (newest last). */
export function toggleFavourite(favourites: readonly FavouriteChord[], root: string, suffix: string): FavouriteChord[] {
	return isFavourite(favourites, root, suffix)
		? favourites.filter((f) => f.root !== root || f.suffix !== suffix)
		: [...favourites, { root, suffix }];
}

/**
 * Favourites read back from storage or the account: anything that is not a
 * non-empty root and suffix is dropped, and a chord kept twice is kept once.
 */
export function readFavourites(value: unknown): FavouriteChord[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: FavouriteChord[] = [];
	for (const item of value) {
		if (typeof item !== "object" || item === null) continue;
		const { root, suffix } = item as Record<string, unknown>;
		if (typeof root !== "string" || typeof suffix !== "string" || root === "" || suffix === "") continue;
		const key = favouriteKey(root, suffix);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ root, suffix });
	}
	return out;
}

/** The account's favourites, then any of this device's it lacks: what a guest kept joins on signing in. */
export function mergeFavourites(account: readonly FavouriteChord[], local: readonly FavouriteChord[]): FavouriteChord[] {
	return readFavourites([...account, ...local]);
}
