"use client";

import { useState } from "react";
import { PanelRightClose, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SearchInput } from "@/components/ui/input";
import type { StrumPattern } from "@/lib/strumPatterns";
import { libraryEmptyText, libraryPatterns, type LibraryFilter } from "@/lib/strumLibrary";
import PatternRow from "./PatternRow";
import "./library.css";

const FILTERS: { value: LibraryFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "mine", label: "Mine" },
	{ value: "favs", label: "Favourites" },
];

interface Props {
	customPatterns: StrumPattern[];
	loading: boolean;
	selectedId: string | null;
	favouriteIds: string[];
	onSelect: (pattern: StrumPattern) => void;
	onToggleFavourite: (id: string) => void;
	onNew: () => void;
	/** Beside the stage it has a heading and folds away; in a sheet the sheet has both. */
	variant: "aside" | "sheet";
	onFold?: () => void;
}

/** Every pattern there is to play: filters, a search, and the list. */
export default function PatternLibrary({
	customPatterns,
	loading,
	selectedId,
	favouriteIds,
	onSelect,
	onToggleFavourite,
	onNew,
	variant,
	onFold,
}: Props) {
	const [filter, setFilter] = useState<LibraryFilter>("all");
	const [query, setQuery] = useState("");
	// Rows pop in after a filter change, not on first mount and not while typing a search.
	const [pop, setPop] = useState(false);
	const visible = libraryPatterns(customPatterns, favouriteIds, filter, query);

	return (
		<>
			<div className="flex items-center gap-1.5">
				{variant === "aside" && <h2 className="m-0 flex-1 text-base font-bold">Patterns</h2>}
				<Button variant="secondary" size="xs" onClick={onNew} className={variant === "sheet" ? "ml-auto" : undefined}>
					<Plus aria-hidden />
					New
				</Button>
				{onFold && (
					<button
						type="button"
						className="st-icon st-lib-fold"
						onClick={onFold}
						aria-label="Fold the pattern list"
						title="Fold the pattern list"
						aria-expanded
					>
						<PanelRightClose aria-hidden />
					</button>
				)}
			</div>
			<Segmented
				options={FILTERS}
				value={filter}
				onChange={(next) => {
					setFilter(next);
					setPop(true);
				}}
				label="Show"
				full
				className="st-lib-filter"
			/>
			<SearchInput
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setPop(false);
				}}
				placeholder="Search patterns"
				aria-label="Search patterns"
			/>
			{/* re-keyed on the filter so a new choice mounts fresh rows and replays the pop */}
			<div key={filter} className="st-lib-list" data-pop={pop ? "" : undefined}>
				{visible.map((pattern, i) => (
					<PatternRow
						key={pattern.id}
						index={i}
						pattern={pattern}
						selected={pattern.id === selectedId}
						favourite={favouriteIds.includes(pattern.id)}
						onSelect={() => onSelect(pattern)}
						onToggleFavourite={() => onToggleFavourite(pattern.id)}
					/>
				))}
				{loading && filter !== "all" ? (
					<p className="st-lab m-2">Loading your patterns…</p>
				) : visible.length === 0 ? (
					<p className="st-lab m-2">{libraryEmptyText(filter, query)}</p>
				) : null}
			</div>
		</>
	);
}
