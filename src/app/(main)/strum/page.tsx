"use client";

import StepGrid from "@/components/strum/StepGrid";
import StepGridCard from "@/components/strum/StepGridCard";
import { PRESET_STRUM_PATTERNS, TickMode, StrumPattern } from "@/lib/strumPatterns";

import { useState, useEffect, useRef } from "react";

import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	Plus,
	Minus,
	CirclePlay,
	CirclePause,
	X,
	ChevronDown,
	Star,
	Trash2,
	Loader2,
	Pencil,
	SquareMenu,
} from "lucide-react";
import CreatePatternModal from "@/components/strum/CreatePatternModal";
import { useUser } from "@/hooks/useUser";

const MIN_BPM = 40;
const MAX_BPM = 220;

export default function StrumPage() {
	const [selectedPattern, setSelectedPattern] = useState<StrumPattern | null>(
		PRESET_STRUM_PATTERNS[0],
	);
	const [bpm, setBpm] = useState(80);
	const [tickMode, setTickMode] = useState<TickMode>("quarter");

	const {
		isPlaying,
		start,
		stop,
		currBeat,
		currCell,
		strumEnabled,
		setStrumEnabled,
		strumGain,
		setStrumGain,
		metronomeEnabled,
		setMetronomeEnabled,
		metronomeGain,
		setMetronomeGain,
		accentEnabled,
		setAccentEnabled,
		playOnce,
		setPlayOnce,
	} = useAudioEngine(selectedPattern?.beats ?? PRESET_STRUM_PATTERNS[0].beats, bpm, tickMode);

	const { user, loading } = useUser();
	const {
		customPatterns,
		patternsLoading,
		favouriteIds,
		handleSaveCustomPattern,
		handleEditCustomPattern,
		handleDeleteCustomPattern,
		handleToggleFavourite,
	} = useStrumPatterns(user, loading);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editingPattern, setEditingPattern] = useState<StrumPattern | null>(null);
	const [showLibrary, setShowLibrary] = useState(false);
	const [soundExpanded, setSoundExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState<"all" | "favourites">("all");
	const [presetsOpen, setPresetsOpen] = useState(true);
	const [myPatternsOpen, setMyPatternsOpen] = useState(true);
	const [spaceMode, setSpaceMode] = useState<"playPause" | "tapTempo">("playPause");
	const tapTimesRef = useRef<number[]>([]);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
				return;
			if (e.code === "Space") {
				e.preventDefault();
				if (spaceMode === "playPause") {
					handleHitPlayAndPause();
				} else {
					handleTapTempo();
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isPlaying, spaceMode]);

	useEffect(() => {
		const saved = localStorage.getItem("lastStrumPattern");
		const found = PRESET_STRUM_PATTERNS.find((p) => p.id === saved);
		if (found) setSelectedPattern(found);
	}, []);

	useEffect(() => {
		if (patternsLoading || !selectedPattern) return;
		if (PRESET_STRUM_PATTERNS.some((p) => p.id === selectedPattern.id)) return;
		if (!customPatterns.some((p) => p.id === selectedPattern.id)) {
			stop();
			setSelectedPattern(null);
		}
	}, [customPatterns, patternsLoading]);

	function handleHitPlayAndPause() {
		if (isPlaying) {
			stop();
		} else if (selectedPattern) {
			start();
		}
	}

	function handleSelectPattern(pattern: StrumPattern) {
		stop();
		setSelectedPattern(pattern);
		localStorage.setItem("lastStrumPattern", pattern.id);
	}

	function handleTapTempo() {
		const now = performance.now();
		const taps = tapTimesRef.current;

		if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
			tapTimesRef.current = [];
		}

		tapTimesRef.current = [...tapTimesRef.current, now].slice(-8);

		if (tapTimesRef.current.length < 2) return;

		const intervals = tapTimesRef.current.slice(1).map((t, i) => t - tapTimesRef.current[i]);
		const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
		const newBpm = Math.round(60000 / avgInterval);
		setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, newBpm)));
	}

	return (
		<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-slate-50">
			{/* Left sidebar — lg: static; below lg: slide-in overlay */}
			<div
				className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
					showLibrary ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
					<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Strumming Library
					</h2>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setCreateModalOpen(true)}
							className="text-xs font-semibold text-denim px-2 py-1 rounded hover:bg-denim-tint transition-colors"
						>
							+ Create
						</button>
						<button
							onClick={() => setShowLibrary(false)}
							className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
						>
							<X size={18} />
						</button>
					</div>
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

				{/* Scrollable sections */}
				<div className="w-full flex-1 overflow-y-auto flex flex-col">
					{/* My Patterns section */}
					{(() => {
						const visibleCustom =
							activeTab === "favourites"
								? customPatterns.filter((p) => favouriteIds.includes(p.id))
								: customPatterns;
						if (activeTab === "favourites" && visibleCustom.length === 0) return null;
						return (
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
										{patternsLoading ? (
											<div className="flex justify-center py-4">
												<Loader2
													size={16}
													className="animate-spin text-slate-300"
												/>
											</div>
										) : visibleCustom.length === 0 ? (
											<p className="text-[11px] text-slate-400 px-1">
												No custom patterns yet
											</p>
										) : (
											visibleCustom.map((pattern, idx) => {
												const isSelected =
													selectedPattern?.id === pattern.id;
												const isFav = favouriteIds.includes(pattern.id);
												return (
													<div
														key={idx}
														onClick={() => handleSelectPattern(pattern)}
														className={`cursor-pointer rounded-lg px-3 py-2.5 border-l-[3px] transition-all duration-200 ${
															isSelected
																? "bg-denim-tint border-l-denim"
																: "border-l-transparent hover:bg-slate-50 hover:border-l-slate-300"
														}`}
													>
														<div className="flex items-center justify-between mb-2">
															<span
																className={`text-[11px] font-semibold transition-colors duration-200 ${
																	isSelected
																		? "text-denim"
																		: "text-slate-500"
																}`}
															>
																{pattern.name.replace(
																	/\b\w/g,
																	(c) => c.toUpperCase(),
																)}
															</span>
															<div className="flex items-center gap-1">
																<button
																	onClick={(e) => {
																		e.stopPropagation();
																		handleToggleFavourite(
																			pattern.id,
																		);
																	}}
																	className="p-0.5 rounded transition-colors text-slate-300 hover:text-amber-400"
																>
																	<Star
																		size={12}
																		className={
																			isFav
																				? "fill-amber-400 text-amber-400"
																				: ""
																		}
																	/>
																</button>
																<button
																	onClick={(e) => {
																		e.stopPropagation();
																		setEditingPattern(pattern);
																		setCreateModalOpen(true);
																	}}
																	className="p-0.5 rounded transition-colors text-slate-300 hover:text-denim"
																>
																	<Pencil size={12} />
																</button>
																<button
																	onClick={(e) => {
																		e.stopPropagation();
																		handleDeleteCustomPattern(
																			pattern.id,
																		);
																	}}
																	className="p-0.5 rounded transition-colors text-slate-300 hover:text-red-500"
																>
																	<Trash2 size={12} />
																</button>
															</div>
														</div>
														<StepGrid
															beats={pattern.beats}
															activeCell={null}
															size="sm"
															showLabels={false}
														/>
													</div>
												);
											})
										)}
									</div>
								)}
							</div>
						);
					})()}

					{/* Favourites sign-in nudge */}
					{activeTab === "favourites" && !user && (
						<p className="text-xs text-slate-400 text-center px-4 py-3">
							Sign in to sync your favourites across devices.
						</p>
					)}

					{/* Presets section */}
					{(() => {
						const visiblePresets =
							activeTab === "favourites"
								? PRESET_STRUM_PATTERNS.filter((p) => favouriteIds.includes(p.id))
								: PRESET_STRUM_PATTERNS;
						if (visiblePresets.length === 0) return null;
						return (
							<div className="">
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
										{visiblePresets.map((pattern, idx) => {
											const isSelected = selectedPattern?.id === pattern.id;
											const isFav = favouriteIds.includes(pattern.id);
											return (
												<div
													key={idx}
													onClick={() => handleSelectPattern(pattern)}
													className={`cursor-pointer rounded-lg px-3 py-2.5 border-l-[3px] transition-all duration-200 ${
														isSelected
															? "bg-denim-tint border-l-denim"
															: "border-l-transparent hover:bg-slate-50 hover:border-l-slate-300"
													}`}
												>
													<div className="flex items-center justify-between mb-2">
														<span
															className={`capitalize text-[11px] font-semibold transition-colors duration-200 ${
																isSelected
																	? "text-denim"
																	: "text-slate-500"
															}`}
														>
															{pattern.name}
														</span>
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleToggleFavourite(pattern.id);
															}}
															className="p-0.5 rounded transition-colors text-slate-300 hover:text-amber-400"
														>
															<Star
																size={12}
																className={
																	isFav
																		? "fill-amber-400 text-amber-400"
																		: ""
																}
															/>
														</button>
													</div>
													<StepGrid
														beats={pattern.beats}
														activeCell={null}
														size="sm"
														showLabels={false}
													/>
												</div>
											);
										})}
									</div>
								)}
							</div>
						);
					})()}
				</div>
			</div>

			{/* Backdrop — tap outside to close library on mobile/tablet */}
			{showLibrary && (
				<div
					className="fixed inset-0 z-30 bg-black/20 lg:hidden"
					onClick={() => setShowLibrary(false)}
				/>
			)}

			{/* Center — StepGrid */}
			<div className="md:flex-1 flex items-center justify-center px-4 md:px-8 py-6 md:py-0 md:overflow-hidden">
				<div className="relative w-full max-w-160">
					{selectedPattern ? (
						<StepGridCard
							pattern={selectedPattern}
							activeCell={{ beatIdx: currBeat, cellIdx: currCell }}
						/>
					) : (
						<p className="text-slate-400 text-sm text-center">
							Choose a pattern from the library
						</p>
					)}
					{!showLibrary && (
						<button
							onClick={() => setShowLibrary(true)}
							className="absolute top-2 right-2 z-50 lg:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-200 active:scale-95"
							style={{ backgroundColor: "var(--denim)" }}
						>
							<SquareMenu />
						</button>
					)}
				</div>
			</div>

			{/* Right panel — all controls (full-width below StepGrid on mobile, sidebar on md+) */}
			<div className="w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex flex-col">
				<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
					Controls
				</h2>
				{/* Mobile controls — compact 2-column grid + collapsible sound section */}
				<div className="flex flex-col gap-3 p-4 md:hidden">
					{/* Main grid card */}
					<div className="rounded-xl border border-slate-100 p-4">
						<div className="grid grid-cols-2 gap-4">
							{/* Left column: Play/Pause, BPM display, Tap Tempo */}
							<div className="flex flex-col items-center gap-4">
								<div
									onClick={handleHitPlayAndPause}
									className={`transition-all duration-150 active:scale-95 ${selectedPattern ? "cursor-pointer text-denim hover:text-denim-dark" : "opacity-30 pointer-events-none text-denim"}`}
								>
									{isPlaying ? (
										<CirclePause size={52} strokeWidth={1.5} />
									) : (
										<CirclePlay size={52} strokeWidth={1.5} />
									)}
								</div>
								<span className="flex flex-col items-center gap-0.5">
									<span className="text-5xl font-bold tracking-tight text-denim">
										{bpm}
									</span>
									<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
										BPM
									</span>
								</span>
								<Button
									onClick={handleTapTempo}
									className="h-9 w-full text-sm font-semibold cursor-pointer transition-all duration-150"
									style={{ backgroundColor: "var(--denim)", color: "white" }}
								>
									Tap Tempo
								</Button>
							</div>

							{/* Right column: ±BPM + slider, tick mode, space switch */}
							<div className="flex flex-col gap-3 justify-center">
								{/* ±10 BPM buttons + slider */}
								<div className="flex flex-col gap-2">
									<div className="flex gap-2">
										<Button
											variant="outline"
											className="flex-1 h-9 p-0 border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
											onClick={() => setBpm(Math.max(MIN_BPM, bpm - 10))}
										>
											<Minus size={14} />
										</Button>
										<Button
											variant="outline"
											className="flex-1 h-9 p-0 border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
											onClick={() => setBpm(Math.min(MAX_BPM, bpm + 10))}
										>
											<Plus size={14} />
										</Button>
									</div>
									<input
										type="range"
										min={MIN_BPM}
										max={MAX_BPM}
										value={bpm}
										onChange={(e) => setBpm(Number(e.target.value))}
										className="w-full accent-denim cursor-pointer"
									/>
								</div>

								{/* Tick mode */}
								<div
									className={`flex gap-1 transition-opacity duration-200 ${!metronomeEnabled ? "opacity-40" : ""}`}
								>
									<Button
										onClick={() => setTickMode("quarter")}
										variant={tickMode === "quarter" ? "default" : "secondary"}
										disabled={!metronomeEnabled}
										className="flex-1 h-8 px-0 text-xs font-semibold transition-all duration-150"
										style={
											tickMode === "quarter"
												? {
														backgroundColor: "var(--denim)",
														color: "white",
													}
												: {}
										}
									>
										1/4
									</Button>
									<Button
										onClick={() => setTickMode("eighth")}
										variant={tickMode === "eighth" ? "default" : "secondary"}
										disabled={!metronomeEnabled}
										className="flex-1 h-8 px-0 text-xs font-semibold transition-all duration-150"
										style={
											tickMode === "eighth"
												? {
														backgroundColor: "var(--denim)",
														color: "white",
													}
												: {}
										}
									>
										1/8
									</Button>
									<Button
										onClick={() => setTickMode("sixteenth")}
										variant={tickMode === "sixteenth" ? "default" : "secondary"}
										disabled={!metronomeEnabled}
										className="flex-1 h-8 px-0 text-xs font-semibold transition-all duration-150"
										style={
											tickMode === "sixteenth"
												? {
														backgroundColor: "var(--denim)",
														color: "white",
													}
												: {}
										}
									>
										1/16
									</Button>
								</div>

								{/* Space mode switch */}
								<div className="flex items-center gap-2">
									<span
										className={`text-xs font-medium transition-colors duration-200 ${
											spaceMode === "playPause"
												? "text-denim font-semibold"
												: "text-slate-400"
										}`}
									>
										Play/Pause
									</span>
									<Switch
										checked={spaceMode === "tapTempo"}
										onCheckedChange={() =>
											setSpaceMode((m) =>
												m === "playPause" ? "tapTempo" : "playPause",
											)
										}
										className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-denim"
									/>
									<span
										className={`text-xs font-medium transition-colors duration-200 ${
											spaceMode === "tapTempo"
												? "text-denim font-semibold"
												: "text-slate-400"
										}`}
									>
										Tap
									</span>
								</div>
							</div>
						</div>
					</div>

					{/* Play once */}
					<div className="flex items-center justify-between px-1">
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Play once
						</span>
						<Switch
							checked={playOnce}
							onCheckedChange={setPlayOnce}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Sound — collapsible */}
					<div className="rounded-xl border border-slate-100 overflow-hidden">
						<button
							onClick={() => setSoundExpanded((v) => !v)}
							className="flex items-center justify-between w-full px-4 py-3"
						>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								Sound
							</span>
							<ChevronDown
								size={14}
								className={`text-slate-400 transition-transform duration-200 ${soundExpanded ? "rotate-180" : ""}`}
							/>
						</button>
						{soundExpanded && (
							<div className="flex flex-col gap-4 px-4 pb-4">
								{/* Metronome toggle */}
								<div className="flex items-center justify-between">
									<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
										Metronome
									</span>
									<Switch
										checked={metronomeEnabled}
										onCheckedChange={setMetronomeEnabled}
										className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
									/>
								</div>
								{/* Accent beat 1 */}
								<div
									className={`flex items-center justify-between ${!metronomeEnabled ? "opacity-40" : ""}`}
								>
									<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
										Accent beat 1
									</span>
									<Switch
										checked={accentEnabled}
										disabled={!metronomeEnabled}
										onCheckedChange={setAccentEnabled}
										className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
									/>
								</div>
								{/* Metronome volume */}
								<div className="flex flex-col gap-1.5">
									<div className="flex justify-between items-center">
										<span className="text-xs text-slate-400">
											Metronome vol.
										</span>
										<span className="text-xs tabular-nums text-slate-400">
											{Math.round(metronomeGain * 100)}%
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={1}
										step={0.01}
										value={metronomeGain}
										disabled={!metronomeEnabled}
										onChange={(e) => setMetronomeGain(Number(e.target.value))}
										className="w-full accent-denim cursor-pointer"
									/>
								</div>
								{/* Strum sound toggle */}
								<div className="flex items-center justify-between">
									<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
										Strum Sound
									</span>
									<Switch
										checked={strumEnabled}
										onCheckedChange={setStrumEnabled}
										className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
									/>
								</div>
								{/* Guitar volume */}
								<div
									className={`flex flex-col gap-1.5 transition-opacity duration-200 ${!strumEnabled ? "opacity-40" : ""}`}
								>
									<div className="flex justify-between items-center">
										<span className="text-xs text-slate-400">Guitar vol.</span>
										<span className="text-xs tabular-nums text-slate-400">
											{Math.round(strumGain * 100)}%
										</span>
									</div>
									<input
										type="range"
										min={0}
										max={2}
										step={0.01}
										value={strumGain}
										onChange={(e) => setStrumGain(Number(e.target.value))}
										disabled={!strumEnabled}
										className="w-full accent-denim cursor-pointer"
									/>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Desktop controls — single column, unchanged */}
				<div className="hidden md:flex flex-col gap-5 px-5 py-5 md:flex-1 md:overflow-y-auto">
					{/* Play / Pause */}
					<div
						onClick={handleHitPlayAndPause}
						className={`flex justify-center transition-all duration-150 active:scale-95 ${selectedPattern ? "cursor-pointer text-denim hover:text-denim-dark" : "opacity-30 pointer-events-none text-denim"}`}
					>
						{isPlaying ? (
							<CirclePause size={60} strokeWidth={1.5} />
						) : (
							<CirclePlay size={60} strokeWidth={1.5} />
						)}
					</div>

					{/* BPM slider */}
					<input
						type="range"
						min={MIN_BPM}
						max={MAX_BPM}
						value={bpm}
						onChange={(e) => setBpm(Number(e.target.value))}
						className="w-full accent-denim cursor-pointer"
					/>

					{/* ±10 BPM + display */}
					<div className="flex justify-between items-center">
						<Button
							variant="outline"
							className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
							onClick={() => setBpm(Math.max(MIN_BPM, bpm - 10))}
						>
							<Minus size={16} />
						</Button>
						<span className="flex flex-col items-center gap-0.5">
							<span className="text-5xl font-bold tracking-tight text-denim">
								{bpm}
							</span>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								BPM
							</span>
						</span>
						<Button
							variant="outline"
							className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
							onClick={() => setBpm(Math.min(MAX_BPM, bpm + 10))}
						>
							<Plus size={16} />
						</Button>
					</div>

					{/* Tap Tempo */}
					<div className="flex flex-col items-center gap-3">
						<Button
							onClick={handleTapTempo}
							className="h-9 px-8 text-sm font-semibold cursor-pointer transition-all duration-150"
							style={{ backgroundColor: "var(--denim)", color: "white" }}
						>
							Tap Tempo
						</Button>
						<div className="flex items-center gap-2.5">
							<span
								className={`text-xs font-medium transition-colors duration-200 ${
									spaceMode === "playPause"
										? "text-denim font-semibold"
										: "text-slate-400"
								}`}
							>
								Play/Pause
							</span>
							<Switch
								checked={spaceMode === "tapTempo"}
								onCheckedChange={() =>
									setSpaceMode((m) =>
										m === "playPause" ? "tapTempo" : "playPause",
									)
								}
								className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-denim"
							/>
							<span
								className={`text-xs font-medium transition-colors duration-200 ${
									spaceMode === "tapTempo"
										? "text-denim font-semibold"
										: "text-slate-400"
								}`}
							>
								Tap Tempo
							</span>
						</div>
					</div>

					{/* Play once */}
					<div className="flex items-center justify-between">
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Play once
						</span>
						<Switch
							checked={playOnce}
							onCheckedChange={setPlayOnce}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Divider */}
					<div className="border-t border-slate-100" />

					{/* Metronome toggle */}
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
							Metronome
						</span>
						<Switch
							checked={metronomeEnabled}
							onCheckedChange={setMetronomeEnabled}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Tick mode */}
					<div
						className={`flex gap-2 justify-center transition-opacity duration-200 ${!metronomeEnabled ? "opacity-40" : ""}`}
					>
						<Button
							onClick={() => setTickMode("quarter")}
							variant={tickMode === "quarter" ? "default" : "secondary"}
							disabled={!metronomeEnabled}
							className="cursor-pointer h-8 px-4 text-xs font-semibold transition-all duration-150"
							style={
								tickMode === "quarter"
									? { backgroundColor: "var(--denim)", color: "white" }
									: {}
							}
						>
							1/4
						</Button>
						<Button
							onClick={() => setTickMode("eighth")}
							variant={tickMode === "eighth" ? "default" : "secondary"}
							disabled={!metronomeEnabled}
							className="cursor-pointer h-8 px-4 text-xs font-semibold transition-all duration-150"
							style={
								tickMode === "eighth"
									? { backgroundColor: "var(--denim)", color: "white" }
									: {}
							}
						>
							1/8
						</Button>
						<Button
							onClick={() => setTickMode("sixteenth")}
							variant={tickMode === "sixteenth" ? "default" : "secondary"}
							disabled={!metronomeEnabled}
							className="cursor-pointer h-8 px-4 text-xs font-semibold transition-all duration-150"
							style={
								tickMode === "sixteenth"
									? { backgroundColor: "var(--denim)", color: "white" }
									: {}
							}
						>
							1/16
						</Button>
					</div>

					{/* Accent beat 1 toggle */}
					<div
						className={`flex items-center justify-between ${!metronomeEnabled ? "opacity-40" : ""}`}
					>
						<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
							Accent beat 1
						</span>
						<Switch
							checked={accentEnabled}
							disabled={!metronomeEnabled}
							onCheckedChange={setAccentEnabled}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Metronome volume */}
					<div className="flex flex-col gap-1.5">
						<div
							className={`flex justify-between items-center ${
								!strumEnabled ? "opacity-40" : ""
							}`}
						>
							<span className="text-xs text-slate-400">Volume</span>
							<span className="text-xs tabular-nums text-slate-400">
								{Math.round(metronomeGain * 100)}%
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={metronomeGain}
							disabled={!metronomeEnabled}
							onChange={(e) => setMetronomeGain(Number(e.target.value))}
							className="w-full accent-denim cursor-pointer"
						/>
					</div>

					<div className="border-t border-slate-100" />

					{/* Strum sound toggle */}
					<div className="flex items-center justify-between">
						<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
							Strum Sound
						</span>
						<Switch
							checked={strumEnabled}
							onCheckedChange={setStrumEnabled}
							className="data-[state=checked]:bg-denim data-[state=unchecked]:bg-slate-200"
						/>
					</div>

					{/* Guitar strum volume */}
					<div
						className={`flex flex-col gap-1.5 transition-opacity duration-200 ${
							!strumEnabled ? "opacity-40" : ""
						}`}
					>
						<div className="flex justify-between items-center">
							<span className="text-xs text-slate-400">Volume</span>
							<span className="text-xs tabular-nums text-slate-400">
								{Math.round(strumGain * 100)}%
							</span>
						</div>
						<input
							type="range"
							min={0}
							max={2}
							step={0.01}
							value={strumGain}
							onChange={(e) => setStrumGain(Number(e.target.value))}
							disabled={!strumEnabled}
							className="w-full accent-denim cursor-pointer"
						/>
					</div>
				</div>
			</div>

			<CreatePatternModal
				open={createModalOpen}
				onClose={() => {
					setCreateModalOpen(false);
					setEditingPattern(null);
				}}
				onSave={(pattern) => {
					if (editingPattern) {
						handleEditCustomPattern(pattern);
						if (selectedPattern?.id === pattern.id) setSelectedPattern(pattern);
					} else {
						handleSaveCustomPattern(pattern);
					}
				}}
				editPattern={editingPattern ?? undefined}
				user={user}
			/>
		</div>
	);
}
