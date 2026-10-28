import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";

/** What the library lists: everything, the player's own, or their favourites. */
export type LibraryFilter = "all" | "mine" | "favs";

/**
 * The patterns the library shows, in the order it shows them: the player's own
 * first (newest first, as they are held), then the presets. A query narrows by
 * name, ignoring case and surrounding space.
 */
export function libraryPatterns(
	custom: readonly StrumPattern[],
	favouriteIds: readonly string[],
	filter: LibraryFilter,
	query: string,
): StrumPattern[] {
	const pool = filter === "mine" ? [...custom] : [...custom, ...PRESET_STRUM_PATTERNS];
	const wanted = query.trim().toLowerCase();
	return pool.filter(
		(p) =>
			(filter !== "favs" || favouriteIds.includes(p.id)) &&
			(wanted === "" || p.name.toLowerCase().includes(wanted)),
	);
}

/** What an empty list says, by why it is empty. */
export function libraryEmptyText(filter: LibraryFilter, query: string): string {
	if (query.trim() !== "") return "No pattern matches.";
	if (filter === "favs") return "Tap the pick beside a pattern to keep it here.";
	if (filter === "mine") return "Patterns you make or save show up here.";
	return "No patterns yet.";
}
