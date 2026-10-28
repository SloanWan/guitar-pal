"use client";

import { ClipboardPaste, PanelRightClose, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import LibraryBrowser from "@/components/library/LibraryBrowser";
import TabRow from "./TabRow";

const LIBRARY_WORDS = { noun: "tab", mine: "Tabs you make, paste or import show up here." };

interface Props {
	customPatterns: FingerpickPattern[];
	loading: boolean;
	selectedId: string;
	favouriteIds: string[];
	onSelect: (pattern: FingerpickPattern) => void;
	onToggleFavourite: (id: string) => void;
	onNew: () => void;
	onPaste: () => void;
	/** Beside the stage it has a heading and folds away; in a sheet the sheet has both. */
	variant: "aside" | "sheet";
	onFold?: () => void;
}

/** Every tab there is to play: the player's own and the presets, to filter and search. */
export default function TabLibrary({
	customPatterns,
	loading,
	selectedId,
	favouriteIds,
	onSelect,
	onToggleFavourite,
	onNew,
	onPaste,
	variant,
	onFold,
}: Props) {
	return (
		<>
			<div className="flex items-center gap-1.5">
				{variant === "aside" && <h2 className="m-0 flex-1 text-base font-bold">Tabs</h2>}
				<Button
					variant="secondary"
					size="xs"
					onClick={onPaste}
					title="Paste a text tab and pick its rhythm by ear"
					className={variant === "sheet" ? "ml-auto" : undefined}
				>
					<ClipboardPaste aria-hidden />
					Paste
				</Button>
				<Button variant="secondary" size="xs" onClick={onNew}>
					<Plus aria-hidden />
					New
				</Button>
				{onFold && (
					<button
						type="button"
						className="pb-icon lib-fold"
						onClick={onFold}
						aria-label="Fold the tab list"
						title="Fold the tab list"
						aria-expanded
					>
						<PanelRightClose aria-hidden />
					</button>
				)}
			</div>
			<LibraryBrowser
				custom={customPatterns}
				presets={PRESET_FINGERPICK_PATTERNS}
				favouriteIds={favouriteIds}
				loading={loading}
				words={LIBRARY_WORDS}
				storageKey="tabLibrary"
				renderRow={(pattern, i) => (
					<TabRow
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
