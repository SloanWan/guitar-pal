/** What a library lists: everything, or the player's favourites. */
export type LibraryFilter = "all" | "favs";

/** The filter's choices, in the order the segmented control shows them. */
export const LIBRARY_FILTERS: readonly { value: LibraryFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "favs", label: "Favourites" },
];

/** Anything a library can list: Strum's patterns, Tab's tabs. */
export interface LibraryItem {
	id: string;
	name: string;
}

/** The two groups a library lists, each folding away on its own. */
export type LibraryGroup = "mine" | "presets";

/**
 * What the library shows: the player's own (newest first, as they are held) and the
 * presets, each narrowed to favourites under that filter and by a query on the name,
 * ignoring case and surrounding space.
 */
export function libraryGroups<T extends LibraryItem>(
	custom: readonly T[],
	presets: readonly T[],
	favouriteIds: readonly string[],
	filter: LibraryFilter,
	query: string,
): Record<LibraryGroup, T[]> {
	const wanted = query.trim().toLowerCase();
	const shown = (p: T) =>
		(filter !== "favs" || favouriteIds.includes(p.id)) && (wanted === "" || p.name.toLowerCase().includes(wanted));
	return { mine: custom.filter(shown), presets: presets.filter(shown) };
}

/** How a library names what it holds, for its empty groups. */
export interface LibraryWords {
	/** "pattern", "tab". */
	noun: string;
	/** What the player's own group says while it is empty: "Patterns you make or save show up here." */
	mine: string;
}

/** What an empty group says, by why it is empty. */
export function libraryEmptyText(group: LibraryGroup, filter: LibraryFilter, query: string, words: LibraryWords): string {
	if (query.trim() !== "") return `No ${words.noun} matches.`;
	if (filter === "favs") {
		return group === "mine"
			? `Tap the pick beside one of your ${words.noun}s to keep it here.`
			: "Tap the pick beside a preset to keep it here.";
	}
	return group === "mine" ? words.mine : "No presets.";
}
