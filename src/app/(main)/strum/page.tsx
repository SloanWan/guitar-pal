"use client";

import StepGridCard from "@/components/strum/StepGridCard";
import StrumPatternLibrary from "@/components/strum/StrumPatternLibrary";
import { PRESET_STRUM_PATTERNS, TickMode, StrumPattern } from "@/lib/strumPatterns";

import { useState, useEffect, useRef } from "react";

import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import {
	CirclePlay,
	CircleStop,
	ChevronUp,
	SquareMenu,
	Metronome,
	X,
} from "lucide-react";
import CreatePatternModal from "@/components/strum/CreatePatternModal";
import { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import { useUser } from "@/hooks/useUser";
import Fader from "@/components/ui/Fader";

const MIN_BPM = 40;
const MAX_BPM = 220;

const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

// BPM fader tick marks: genre reference tempos. `PERCENTS` are the fixed v3
// visual positions on the 40–220 track; `VALUES` are the exact BPM each tick
// snaps to when clicked; `LABELS` are the genre tooltip shown while hovering.
const BPM_TICK_PERCENTS = [11, 19, 28, 33, 39, 44, 50, 56, 67];
const BPM_TICK_VALUES = [60, 75, 90, 100, 110, 120, 130, 140, 160];
const BPM_TICK_LABELS = [
	"Slow Practice",
	"Folk",
	"Ballad",
	"Pop / Blues",
	"Funk",
	"Pop / Rock",
	"Rock",
	"Jazz / Hard Rock",
	"Fast Rock",
];

interface RockerProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	ariaLabel: string;
}

// Hardware rocker switch: 40×20 bordered outer, 15×14 sliding block. A sliding
// rectangle — never a pill with a circle.
function Rocker({ checked, onChange, disabled, ariaLabel }: RockerProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`relative h-5 w-10 shrink-0 border transition-colors duration-100 disabled:cursor-not-allowed ${
				checked ? "border-denim" : "border-line-strong"
			}`}
		>
			<span
				aria-hidden="true"
				className={`absolute top-0.5 h-3.5 w-3.5 transition-all duration-100 ${
					checked ? "left-5 bg-denim-accent" : "left-0.5 bg-ink-faint"
				}`}
			/>
		</button>
	);
}

interface SegmentedOption {
	value: string;
	label: string;
}
interface SegmentedProps {
	options: readonly SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

// Segmented pills: hairline-bordered row, exactly one denim-filled active
// segment. Used for tick mode, loop gap, spacebar mode and the mobile Loop/Once.
function Segmented({ options, value, onChange, disabled }: SegmentedProps) {
	return (
		<div className={`flex border border-line-strong ${disabled ? "pointer-events-none" : ""}`}>
			{options.map((opt, i) => {
				const on = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						disabled={disabled}
						onClick={() => onChange(opt.value)}
						className={`flex-1 py-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors ${
							i > 0 ? "border-l border-line-strong" : ""
						} ${on ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim"}`}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

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

	function stepBpm(delta: number) {
		setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm + delta)));
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
		navigator.vibrate?.(10);
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
			<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-workspace">
				{/* Left sidebar — lg: static; below lg: slide-in overlay */}
				<div
					className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-line bg-sidebar flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
						showLibrary ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<StrumPatternLibrary
						customPatterns={customPatterns}
						patternsLoading={patternsLoading}
						selectedPattern={selectedPattern}
						onSelectPattern={handleSelectPattern}
						favouriteIds={favouriteIds}
						onToggleFavourite={handleToggleFavourite}
						onCreate={() => {
							setEditingPattern(null);
							setCreateModalOpen(true);
						}}
						onEditPattern={(pattern) => {
							setEditingPattern(pattern);
							setCreateModalOpen(true);
						}}
						onDeletePattern={handleDeleteCustomPattern}
						onClose={() => setShowLibrary(false)}
						user={user}
					/>
				</div>

				{/* Backdrop — tap outside to close library on mobile/tablet */}
				{showLibrary && (
					<div
						className="fixed inset-0 z-30 bg-(--backdrop) lg:hidden"
						onClick={() => setShowLibrary(false)}
					/>
				)}

				{/* Center — StepGrid; on mobile occupies exactly the space between navbar and drawer */}
				<div
					className="relative h-[calc(100dvh-3.5rem-3.5rem)] md:h-auto md:flex-1 flex items-center justify-center px-4 md:px-8 md:py-0 md:overflow-hidden"
					onClick={restoreControls}
				>
					{/* Library toggle — scoped to centre column, 768–1024 px only */}
					{!showLibrary && (
						<button
							onClick={(e) => { e.stopPropagation(); setShowLibrary(true); }}
							className={`absolute top-3 right-3 z-10 lg:hidden flex items-center bg-denim text-on-denim px-2 py-2 transition-all duration-300 active:scale-95 ${
								controlsVisible
									? "opacity-100 pointer-events-auto"
									: "opacity-0 pointer-events-none"
							}`}
						>
							<SquareMenu />
						</button>
					)}
					<div className="w-full max-w-160">
						{selectedPattern ? (
							<StepGridCard
								pattern={selectedPattern}
								activeCell={{ beatIdx: currBeat, cellIdx: currCell }}
								selectedChord={selectedChord}
								onChordChange={setSelectedChord}
							/>
						) : (
							<p className="text-ink-dim text-sm text-center">
								Choose a pattern from the library
							</p>
						)}
					</div>
				</div>

				{/* Right panel — desktop controls only */}
				<div className="hidden md:flex w-full border-t border-line bg-popover md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex-col">
					<h2 className="w-full px-5 py-4 shrink-0 border-b border-line font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-ink-dim">
						Controls
					</h2>

					<div className="flex flex-col overflow-y-auto">
						{/* TRANSPORT */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Transport</span>
								<span
									className={`transition-opacity duration-150 ${spaceMode === "playPause" ? "opacity-100" : "opacity-0"}`}
									aria-hidden={spaceMode !== "playPause"}
								>
									Space
								</span>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleHitPlayAndPause}
									disabled={!selectedPattern}
									aria-label={isPlaying ? "Stop" : "Play"}
									className="flex h-13 w-full items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
								>
									{isPlaying ? (
										<CircleStop size={20} strokeWidth={1.5} />
									) : (
										<CirclePlay size={20} strokeWidth={1.5} />
									)}
								</button>
							</div>
							<div>
								<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Spacebar
								</div>
								<Segmented
									options={[
										{ value: "playPause", label: "Play/Pause" },
										{ value: "tapTempo", label: "Tap" },
									]}
									value={spaceMode}
									onChange={(v) => setSpaceMode(v as "playPause" | "tapTempo")}
								/>
							</div>
						</div>

						{/* TEMPO */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Tempo</span>
								<span>40–220</span>
							</div>
							{/* BPM readout with LCD segment-ghost */}
							<div className="border border-line-strong px-0 pt-3 pb-2 text-center">
								<span className="relative inline-block font-mono text-[44px] font-bold leading-none tracking-[-0.02em] text-denim text-shadow-(--glow-readout)">
									<span aria-hidden="true" className="absolute inset-0 opacity-[0.09]">
										888
									</span>
									<span className="relative">{String(bpm).padStart(3, "0")}</span>
								</span>
								<div className="mt-1.5 font-mono text-[9px] tracking-[0.28em] text-ink-faint">
									BPM
								</div>
							</div>
							<Fader
								min={MIN_BPM}
								max={MAX_BPM}
								step={1}
								value={bpm}
								onValue={setBpm}
								onDragStart={handleSliderPointerDown}
								onDragEnd={handleSliderPointerUp}
								ticks={BPM_TICK_PERCENTS}
								tickValues={BPM_TICK_VALUES}
								tickLabels={BPM_TICK_LABELS}
								scale={["40", "130", "220"]}
								ariaLabel="Tempo in BPM"
							/>
							{/* Steppers: −10 / −1 / TAP / +1 / +10 */}
							<div className="flex flex-col">
								<div className="flex gap-2">
									{(
										[
											{ label: "−10", delta: -10 },
											{ label: "−1", delta: -1 },
										] as const
									).map(({ label, delta }) => (
										<button
											key={label}
											type="button"
											onClick={() => stepBpm(delta)}
											className="flex-1 border border-line-strong py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
										>
											{label}
										</button>
									))}
									<button
										type="button"
										onClick={handleTapTempo}
										className="flex-1 border border-line-strong py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
									>
										TAP
									</button>
									{(
										[
											{ label: "+1", delta: 1 },
											{ label: "+10", delta: 10 },
										] as const
									).map(({ label, delta }) => (
										<button
											key={label}
											type="button"
											onClick={() => stepBpm(delta)}
											className="flex-1 border border-line-strong py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
										>
											{label}
										</button>
									))}
								</div>
								{/* Fixed-height row reserves space for the TAP→Space hint so switching modes causes no layout shift */}
								<div className="flex gap-2 h-4">
									<div className="flex-1" />
									<div className="flex-1" />
									<div className="flex-1 flex items-center justify-center">
										<span
											className={`font-mono text-[8px] uppercase tracking-[0.08em] text-ink-faint transition-opacity duration-150 ${spaceMode === "tapTempo" ? "opacity-100" : "opacity-0"}`}
											aria-hidden="true"
										>
											space
										</span>
									</div>
									<div className="flex-1" />
									<div className="flex-1" />
								</div>
							</div>
						</div>

						{/* LOOP */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Loop</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
									Play once
								</span>
								<Rocker checked={playOnce} onChange={setPlayOnce} ariaLabel="Play once" />
							</div>
							<div className={playOnce ? "opacity-40" : ""}>
								<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Loop gap
								</div>
								<Segmented
									options={LOOP_GAP_OPTIONS.map((gap) => ({
										value: String(gap),
										label: `${gap}S`,
									}))}
									value={String(loopGap)}
									onChange={(v) => setLoopGap(Number(v) as LoopGapSeconds)}
									disabled={playOnce}
								/>
							</div>
						</div>

						{/* STRUM SOUND */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Strum Sound</span>
								<span className="tabular-nums">{Math.round(strumGain * 100)}%</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
									Enabled
								</span>
								<Rocker
									checked={strumEnabled}
									onChange={setStrumEnabled}
									ariaLabel="Strum sound"
								/>
							</div>
							<div className={!strumEnabled ? "opacity-40" : ""}>
								<Fader
									min={0}
									max={2}
									step={0.01}
									value={strumGain}
									onValue={(v) => {
										setStrumGain(v);
										navigator.vibrate?.(10);
									}}
									ticks={[0, 25, 50, 75, 100]}
									tickValues={[0, 0.5, 1, 1.5, 2]}
									scale={["0", "100", "200"]}
									disabled={!strumEnabled}
									ariaLabel="Strum volume"
								/>
							</div>
						</div>

						{/* METRONOME */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Metronome</span>
								<span className="tabular-nums">{Math.round(metronomeGain * 100)}%</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
									Enabled
								</span>
								<Rocker
									checked={metronomeEnabled}
									onChange={setMetronomeEnabled}
									ariaLabel="Metronome"
								/>
							</div>
							<div
								className={`flex items-center justify-between ${
									!metronomeEnabled ? "opacity-40" : ""
								}`}
							>
								<span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
									Accent beat 1
								</span>
								<Rocker
									checked={accentEnabled}
									onChange={setAccentEnabled}
									disabled={!metronomeEnabled}
									ariaLabel="Accent beat 1"
								/>
							</div>
							<div className={!metronomeEnabled ? "opacity-40" : ""}>
								<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Subdivision
								</div>
								<Segmented
									options={[
										{ value: "quarter", label: "1/4" },
										{ value: "eighth", label: "1/8" },
										{ value: "sixteenth", label: "1/16" },
									]}
									value={tickMode}
									onChange={(v) => setTickMode(v as TickMode)}
									disabled={!metronomeEnabled}
								/>
							</div>
							<div className={!metronomeEnabled ? "opacity-40" : ""}>
								<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Metronome vol.
								</div>
								<Fader
									min={0}
									max={1}
									step={0.01}
									value={metronomeGain}
									onValue={(v) => {
										setMetronomeGain(v);
										navigator.vibrate?.(10);
									}}
									ticks={[0, 25, 50, 75, 100]}
									tickValues={[0, 0.25, 0.5, 0.75, 1]}
									scale={["0", "50", "100"]}
									disabled={!metronomeEnabled}
									ariaLabel="Metronome volume"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* BPM vertical slider popover — fixed so it escapes the drawer's overflow context */}
			{showBpmPopover && (
				<div
					className="md:hidden fixed z-60 bg-popover border border-line px-4 py-4 flex items-center justify-center -translate-x-1/2"
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
				className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-popover border-t border-line-strong overflow-hidden transition-transform duration-300 ease-out"
				style={{ transform: controlsVisible ? "translateY(0)" : "translateY(100%)" }}
				onPointerDown={(e) => {
					if (!bpmButtonRef.current?.contains(e.target as Node)) {
						setShowBpmPopover(false);
					}
				}}
			>
				{/* Collapsible panel — max-height transition */}
				<div
					className={`bg-popover overflow-hidden transition-[max-height] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
						<div className="w-9 h-1 bg-line-strong" />
					</div>

					<div className="flex flex-col gap-5 px-5 py-4 pb-6">
						{/* Tempo — steppers + fader */}
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Tempo</span>
								<span className="tabular-nums text-denim">{bpm}</span>
							</div>
							<div className="flex flex-col">
								<div className="flex gap-2">
									{(
										[
											{ label: "−10", delta: -10 },
											{ label: "−1", delta: -1 },
										] as const
									).map(({ label, delta }) => (
										<button
											key={label}
											type="button"
											onClick={() => stepBpm(delta)}
											className="flex-1 border border-line-strong py-1.75 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
										>
											{label}
										</button>
									))}
									<button
										type="button"
										onClick={handleTapTempo}
										className="flex-1 border border-line-strong py-1.75 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
									>
										TAP
									</button>
									{(
										[
											{ label: "+1", delta: 1 },
											{ label: "+10", delta: 10 },
										] as const
									).map(({ label, delta }) => (
										<button
											key={label}
											type="button"
											onClick={() => stepBpm(delta)}
											className="flex-1 border border-line-strong py-1.75 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
										>
											{label}
										</button>
									))}
								</div>
								{/* Fixed-height row reserves space for the TAP→Space hint */}
								<div className="flex gap-2 h-4">
									<div className="flex-1" />
									<div className="flex-1" />
									<div className="flex-1 flex items-center justify-center">
										<span
											className={`font-mono text-[8px] uppercase tracking-[0.08em] text-ink-faint transition-opacity duration-150 ${spaceMode === "tapTempo" ? "opacity-100" : "opacity-0"}`}
											aria-hidden="true"
										>
											space
										</span>
									</div>
									<div className="flex-1" />
									<div className="flex-1" />
								</div>
							</div>
							<Fader
								min={MIN_BPM}
								max={MAX_BPM}
								step={1}
								value={bpm}
								onValue={setBpm}
								onDragStart={handleSliderPointerDown}
								onDragEnd={handleSliderPointerUp}
								ticks={BPM_TICK_PERCENTS}
								tickValues={BPM_TICK_VALUES}
								tickLabels={BPM_TICK_LABELS}
								scale={["40", "130", "220"]}
								ariaLabel="Tempo in BPM"
							/>
						</div>

						{/* Strum Sound volume */}
						<div className={`flex flex-col gap-3 ${!strumEnabled ? "opacity-40" : ""}`}>
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Strum Sound</span>
								<span className="tabular-nums">{Math.round(strumGain * 100)}%</span>
							</div>
							<Fader
								min={0}
								max={2}
								step={0.01}
								value={strumGain}
								onValue={(v) => {
									setStrumGain(v);
									navigator.vibrate?.(10);
								}}
								ticks={[0, 25, 50, 75, 100]}
								tickValues={[0, 0.5, 1, 1.5, 2]}
								scale={["0", "100", "200"]}
								disabled={!strumEnabled}
								ariaLabel="Strum volume"
							/>
						</div>

						<div className="border-t border-line" />

						{/* Accent beat 1 */}
						<div
							className={`flex items-center justify-between ${
								!metronomeEnabled ? "opacity-40" : ""
							}`}
						>
							<span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
								Accent beat 1
							</span>
							<Rocker
								checked={accentEnabled}
								onChange={setAccentEnabled}
								disabled={!metronomeEnabled}
								ariaLabel="Accent beat 1"
							/>
						</div>

						{/* Subdivision */}
						<div className={!metronomeEnabled ? "opacity-40" : ""}>
							<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Subdivision
							</div>
							<Segmented
								options={[
									{ value: "quarter", label: "1/4" },
									{ value: "eighth", label: "1/8" },
									{ value: "sixteenth", label: "1/16" },
								]}
								value={tickMode}
								onChange={(v) => setTickMode(v as TickMode)}
								disabled={!metronomeEnabled}
							/>
						</div>

						{/* Metronome volume */}
						<div className={!metronomeEnabled ? "opacity-40" : ""}>
							<div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Metronome vol.</span>
								<span className="tabular-nums">{Math.round(metronomeGain * 100)}%</span>
							</div>
							<Fader
								min={0}
								max={1}
								step={0.01}
								value={metronomeGain}
								onValue={(v) => {
									setMetronomeGain(v);
									navigator.vibrate?.(10);
								}}
								ticks={[0, 25, 50, 75, 100]}
								tickValues={[0, 0.25, 0.5, 0.75, 1]}
								scale={["0", "50", "100"]}
								disabled={!metronomeEnabled}
								ariaLabel="Metronome volume"
							/>
						</div>

						<div className="border-t border-line" />

						{/* Loop Gap — greyed when Play Once active */}
						<div className={playOnce ? "opacity-40" : ""}>
							<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Loop gap
							</div>
							<Segmented
								options={LOOP_GAP_OPTIONS.map((gap) => ({
									value: String(gap),
									label: `${gap}S`,
								}))}
								value={String(loopGap)}
								onChange={(v) => setLoopGap(Number(v) as LoopGapSeconds)}
								disabled={playOnce}
							/>
						</div>

						{/* Spacebar mode */}
						<div>
							<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Spacebar
							</div>
							<Segmented
								options={[
									{ value: "playPause", label: "Play/Pause" },
									{ value: "tapTempo", label: "Tap" },
								]}
								value={spaceMode}
								onChange={(v) => setSpaceMode(v as "playPause" | "tapTempo")}
							/>
						</div>
					</div>
				</div>

				{/* Mute hint — above the bottom bar, covered when the panel expands */}
				{!mutHintDismissed && (
					<div className="flex items-center justify-center gap-2 px-4 py-1.5 border-t border-line">
						<p className="text-xs text-ink-dim">
							No sound? Check your phone&apos;s mute switch.
						</p>
						<button
							onClick={() => setMutHintDismissed(true)}
							className="shrink-0 text-ink-faint hover:text-ink-dim transition-colors"
							aria-label="Dismiss hint"
						>
							<X size={14} />
						</button>
					</div>
				)}

				<div className="border-t border-line" />

				{/* Always-visible bottom bar */}
				<div
					className="bg-popover flex items-center gap-1.5 px-3 py-2"
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
							className="flex w-14 flex-col items-center text-center leading-none"
						>
							<span className="font-mono text-[24px] font-bold leading-none text-denim">
								{bpm}
							</span>
							<span className="mt-0.75 font-mono text-[8px] uppercase tracking-[0.24em] text-ink-faint">
								BPM
							</span>
						</button>
					</div>

					{/* Loop / Once segmented pill */}
					<div className="flex shrink-0 border border-line-strong">
						<button
							onClick={() => setPlayOnce(false)}
							className={`px-3 py-1.75 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
								!playOnce ? "bg-denim text-on-denim" : "text-ink-dim"
							}`}
						>
							Loop
						</button>
						<button
							onClick={() => setPlayOnce(true)}
							className={`border-l border-line-strong px-3 py-1.75 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
								playOnce ? "bg-denim text-on-denim" : "text-ink-dim"
							}`}
						>
							Once
						</button>
					</div>

					{/* Metronome icon toggle */}
					<button
						onClick={() => setMetronomeEnabled(!metronomeEnabled)}
						aria-label="Metronome"
						aria-pressed={metronomeEnabled}
						className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${
							metronomeEnabled
								? "border-denim text-denim"
								: "border-line-strong text-ink-faint"
						}`}
					>
						<Metronome size={18} />
					</button>

					{/* Chevron — toggles the controls panel */}
					<button
						onClick={() => setShowSheet((v) => !v)}
						className="p-1.5 text-ink-faint hover:text-ink transition-colors duration-150 shrink-0"
					>
						<ChevronUp
							size={20}
							className={`transition-transform duration-300 ${showSheet ? "rotate-180" : ""}`}
						/>
					</button>

					{/* Play/Stop — flush right */}
					<div className="ml-auto flex items-center shrink-0">
						<div
							onClick={handleHitPlayAndPause}
							className={`flex h-11 w-11 items-center justify-center bg-denim text-on-denim transition-all duration-150 active:scale-95 ${
								selectedPattern ? "cursor-pointer" : "opacity-30 pointer-events-none"
							}`}
						>
							{isPlaying ? (
								<CircleStop size={22} strokeWidth={1.5} />
							) : (
								<CirclePlay size={22} strokeWidth={1.5} />
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
