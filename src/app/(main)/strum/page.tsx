"use client";

import StepGridCard from "@/components/strum/StepGridCard";
import BpmSlider from "@/components/strum/BpmSlider";
import StrumPatternLibrary from "@/components/strum/StrumPatternLibrary";
import { PRESET_STRUM_PATTERNS, TickMode, StrumPattern } from "@/lib/strumPatterns";

import { useState, useEffect, useRef } from "react";

import { useAudioEngine } from "@/components/strum/useAudioEngine";
import { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import {
	CirclePlay,
	CirclePause,
	CircleStop,
	ChevronUp,
	SquareMenu,
	Metronome,
	X,
} from "lucide-react";
import CreatePatternModal from "@/components/strum/CreatePatternModal";
import { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import { useUser } from "@/hooks/useUser";

const MIN_BPM = 40;
const MAX_BPM = 220;

const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

// ── v3 control primitives ────────────────────────────────────────────────
// Presentational hardware-panel controls ported verbatim from the fingerpick
// controls rack / mobile drawer. Colors are driven by the v3 design tokens
// (bg-panel, bg-ink, bg-denim, …) so they track the active theme.

interface FaderProps {
	min: number;
	max: number;
	step: number;
	value: number;
	onValue: (value: number) => void;
	onDragStart?: () => void;
	onDragEnd?: () => void;
	// Tick positions as track-width percentages (0–100).
	ticks: number[];
	// Snap targets parallel to `ticks`; when set, each tick becomes clickable and
	// jumps the value directly to its target.
	tickValues?: number[];
	// Labels parallel to `ticks`; when set, hovering a tick's segment shows a tooltip.
	tickLabels?: string[];
	// Scale labels rendered space-between beneath the track.
	scale: string[];
	disabled?: boolean;
	ariaLabel: string;
}

// Hardware fader: 3px track, denim fill, knurled 10×18 thumb, semantic ticks
// and a scale row. Draggable via pointer capture; keyboard arrows/page keys.
function Fader({
	min,
	max,
	step,
	value,
	onValue,
	onDragStart,
	onDragEnd,
	ticks,
	tickValues,
	tickLabels,
	scale,
	disabled,
	ariaLabel,
}: FaderProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);
	const [hoveredTick, setHoveredTick] = useState<number | null>(null);
	const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

	// Segment around tick i spans the midpoints to its neighbours (first starts at
	// 0%, last ends at 100%). Returns the tick index whose segment contains p, or null.
	function segmentIndexAt(p: number): number | null {
		if (!tickLabels) return null;
		for (let i = 0; i < ticks.length; i++) {
			const start = i === 0 ? 0 : (ticks[i - 1] + ticks[i]) / 2;
			const end = i === ticks.length - 1 ? 100 : (ticks[i] + ticks[i + 1]) / 2;
			if (p >= start && p < end) return i;
		}
		return null;
	}
	function handleTrackMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		if (draggingRef.current || !tickLabels) return;
		const el = trackRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 0;
		const next = segmentIndexAt(p);
		setHoveredTick((prev) => (prev === next ? prev : next));
	}
	function handleTrackMouseLeave() {
		setHoveredTick(null);
	}

	function snap(raw: number): number {
		const clamped = Math.min(max, Math.max(min, raw));
		const stepped = Math.round((clamped - min) / step) * step + min;
		return Math.min(max, Math.max(min, stepped));
	}
	// Magnetic tick snapping: if raw maps within ~3% of the range of a tick value,
	// snap to that tick so the thumb visibly "catches" on ticks while dragging.
	function magnetize(raw: number): number {
		if (!tickValues) return raw;
		const threshold = (max - min) * 0.03;
		let best = raw;
		let bestDist = threshold;
		for (const tv of tickValues) {
			const d = Math.abs(raw - tv);
			if (d <= bestDist) {
				bestDist = d;
				best = tv;
			}
		}
		return best;
	}
	function valueFromClientX(clientX: number): number {
		const el = trackRef.current;
		if (!el) return value;
		const rect = el.getBoundingClientRect();
		const p = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
		return magnetize(snap(min + p * (max - min)));
	}
	function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
		if (disabled) return;
		draggingRef.current = true;
		setHoveredTick(null);
		e.currentTarget.setPointerCapture(e.pointerId);
		onDragStart?.();
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return;
		onValue(valueFromClientX(e.clientX));
	}
	function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
		if (!draggingRef.current) return;
		draggingRef.current = false;
		e.currentTarget.releasePointerCapture(e.pointerId);
		onDragEnd?.();
	}
	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (disabled) return;
		let next: number;
		switch (e.key) {
			case "ArrowLeft":
			case "ArrowDown":
				next = value - step;
				break;
			case "ArrowRight":
			case "ArrowUp":
				next = value + step;
				break;
			case "PageDown":
				next = value - step * 10;
				break;
			case "PageUp":
				next = value + step * 10;
				break;
			default:
				return;
		}
		e.preventDefault();
		onValue(snap(next));
	}

	return (
		<div className={`select-none ${disabled ? "pointer-events-none" : ""}`}>
			<div
				role="slider"
				aria-label={ariaLabel}
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={Math.round(value)}
				tabIndex={disabled ? -1 : 0}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onKeyDown={handleKeyDown}
				className="relative flex h-7 cursor-ew-resize touch-none items-center select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-denim"
			>
				<div
					ref={trackRef}
					className="relative h-0.75 w-full touch-none select-none bg-line-strong"
					onMouseMove={handleTrackMouseMove}
					onMouseLeave={handleTrackMouseLeave}
				>
					<div className="absolute inset-y-0 left-0 bg-denim" style={{ width: `${pct}%` }} />
					{/* Genre tooltip — shown while hovering a tick's segment */}
					{hoveredTick !== null && tickLabels && (
						<div
							className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap bg-(--modal-bg) border border-line px-1.5 py-0.5 text-[10px] text-ink"
							style={{
								left: `${ticks[hoveredTick]}%`,
								bottom: "calc(100% + 10px)",
							}}
						>
							{tickLabels[hoveredTick]}
						</div>
					)}
					<div
						className="absolute top-1/2 h-4.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border border-panel bg-ink"
						style={{ left: `${pct}%` }}
					>
						<span
							aria-hidden="true"
							className="absolute inset-x-0.5 inset-y-1"
							style={{
								background:
									"repeating-linear-gradient(90deg, var(--bg-panel) 0 1px, transparent 1px 3px)",
							}}
						/>
					</div>
					<div aria-hidden="true" className="absolute inset-x-0 top-full h-1.5">
						{ticks.map((t) => (
							<span
								key={t}
								className="absolute top-0.5 h-1 w-px bg-ink-faint"
								style={{ left: `${t}%` }}
							/>
						))}
					</div>
					{/* Click-to-snap hit areas over each tick — stop propagation so pressing
					    a tick jumps to its value instead of starting a track drag. */}
					{tickValues &&
						ticks.map((t, i) => (
							<button
								key={t}
								type="button"
								tabIndex={-1}
								aria-hidden="true"
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => onValue(tickValues[i])}
								className="absolute top-full h-2.5 w-4 -translate-x-1/2 cursor-pointer touch-none select-none focus:outline-none"
								style={{ left: `${t}%` }}
							/>
						))}
				</div>
			</div>
			<div className="mt-2 flex justify-between font-mono text-[8px] tracking-[0.08em] text-ink-faint">
				{scale.map((s, i) => (
					<span key={i}>{s}</span>
				))}
			</div>
		</div>
	);
}

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
								<span>Space</span>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleHitPlayAndPause}
									disabled={!selectedPattern}
									aria-label={isPlaying ? "Pause" : "Play"}
									className="flex h-13 flex-1 items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
								>
									{isPlaying ? (
										<CirclePause size={20} strokeWidth={1.5} />
									) : (
										<CirclePlay size={20} strokeWidth={1.5} />
									)}
								</button>
								<button
									type="button"
									onClick={stop}
									disabled={!isPlaying}
									aria-label="Stop and return to start"
									className="flex h-13 flex-1 items-center justify-center border border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint disabled:pointer-events-none disabled:opacity-30"
								>
									<CircleStop size={20} strokeWidth={1.5} />
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
							<BpmSlider
								bpm={bpm}
								min={MIN_BPM}
								max={MAX_BPM}
								isPlaying={isPlaying}
								setBpm={setBpm}
								start={start}
								stop={stop}
							/>
							{/* Steppers: −10 / −1 / TAP / +1 / +10 */}
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

			{/* Library toggle — fixed below navbar, mobile/tablet only */}
			{!showLibrary && (
				<button
					onClick={() => setShowLibrary(true)}
					className={`fixed top-17 right-4 z-30 lg:hidden flex items-center gap-2 bg-denim text-on-denim text-sm font-semibold px-2 py-2 transition-all duration-300 active:scale-95 ${
						controlsVisible
							? "opacity-100 pointer-events-auto"
							: "opacity-0 pointer-events-none"
					}`}
				>
					<SquareMenu />
				</button>
			)}

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

					{/* Stop + Play/Pause — flush right */}
					<div className="ml-auto flex items-center gap-0.5 shrink-0">
						<button
							onClick={stop}
							className={`p-1 text-ink-dim transition-colors duration-150 ${
								isPlaying ? "visible" : "invisible"
							}`}
						>
							<CircleStop size={28} strokeWidth={1.5} />
						</button>
						<div
							onClick={handleHitPlayAndPause}
							className={`flex h-11 w-11 items-center justify-center bg-denim text-on-denim transition-all duration-150 active:scale-95 ${
								selectedPattern ? "cursor-pointer" : "opacity-30 pointer-events-none"
							}`}
						>
							{isPlaying ? (
								<CirclePause size={22} strokeWidth={1.5} />
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
