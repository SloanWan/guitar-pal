"use client";

import StepGrid from "@/components/strum/StepGrid";
import StepGridCard from "@/components/strum/StepGridCard";
import BpmSlider from "@/components/strum/BpmSlider";
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
	CircleStop,
	X,
	ChevronDown,
	ChevronUp,
	Star,
	Trash2,
	Loader2,
	Pencil,
	SquareMenu,
	Metronome,
} from "lucide-react";
import CreatePatternModal from "@/components/strum/CreatePatternModal";
import { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import { useUser } from "@/hooks/useUser";

const MIN_BPM = 40;
const MAX_BPM = 220;

const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

export default function StrumPage() {
	const [selectedPattern, setSelectedPattern] = useState<StrumPattern | null>(
		PRESET_STRUM_PATTERNS[0],
	);
	const [bpm, setBpm] = useState(80);
	const [tickMode, setTickMode] = useState<TickMode>("quarter");
	const [selectedChord, setSelectedChord] = useState<ConfirmedChord | null>(null);

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
	} = useAudioEngine(
		selectedPattern?.beats ?? PRESET_STRUM_PATTERNS[0].beats,
		bpm,
		tickMode,
		selectedChord?.pitches,
	);

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
	const [activeTab, setActiveTab] = useState<"all" | "favourites">("all");
	const [presetsOpen, setPresetsOpen] = useState(true);
	const [myPatternsOpen, setMyPatternsOpen] = useState(true);
	const [spaceMode, setSpaceMode] = useState<"playPause" | "tapTempo">("playPause");
	const [mutHintDismissed, setMutHintDismissed] = useState(false);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);

	// Mobile drawer state
	const [showSheet, setShowSheet] = useState(false);
	const [showBpmPopover, setShowBpmPopover] = useState(false);
	const [bpmPopoverPos, setBpmPopoverPos] = useState<{ bottom: number; left: number }>({
		bottom: 0,
		left: 0,
	});
	const [controlsVisible, setControlsVisible] = useState(true);

	const tapTimesRef = useRef<number[]>([]);
	const bpmButtonRef = useRef<HTMLButtonElement>(null);

	// Stale-closure-safe visibility ref (same pattern as fingerpick page)
	const controlsVisibleRef = useRef(true);
	const lastScrollYRef = useRef(0);
	const scrollUpDistanceRef = useRef(0);
	const isAutoScrollingRef = useRef(false);

	// Bottom bar swipe-to-expand gesture refs
	const bottomBarDragStartYRef = useRef(0);
	const bottomBarIsDraggingRef = useRef(false);

	// Drag-handle swipe-to-collapse gesture refs
	const handleDragStartYRef = useRef(0);
	const handleIsDraggingRef = useRef(false);

	// BPM popover vertical slider drag refs
	const dragBpmRef = useRef(bpm);
	const isDraggingSliderRef = useRef(false);
	const wasPlayingRef = useRef(false);

	// Hide bottom drawer on scroll-down; restore after 40 px of scroll-up.
	useEffect(() => {
		if (window.innerWidth >= 768) return;
		const target = document.querySelector("main") ?? document.documentElement;

		function handleScroll() {
			if (isAutoScrollingRef.current) return;
			const currentY = (target as HTMLElement).scrollTop;
			const delta = currentY - lastScrollYRef.current;
			lastScrollYRef.current = currentY;

			if (delta > 0) {
				scrollUpDistanceRef.current = 0;
				if (controlsVisibleRef.current) {
					controlsVisibleRef.current = false;
					setControlsVisible(false);
				}
			} else {
				scrollUpDistanceRef.current += Math.abs(delta);
				if (scrollUpDistanceRef.current >= 40 && !controlsVisibleRef.current) {
					controlsVisibleRef.current = true;
					setControlsVisible(true);
				}
			}
		}

		target.addEventListener("scroll", handleScroll, { passive: true });
		return () => target.removeEventListener("scroll", handleScroll);
	}, []);

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
		if (found) queueMicrotask(() => setSelectedPattern(found));
	}, []);

	useEffect(() => {
		if (patternsLoading || !selectedPattern) return;
		if (PRESET_STRUM_PATTERNS.some((p) => p.id === selectedPattern.id)) return;
		if (!customPatterns.some((p) => p.id === selectedPattern.id)) {
			stop();
			queueMicrotask(() => setSelectedPattern(null));
		}
	}, [customPatterns, patternsLoading]);

	function handleHitPlayAndPause() {
		navigator.vibrate?.(10);
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

	function handleSliderPointerDown() {
		isDraggingSliderRef.current = true;
		wasPlayingRef.current = isPlaying;
		if (isPlaying) stop();
	}

	function handleSliderPointerUp() {
		isDraggingSliderRef.current = false;
		if (wasPlayingRef.current) start();
		wasPlayingRef.current = false;
	}

	function handleBottomBarPointerDown(e: React.PointerEvent) {
		if ((e.target as HTMLElement).closest("button, input")) return;
		bottomBarDragStartYRef.current = e.clientY;
		bottomBarIsDraggingRef.current = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleBottomBarPointerMove(e: React.PointerEvent) {
		if (!bottomBarIsDraggingRef.current) return;
		if (e.clientY - bottomBarDragStartYRef.current < -40) {
			bottomBarIsDraggingRef.current = false;
			setShowSheet(true);
		}
	}

	function handleBottomBarPointerUp() {
		bottomBarIsDraggingRef.current = false;
	}

	function restoreControls() {
		controlsVisibleRef.current = true;
		setControlsVisible(true);
		scrollUpDistanceRef.current = 0;
	}

	return (
		<>
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

				{/* Center — StepGrid; on mobile occupies exactly the space between navbar and drawer */}
				<div
					className="h-[calc(100dvh-3.5rem-3.5rem)] md:h-auto md:flex-1 flex items-center justify-center px-4 md:px-8 md:py-0 md:overflow-hidden"
					onClick={restoreControls}
				>
					<div className="w-full max-w-160">
						{selectedPattern ? (
							<StepGridCard
								pattern={selectedPattern}
								activeCell={{ beatIdx: currBeat, cellIdx: currCell }}
								selectedChord={selectedChord}
								onChordChange={setSelectedChord}
							/>
						) : (
							<p className="text-slate-400 text-sm text-center">
								Choose a pattern from the library
							</p>
						)}
					</div>
				</div>

				{/* Right panel — desktop controls only */}
				<div className="hidden md:flex w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex-col">
					<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Controls
					</h2>
					<div className="flex flex-col gap-5 px-5 py-5 flex-1 overflow-y-auto">
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
						<BpmSlider
							bpm={bpm}
							min={MIN_BPM}
							max={MAX_BPM}
							isPlaying={isPlaying}
							setBpm={setBpm}
							start={start}
							stop={stop}
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
									!metronomeEnabled ? "opacity-40" : ""
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
			</div>

			{/* Library toggle — fixed below navbar, mobile only */}
			{!showLibrary && (
				<button
					onClick={() => setShowLibrary(true)}
					className={`fixed top-17 right-4 z-30 md:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-300 active:scale-95 ${
						controlsVisible
							? "opacity-100 pointer-events-auto"
							: "opacity-0 pointer-events-none"
					}`}
					style={{ backgroundColor: "var(--denim)" }}
				>
					<SquareMenu />
				</button>
			)}

			{/* BPM vertical slider popover — fixed so it escapes the drawer's overflow context */}
			{showBpmPopover && (
				<div
					className="md:hidden fixed z-60 bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-4 flex items-center justify-center -translate-x-1/2"
					style={{ bottom: bpmPopoverPos.bottom, left: bpmPopoverPos.left }}
				>
					<input
						type="range"
						min={MIN_BPM}
						max={MAX_BPM}
						value={bpm}
						onChange={(e) => {
							const v = Number(e.target.value);
							dragBpmRef.current = v;
							setBpm(v);
						}}
						onPointerDown={handleSliderPointerDown}
						onPointerUp={handleSliderPointerUp}
						style={
							{
								writingMode: "vertical-lr",
								direction: "rtl",
								height: 120,
							} as React.CSSProperties
						}
						className="accent-denim cursor-pointer"
					/>
				</div>
			)}

			{/* Backdrop — closes sheet without bubbling to the card */}
			{showSheet && (
				<div className="md:hidden fixed inset-0 z-20" onClick={() => setShowSheet(false)} />
			)}

			{/* ── Mobile fixed bottom drawer ───────────────────────────────────── */}
			<div
				className="md:hidden fixed bottom-0 left-0 right-0 z-30 rounded-t-2xl bg-white border-t border-slate-300 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden transition-transform duration-300 ease-out"
				style={{ transform: controlsVisible ? "translateY(0)" : "translateY(100%)" }}
				onPointerDown={(e) => {
					if (!bpmButtonRef.current?.contains(e.target as Node)) {
						setShowBpmPopover(false);
					}
				}}
			>
				{/* Collapsible panel — max-height transition */}
				<div
					className={`bg-white overflow-hidden transition-[max-height] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${
						showSheet ? "max-h-[calc(33.333vh-56px)] overflow-y-auto" : "max-h-0"
					}`}
				>
					{/* Drag handle — swipe down to collapse */}
					<div
						className="flex justify-center pt-2.5 pb-1 shrink-0"
						style={{ touchAction: "none" }}
						onPointerDown={(e) => {
							handleDragStartYRef.current = e.clientY;
							handleIsDraggingRef.current = true;
							e.currentTarget.setPointerCapture(e.pointerId);
						}}
						onPointerMove={(e) => {
							if (!handleIsDraggingRef.current) return;
							if (e.clientY - handleDragStartYRef.current > 40) {
								handleIsDraggingRef.current = false;
								setShowSheet(false);
							}
						}}
						onPointerUp={() => {
							handleIsDraggingRef.current = false;
						}}
					>
						<div className="w-9 h-1 rounded-full bg-slate-300" />
					</div>

					<div className="flex flex-col gap-5 px-5 py-4 pb-6">
						{/* Tap Tempo */}
						<Button
							onClick={handleTapTempo}
							className="h-9 w-full text-sm font-semibold cursor-pointer transition-all duration-150"
							style={{ backgroundColor: "var(--denim)", color: "white" }}
						>
							Tap Tempo
						</Button>

						{/* BPM slider */}
						<div className="flex flex-col gap-1.5">
							<div className="flex justify-between items-center">
								<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
									BPM
								</span>
								<span className="text-xs tabular-nums text-denim font-semibold">
									{bpm}
								</span>
							</div>
							<BpmSlider
								bpm={bpm}
								min={MIN_BPM}
								max={MAX_BPM}
								isPlaying={isPlaying}
								setBpm={setBpm}
								start={start}
								stop={stop}
							/>
						</div>

						{/* Strum volume */}
						<div
							className={`flex flex-col gap-1.5 transition-opacity duration-200 ${!strumEnabled ? "opacity-40" : ""}`}
						>
							<div className="flex justify-between items-center">
								<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
									Strum Sound
								</span>
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

						<div className="border-t border-slate-100" />

						{/* Accent beat 1 */}
						<div
							className={`flex items-center justify-between transition-opacity duration-200 ${!metronomeEnabled ? "opacity-40 pointer-events-none" : ""}`}
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
						<div
							className={`flex flex-col gap-1.5 transition-opacity duration-200 ${!metronomeEnabled ? "opacity-40 pointer-events-none" : ""}`}
						>
							<div className="flex justify-between items-center">
								<span className="text-xs text-slate-400">Metronome vol.</span>
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

						{/* Loop Gap — greyed when Play Once active */}
						<div
							className={`flex flex-col gap-2 transition-opacity duration-200 ${playOnce ? "opacity-40 pointer-events-none" : ""}`}
						>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								Loop Gap
							</span>
							<div className="flex gap-1">
								{LOOP_GAP_OPTIONS.map((gap) => (
									<Button
										key={gap}
										variant={loopGap === gap ? "default" : "outline"}
										disabled={playOnce}
										onClick={() => setLoopGap(gap)}
										className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
										style={
											loopGap === gap && !playOnce
												? { backgroundColor: "var(--denim)", color: "white" }
												: undefined
										}
									>
										{gap}s
									</Button>
								))}
							</div>
						</div>

						{/* Space bar mode */}
						<div className="flex items-center gap-2">
							<span
								className={`text-xs font-medium transition-colors duration-200 ${spaceMode === "playPause" ? "text-denim font-semibold" : "text-slate-400"}`}
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
								className={`text-xs font-medium transition-colors duration-200 ${spaceMode === "tapTempo" ? "text-denim font-semibold" : "text-slate-400"}`}
							>
								Tap
							</span>
						</div>
					</div>
				</div>

				{/* Mute hint — above the bottom bar, covered when the panel expands */}
				{!mutHintDismissed && (
					<div className="flex items-center justify-center gap-2 px-4 py-1.5 border-t border-slate-100">
						<p className="text-xs text-slate-400">
							No sound? Check your phone&apos;s mute switch.
						</p>
						<button
							onClick={() => setMutHintDismissed(true)}
							className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
							aria-label="Dismiss hint"
						>
							<X size={14} />
						</button>
					</div>
				)}

				<div className="border-t border-slate-200" />

				{/* Always-visible bottom bar */}
				<div
					className="bg-white/95 backdrop-blur-sm flex items-center gap-1.5 px-3 py-2"
					onPointerDown={handleBottomBarPointerDown}
					onPointerMove={handleBottomBarPointerMove}
					onPointerUp={handleBottomBarPointerUp}
				>
					{/* BPM display — tap to open vertical slider popover */}
					<div className="relative shrink-0">
						<button
							ref={bpmButtonRef}
							onClick={() => {
								const rect = bpmButtonRef.current?.getBoundingClientRect();
								if (rect) {
									setBpmPopoverPos({
										bottom: window.innerHeight - rect.top + 8,
										left: rect.left + rect.width / 2,
									});
								}
								setShowBpmPopover((v) => !v);
							}}
							className="w-14 flex flex-col items-center leading-none text-center"
						>
							<span className="text-xl font-bold text-denim">{bpm}</span>
							<span className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">
								BPM
							</span>
						</button>
					</div>

					{/* Loop / Once segmented pill */}
					<div className="relative flex h-8 items-center rounded-full bg-slate-200 p-0.5 overflow-hidden shrink-0">
						<div
							className={`absolute inset-y-0.5 left-0 w-1/2 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
								playOnce ? "translate-x-full" : "translate-x-0"
							}`}
						/>
						<button
							onClick={() => setPlayOnce(false)}
							className={`relative z-10 px-3 h-full rounded-full text-xs font-semibold transition-colors duration-150 ${
								!playOnce ? "text-slate-700" : "text-slate-400"
							}`}
						>
							Loop
						</button>
						<button
							onClick={() => setPlayOnce(true)}
							className={`relative z-10 px-3 h-full rounded-full text-xs font-semibold transition-colors duration-150 ${
								playOnce ? "text-slate-700" : "text-slate-400"
							}`}
						>
							Once
						</button>
					</div>

					{/* Metronome icon toggle */}
					<button
						onClick={() => setMetronomeEnabled(!metronomeEnabled)}
						className={`p-1.5 rounded-full transition-colors duration-150 shrink-0 ${
							metronomeEnabled ? "text-denim" : "text-slate-400"
						}`}
					>
						<Metronome size={20} />
					</button>

					{/* Chevron — toggles the controls panel */}
					<button
						onClick={() => setShowSheet((v) => !v)}
						className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 transition-colors duration-150 shrink-0"
					>
						<ChevronUp
							size={20}
							className={`transition-transform duration-300 ${showSheet ? "rotate-180" : ""}`}
						/>
					</button>

					{/* Stop + Play/Pause — flush right */}
					<div className="ml-auto flex items-center gap-0.5 shrink-0">
						<button
							onClick={stop}
							className={`p-1 text-slate-500 transition-colors duration-150 ${
								isPlaying ? "visible" : "invisible"
							}`}
						>
							<CircleStop size={28} strokeWidth={1.5} />
						</button>
						<div
							onClick={handleHitPlayAndPause}
							className={`transition-all duration-150 active:scale-95 ${
								selectedPattern
									? "cursor-pointer text-denim hover:text-denim-dark"
									: "opacity-30 pointer-events-none text-denim"
							}`}
						>
							{isPlaying ? (
								<CirclePause size={40} strokeWidth={1.5} />
							) : (
								<CirclePlay size={40} strokeWidth={1.5} />
							)}
						</div>
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
		</>
	);
}
