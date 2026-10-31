"use client";

import { PanelRightClose, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";
import LibraryBrowser from "@/components/library/LibraryBrowser";
import PatternRow from "./PatternRow";

const LIBRARY_WORDS = { noun: "pattern", mine: "Patterns you make or save show up here." };

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

/** Every pattern there is to play: the player's own and the presets, to filter and search. */
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
						className="st-icon lib-fold"
						onClick={onFold}
						aria-label="Fold the pattern list"
						title="Fold the pattern list"
						aria-expanded
					>
						<PanelRightClose aria-hidden />
					</button>
				)}
			</div>
			<LibraryBrowser
				custom={customPatterns}
				presets={PRESET_STRUM_PATTERNS}
				favouriteIds={favouriteIds}
				loading={loading}
				words={LIBRARY_WORDS}
				storageKey="strumLibrary"
				renderRow={(pattern, i) => (
					<PatternRow
						key={pattern.id}
						index={i}
						pattern={pattern}
						selected={pattern.id === selectedId}
						favourite={favouriteIds.includes(pattern.id)}
						onSelect={() => onSelect(pattern)}
						onToggleFavourite={() => onToggleFavourite(pattern.id)}
					/>
				)}
			/>
		</>
	);
}
