"use client";

import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { User } from "@supabase/supabase-js";
import { ChevronDown, Star, X } from "lucide-react";
import { useState } from "react";

interface FingerpickPatternLibraryProps {
	patterns: FingerpickPattern[];
	selectedPattern: FingerpickPattern;
	setSelectedPattern: (pattern: FingerpickPattern) => void;
	favouriteIds: string[];
	toggleFavourite: (patternId: string) => void;
	onClose: () => void;
	user: User | null;
}

interface PatternCardProps {
	pattern: FingerpickPattern;
	isSelected: boolean;
	isFav: boolean;
	onSelect: () => void;
	onToggleFav: () => void;
}

function PatternCard({ pattern, isSelected, isFav, onSelect, onToggleFav }: PatternCardProps) {
	return (
		<div
			onClick={onSelect}
			className={`cursor-pointer rounded-lg px-3 py-2.5 border-l-[3px] transition-all duration-200 ${
				isSelected
					? "bg-denim-tint border-l-denim"
					: "border-l-transparent hover:bg-slate-50 hover:border-l-slate-300"
			}`}
		>
			<div className="flex items-center justify-between mb-1">
				<span
					className={`text-[11px] font-semibold transition-colors duration-200 ${
						isSelected ? "text-denim" : "text-slate-500"
					}`}
				>
					{pattern.name}
				</span>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggleFav();
					}}
					className="p-0.5 rounded transition-colors text-slate-300 hover:text-amber-400"
					aria-label={isFav ? "Remove from favourites" : "Add to favourites"}
				>
					<Star size={12} className={isFav ? "fill-amber-400 text-amber-400" : ""} />
				</button>
			</div>
			{pattern.description && (
				<p className="text-[10px] text-slate-400 leading-snug">{pattern.description}</p>
			)}
		</div>
	);
}

export default function FingerpickPatternLibrary({
	patterns,
	selectedPattern,
	setSelectedPattern,
	favouriteIds,
	toggleFavourite,
	onClose,
	user,
}: FingerpickPatternLibraryProps) {
	const [activeTab, setActiveTab] = useState<"all" | "favourites">("all");
	const [myPatternsOpen, setMyPatternsOpen] = useState(true);
	const [presetsOpen, setPresetsOpen] = useState(true);

	const visiblePresets =
		activeTab === "favourites" ? patterns.filter((p) => favouriteIds.includes(p.id)) : patterns;

	return (
		<>
			{/* Header strip */}
			<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
				<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Fingerpick Library
				</h2>
				<button
					onClick={onClose}
					className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
				>
					<X size={18} />
				</button>
			</div>

			{/* Tab bar */}
			<div className="flex shrink-0 border-b border-slate-200">
				<button
					onClick={() => setActiveTab("all")}
					className={`flex-1 py-2.5 text-xs font-semibold transition-colors duration-150 border-b-2 ${
						activeTab === "all"
							? "text-denim border-denim"
							: "text-slate-400 border-transparent hover:text-slate-600"
					}`}
				>
					All
				</button>
				<button
					onClick={() => setActiveTab("favourites")}
					className={`flex-1 py-2.5 text-xs font-semibold transition-colors duration-150 border-b-2 ${
						activeTab === "favourites"
							? "text-denim border-denim"
							: "text-slate-400 border-transparent hover:text-slate-600"
					}`}
				>
					Favourites
				</button>
			</div>

			{/* Scrollable content */}
			<div className="w-full flex-1 overflow-y-auto flex flex-col">
				{/* My Patterns section */}
				<div>
					<button
						onClick={() => setMyPatternsOpen((v) => !v)}
						className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-50"
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							My Patterns
						</span>
						<ChevronDown
							size={13}
							className={`text-slate-400 transition-transform duration-200 ${
								myPatternsOpen ? "" : "-rotate-90"
							}`}
						/>
					</button>
					{myPatternsOpen && (
						<div className="px-3 pb-3 pt-3 flex flex-col gap-1.5">
							{activeTab === "all" ? (
								<p className="text-[11px] text-slate-400 px-1">No custom patterns yet</p>
							) : (
								<p className="text-[11px] text-slate-400 px-1">No custom favourites yet</p>
							)}
							{/* TODO: render custom patterns here once create flow (future issue) is implemented */}
						</div>
					)}
				</div>

				{/* Presets section */}
				<div>
					<button
						onClick={() => setPresetsOpen((v) => !v)}
						className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-100"
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Presets
						</span>
						<ChevronDown
							size={13}
							className={`text-slate-400 transition-transform duration-200 ${
								presetsOpen ? "" : "-rotate-90"
							}`}
						/>
					</button>
					{presetsOpen && (
						<div className="px-3 pb-3 pt-3 flex flex-col gap-1.5">
							{visiblePresets.length === 0 ? (
								<p className="text-[11px] text-slate-400 px-1">No preset favourites yet</p>
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
					<p className="text-xs text-slate-400 text-center px-4 py-3">
						Sign in to sync your favourites across devices.
					</p>
				)}
			</div>
		</>
	);
}
