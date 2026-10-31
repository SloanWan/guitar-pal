"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { SearchInput } from "@/components/ui/input";
import { FLAG_CODEC, useStoredState } from "@/components/useStoredState";
import {
	LIBRARY_FILTERS,
	libraryEmptyText,
	libraryGroups,
	type LibraryFilter,
	type LibraryGroup,
	type LibraryItem,
	type LibraryWords,
} from "@/lib/patternLibrary";
import "./library.css";

interface Props<T extends LibraryItem> {
	custom: readonly T[];
	presets: readonly T[];
	favouriteIds: readonly string[];
	/** The player's own are still loading. */
	loading: boolean;
	/** "tab": the search's placeholder, the groups' names and their empty lines. */
	words: LibraryWords;
	/** Where each group's folding is remembered: `${storageKey}MineFolded`, `${storageKey}PresetsFolded`. */
	storageKey: string;
	/** One row; `index` is its place in its group, for the pop-in stagger. */
	renderRow: (item: T, index: number) => ReactNode;
}

/**
 * A library's filter (All / Favourites), its search, and its list: the player's own
 * and the presets, each a group that folds away on its own and stays folded.
 */
export default function LibraryBrowser<T extends LibraryItem>({
	custom,
	presets,
	favouriteIds,
	loading,
	words,
	storageKey,
	renderRow,
}: Props<T>) {
	const [filter, setFilter] = useState<LibraryFilter>("all");
	const [query, setQuery] = useState("");
	// Rows pop in after a filter change, not on first mount and not while typing a search.
	const [pop, setPop] = useState(false);
	const [mineFolded, foldMine] = useStoredState(`${storageKey}MineFolded`, false, FLAG_CODEC);
	const [presetsFolded, foldPresets] = useStoredState(`${storageKey}PresetsFolded`, false, FLAG_CODEC);
	const groups = libraryGroups(custom, presets, favouriteIds, filter, query);

	function group(id: LibraryGroup, title: string, folded: boolean, fold: (folded: boolean) => void) {
		const items = groups[id];
		const empty = id === "mine" && loading ? `Loading your ${words.noun}s…` : libraryEmptyText(id, filter, query, words);
		return (
			<section className="lib-group" aria-label={title}>
				<button type="button" className="lib-group-head" aria-expanded={!folded} onClick={() => fold(!folded)}>
					<ChevronDown aria-hidden />
					<span className="lib-group-title">{title}</span>
					<span className="pb-num lib-group-count">{items.length}</span>
				</button>
				{!folded &&
					(items.length > 0 ? items.map((item, i) => renderRow(item, i)) : <p className="lib-group-empty">{empty}</p>)}
			</section>
		);
	}

	return (
		<>
			<Segmented
				options={LIBRARY_FILTERS}
				value={filter}
				onChange={(next) => {
					setFilter(next);
					setPop(true);
				}}
				label="Show"
				full
				className="lib-filter"
			/>
			<SearchInput
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setPop(false);
				}}
				placeholder={`Search ${words.noun}s`}
				aria-label={`Search ${words.noun}s`}
			/>
			{/* re-keyed on the filter so a new choice mounts fresh rows and replays the pop */}
			<div key={filter} className="lib-list" data-pop={pop ? "" : undefined}>
				{group("mine", `My ${words.noun}s`, mineFolded, foldMine)}
				{group("presets", "Presets", presetsFolded, foldPresets)}
			</div>
		</>
	);
}
