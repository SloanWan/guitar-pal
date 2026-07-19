"use client";

import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { User } from "@supabase/supabase-js";
import { ChevronDown, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useState } from "react";
import FingerpickEditModal from "./FingerpickEditModal";

interface FingerpickPatternLibraryProps {
	patterns: FingerpickPattern[];
	customPatterns: FingerpickPattern[];
	selectedPattern: FingerpickPattern;
	setSelectedPattern: (pattern: FingerpickPattern) => void;
	favouriteIds: string[];
	toggleFavourite: (patternId: string) => void;
	onSaveCustom: (pattern: FingerpickPattern) => void;
	onDeleteCustom: (patternId: string) => void;
	onClose: () => void;
	user: User | null;
}

interface PatternCardProps {
	pattern: FingerpickPattern;
	isSelected: boolean;
	isFav: boolean;
	onSelect: () => void;
	onToggleFav: () => void;
	onEdit?: () => void;
	onDelete?: () => void;
}

function PatternCard({
	pattern,
	isSelected,
	isFav,
	onSelect,
	onToggleFav,
	onEdit,
	onDelete,
}: PatternCardProps) {
	return (
		<div
			onClick={onSelect}
			className={`cursor-pointer rounded-lg px-3 py-2.5 border-l-[3px] transition-all duration-200 ${
				isSelected
					? "bg-denim-tint border-l-denim"
					: "border-l-transparent hover:bg-sidebar-hover hover:border-l-line-strong"
			}`}
		>
			<div className="flex items-center justify-between mb-1">
				<span
					className={`text-[11px] font-semibold transition-colors duration-200 ${
						isSelected ? "text-denim" : "text-ink-dim"
					}`}
				>
					{pattern.name}
				</span>
				<div className="flex items-center gap-0.5">
					{onEdit && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onEdit();
							}}
							className="p-0.5 rounded transition-colors text-ink-dim hover:text-denim"
							aria-label="Edit pattern"
						>
							<Pencil size={14} />
						</button>
					)}
					{onDelete && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
							className="p-0.5 rounded transition-colors text-ink-dim hover:text-destructive"
							aria-label="Delete pattern"
						>
							<Trash2 size={14} />
						</button>
					)}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onToggleFav();
						}}
						className="p-0.5 rounded transition-colors text-ink-dim hover:text-favorite-active"
						aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
					>
						<Star
							size={12}
							className={isFav ? "fill-favorite-active text-favorite-active" : ""}
						/>
					</button>
				</div>
			</div>
			{pattern.description && (
				<p className="text-[10px] text-ink-dim leading-snug">{pattern.description}</p>
			)}
		</div>
	);
}

export default function FingerpickPatternLibrary({
	patterns,
	customPatterns,
	selectedPattern,
	setSelectedPattern,
	favouriteIds,
	toggleFavourite,
	onSaveCustom,
	onDeleteCustom,
	onClose,
	user,
}: FingerpickPatternLibraryProps) {
	const [activeTab, setActiveTab] = useState<"all" | "favourites">("all");
	const [myPatternsOpen, setMyPatternsOpen] = useState(true);
	const [presetsOpen, setPresetsOpen] = useState(true);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [editingPattern, setEditingPattern] = useState<FingerpickPattern | null>(null);
	const [filter, setFilter] = useState("");

	const customIds = new Set(customPatterns.map((p) => p.id));
	const presets = patterns.filter((p) => !customIds.has(p.id));

	const query = filter.trim().toLowerCase();
	const matchesFilter = (p: FingerpickPattern) => p.name.toLowerCase().includes(query);

	const tabPresets =
		activeTab === "favourites" ? presets.filter((p) => favouriteIds.includes(p.id)) : presets;
	const tabCustom =
		activeTab === "favourites"
			? customPatterns.filter((p) => favouriteIds.includes(p.id))
			: customPatterns;

	const visiblePresets = query ? tabPresets.filter(matchesFilter) : tabPresets;
	const visibleCustom = query ? tabCustom.filter(matchesFilter) : tabCustom;

	function openNewPattern() {
		setEditingPattern(null);
		setEditModalOpen(true);
	}

	function openEditPattern(pattern: FingerpickPattern) {
		setEditingPattern(pattern);
		setEditModalOpen(true);
	}

	return (
		<>
			{/* Header strip */}
			<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-line">
				<h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-dim">
					Fingerpick Library
				</h2>
				<div className="flex items-center gap-1">
					<button
						onClick={openNewPattern}
						className="flex items-center gap-1 h-8 px-2 rounded-md text-[11px] font-semibold text-denim hover:bg-denim-tint transition-colors"
					>
						<Plus size={14} /> New Pattern
					</button>
					<button
						onClick={onClose}
						className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-ink-dim hover:bg-raise hover:text-ink transition-colors"
					>
						<X size={18} />
					</button>
				</div>
			</div>

			{/* Tab bar */}
			<div className="flex shrink-0 border-b border-line">
				<button
					onClick={() => setActiveTab("all")}
					className={`flex-1 py-2.5 text-xs font-semibold transition-colors duration-150 border-b-2 ${
						activeTab === "all"
							? "text-denim border-denim"
							: "text-ink-dim border-transparent hover:text-ink"
					}`}
				>
					All
				</button>
				<button
					onClick={() => setActiveTab("favourites")}
					className={`flex-1 py-2.5 text-xs font-semibold transition-colors duration-150 border-b-2 ${
						activeTab === "favourites"
							? "text-denim border-denim"
							: "text-ink-dim border-transparent hover:text-ink"
					}`}
				>
					Favourites
				</button>
			</div>

			{/* Filter */}
			<div className="shrink-0 border-b border-line px-3 py-2.5">
				<div className="relative">
					<input
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="> filter patterns…"
						aria-label="Filter patterns"
						className="w-full border border-line-strong bg-surface pl-3 pr-8 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
					/>
					{filter && (
						<button
							onClick={() => setFilter("")}
							className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-faint hover:text-ink transition-colors"
							aria-label="Clear filter"
						>
							<X size={14} />
						</button>
					)}
				</div>
			</div>

			{/* Scrollable content */}
			<div className="w-full flex-1 overflow-y-auto flex flex-col">
				{/* My Patterns section */}
				<div>
					<button
						onClick={() => setMyPatternsOpen((v) => !v)}
						className="flex items-center justify-between w-full px-4 py-2.5 bg-sidebar-header-1"
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-ink-dim">
							My Patterns
						</span>
						<ChevronDown
							size={13}
							className={`text-ink-dim transition-transform duration-200 ${
								myPatternsOpen ? "" : "-rotate-90"
							}`}
						/>
					</button>
					{myPatternsOpen && (
						<div className="px-3 pb-3 pt-3 flex flex-col gap-1.5">
							{visibleCustom.length === 0 ? (
								<p className="text-[11px] text-ink-dim px-1">
									{query
										? "No matches"
										: activeTab === "all"
											? "No custom patterns yet"
											: "No custom favourites yet"}
								</p>
							) : (
								visibleCustom.map((pattern) => (
									<PatternCard
										key={pattern.id}
										pattern={pattern}
										isSelected={selectedPattern.id === pattern.id}
										isFav={favouriteIds.includes(pattern.id)}
										onSelect={() => setSelectedPattern(pattern)}
										onToggleFav={() => toggleFavourite(pattern.id)}
										onEdit={() => openEditPattern(pattern)}
										onDelete={() => onDeleteCustom(pattern.id)}
									/>
								))
							)}
						</div>
					)}
				</div>

				{/* Presets section */}
				<div>
					<button
						onClick={() => setPresetsOpen((v) => !v)}
						className="flex items-center justify-between w-full px-4 py-2.5 bg-sidebar-header-2"
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-ink-dim">
							Presets
						</span>
						<ChevronDown
							size={13}
							className={`text-ink-dim transition-transform duration-200 ${
								presetsOpen ? "" : "-rotate-90"
							}`}
						/>
					</button>
					{presetsOpen && (
						<div className="px-3 pb-3 pt-3 flex flex-col gap-1.5">
							{visiblePresets.length === 0 ? (
								<p className="text-[11px] text-ink-dim px-1">
									{query ? "No matches" : "No preset favourites yet"}
								</p>
							) : (
								visiblePresets.map((pattern) => (
									<PatternCard
										key={pattern.id}
										pattern={pattern}
										isSelected={selectedPattern.id === pattern.id}
										isFav={favouriteIds.includes(pattern.id)}
										onSelect={() => setSelectedPattern(pattern)}
										onToggleFav={() => toggleFavourite(pattern.id)}
									/>
								))
							)}
						</div>
					)}
				</div>

				{/* Sign-in nudge */}
				{!user && (
					<p className="text-xs text-ink-dim text-center px-4 py-3">
						Sign in to sync your patterns and favourites across devices.
					</p>
				)}
			</div>

			<FingerpickEditModal
				open={editModalOpen}
				pattern={editingPattern}
				onClose={() => setEditModalOpen(false)}
				onSave={onSaveCustom}
			/>
		</>
	);
}
