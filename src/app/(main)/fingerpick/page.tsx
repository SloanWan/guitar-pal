"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import FingerpickPatternLibrary from "@/components/fingerpick/FingerpickPatternLibrary";
import { useUser } from "@/hooks/useUser";
import {
	fingerpickPatternToScheduleEvents,
	findSlotStartTime,
	getProgressAtTime,
	computeMeasureBoundaries,
	type ScheduleEvent,
	type MeasureBoundary,
} from "@/lib/fingerpickScheduler";
import TabStaveRow, {
	computeMeasureMinWidth,
	CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import {
	useFingerpickAudioEngine,
	type MetronomeSubdivision,
} from "@/components/fingerpick/useFingerpickAudioEngine";
import {
	CirclePlay,
	CirclePause,
	CircleStop,
	SquareMenu,
	ChevronUp,
	Metronome,
} from "lucide-react";

// Count hammer-on / pull-off connections in a measure (each arc needs extra clearance).
function hoPoConnectorCount(measure: Measure): number {
	return measure.slots.reduce(
		(count, slot) =>
			count +
			slot.strings.filter((sf) => sf.technique === "hammer-on" || sf.technique === "pull-off")
				.length,
		0,
	);
}

// Gap between the last row's SVG right edge and the container edge — pure page-level visual choice.
const ROW_TRAILING_PAD = 15;

// Greedy row packer: each measure's minimum width drives wrapping.
// Returns one inner array per row; each entry is the stretched stave width for that measure.
// Rows are scaled to fill exactly (containerWidth − CLEF_WIDTH − ROW_TRAILING_PAD).
function computeAllMeasureWidths(measures: Measure[], containerWidth: number): number[][] {
	// Precompute render data once per measure to avoid double adapter calls.
	const renderData = measures.map((m) => fingerpickToVexFlow(m));
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const widthsFirst = renderData.map((rd, i) =>
		computeMeasureMinWidth(rd.notes, true, hoPoConnectorCount(measures[i])),
	);
	const widthsNonFirst = renderData.map((rd, i) =>
		computeMeasureMinWidth(rd.notes, false, hoPoConnectorCount(measures[i])),
	);

	const rows: number[][] = [];
	let i = 0;
	while (i < measures.length) {
		// Always include at least one measure per row.
		const rowWidths: number[] = [widthsFirst[i]];
		let rowWidth = widthsFirst[i];
		i++;
		// Pack subsequent measures until the next one would overflow the stave area.
		while (i < measures.length) {
			const w = widthsNonFirst[i];
			if (rowWidth + w > staveSpace) break;
			rowWidths.push(w);
			rowWidth += w;
			i++;
		}
		// Stretch widths proportionally so every row fills the container edge-to-edge.
		const scale = staveSpace / rowWidth;
		rows.push(rowWidths.map((w) => w * scale));
	}
	return rows;
}

const LOOP_GAP_OPTIONS = [0, 5, 10] as const;
type LoopGapSeconds = (typeof LOOP_GAP_OPTIONS)[number];

const MIN_BPM = 40;
const MAX_BPM = 220;

// BPM fader tick marks: genre reference tempos. `PERCENTS` are the fixed v3
// visual positions on the 40–220 track; `VALUES` are the exact BPM each tick
// snaps to when clicked; `LABELS` are the genre tooltip shown while hovering the
// segment around each tick.
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

// Higher = tighter/snappier following, lower = smoother/more lag.
// At 20, steady-state lag behind a constant-velocity target is ~v/20 px/s — barely
// perceptible on dense sixteenth-note runs (~8 px) and invisible on slower material.
const CURSOR_LAMBDA = 20;

// ── v3 control primitives ────────────────────────────────────────────────
// Presentational hardware-panel controls scoped to the fingerpick controls
// rack / mobile drawer. Colors are fixed (slate/denim) rather than theme
// tokens because this workspace renders on a fixed light panel surface.

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
					<div
						className="absolute inset-y-0 left-0 bg-denim"
						style={{ width: `${pct}%` }}
					/>
					{/* Genre tooltip — shown while hovering a tick's segment */}
					{hoveredTick !== null && tickLabels && (
						<div
							className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] text-surface"
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
					checked ? "left-5 bg-denim" : "left-0.5 bg-ink-dim"
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
// segment. Used for loop gap, subdivision, and the mobile Loop/Once control.
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

export default function FingerpickPage() {
	const { user, loading } = useUser();
	const {
		patterns,
		customPatterns,
		selectedPattern,
		setSelectedPattern,
		favouriteIds,
		toggleFavourite,
		saveCustomPattern,
		deleteCustomPattern,
	} = useFingerpickPatterns(user, loading);

	const [showLibrary, setShowLibrary] = useState(false);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);
	const [bpm, setBpm] = useState<number>(selectedPattern.bpm);
	// Incremented each time Stop is pressed; triggers the cursor-reset effect below.
	const [cursorResetTick, setCursorResetTick] = useState(0);
	const [showSheet, setShowSheet] = useState(false);
	const [showBpmPopover, setShowBpmPopover] = useState(false);
	// Pixel width of the tab viewer container; 0 until the ResizeObserver fires on mount.
	const [containerWidth, setContainerWidth] = useState(0);
	const [bpmPopoverPos, setBpmPopoverPos] = useState<{ bottom: number; left: number }>({
		bottom: 0,
		left: 0,
	});
	const bpmButtonRef = useRef<HTMLButtonElement>(null);
	const tapTimesRef = useRef<number[]>([]);
	// Tracks the latest BPM value during slider drag so onPointerUp reads the
	// correct final value regardless of React batching.
	const dragBpmRef = useRef(selectedPattern.bpm);
	// True while the user has the slider thumb pressed (drag gesture in progress).
	const isDraggingSliderRef = useRef(false);
	// True if playback was active when the drag started (so we resume on release).
	const wasPlayingRef = useRef(false);

	const {
		isLoaded,
		isPlaying,
		isPaused,
		playOnce,
		setPlayOnce,
		load,
		play,
		pause,
		resume,
		stop,
		getPlaybackProgress,
		metronomeEnabled,
		setMetronomeEnabled,
		metronomeSubdivision,
		setMetronomeSubdivision,
		metronomeGain,
		setMetronomeGain,
		accentEnabled,
		setAccentEnabled,
		noteGain,
		setNoteGain,
		applyBpmChange,
		applyLoopGapChange,
		seekToNote,
	} = useFingerpickAudioEngine();

	// ── Cursor / scroll refs ────────────────────────────────────────────────
	const tabViewerRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | undefined>(undefined);
	// Tracks the last row that was scrolled into view; -1 = none yet.
	const lastScrolledRowRef = useRef(-1);
	// Mirrors `rows` for the RAF closure without needing it as a dep (synced below).
	const rowsRef = useRef<
		Array<{ measures: Measure[]; startMeasureNumber: number; widths: number[] }>
	>([]);
	// One DOM ref per row wrapper div (indexed to match `rows`).
	const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
	// Always-current getter: `getPlaybackProgress` is recreated each render but all
	// versions close over the same audio engine refs, so any version is correct.
	const playbackGetterRef = useRef(getPlaybackProgress);
	// Measure background highlight overlay.
	const measureHighlightRef = useRef<HTMLDivElement>(null);
	// Tracks the last measure index the highlight was positioned at; -1 = none yet.
	const lastMeasureIdxRef = useRef(-1);
	// Schedule events mirroring the audio engine's event list — provides per-note
	// t0/t1 timestamps for the note-to-note interpolation in the RAF loop.
	const scheduleEventsRef = useRef<ScheduleEvent[]>([]);
	// Measure start times for boundary-aware progress tracking (rest-at-start fix).
	const measureBoundariesRef = useRef<MeasureBoundary[]>([]);
	// Exponential-smoothed cursor x — chases targetX every frame so velocity changes
	// at note boundaries don't cause visible stutter.
	const renderedXRef = useRef(0);
	// Previous rAF timestamp; 0 = first frame of new playback (snap instead of smooth).
	const prevTimestampRef = useRef(0);
	// Tracks the loop pass index so a pass boundary triggers a cursor snap rather
	// than a slow exponential chase from the last note back to the first.
	const lastPassIndexRef = useRef(0);
	// Note to seek to on the next play() — set by click-to-seek while stopped,
	// consumed by handlePlay() and cleared by handleStop().
	const pendingSeekRef = useRef<{ measureIndex: number; slotIndex: number } | null>(null);
	// Bottom bar drag-to-open-sheet gesture refs.
	const bottomBarDragStartYRef = useRef<number>(0);
	const bottomBarIsDraggingRef = useRef<boolean>(false);
	// Drag handle drag-to-close gesture refs.
	const handleDragStartYRef = useRef(0);
	const handleIsDraggingRef = useRef(false);
	// Hide-on-scroll state for mobile controls and NavBar.
	const [controlsVisible, setControlsVisible] = useState(true);
	const controlsVisibleRef = useRef(true);
	const lastScrollYRef = useRef(0);
	const scrollUpDistanceRef = useRef(0);
	// True while the RAF loop's scrollIntoView is in flight; suppresses the
	// scroll listener so auto-scroll never triggers the hide behaviour.
	const isAutoScrollingRef = useRef(false);

	// Preload presets on mount so the first Play is instant.
	// load() is stable in intent but re-created each render; the empty-dep array
	// is intentional — we only want one preload call per page mount.
	useEffect(() => {
		void load();
		document.body.classList.add("fingerpick-page");
		return () => document.body.classList.remove("fingerpick-page");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Track the tab viewer's pixel width so the greedy layout can pack measures.
	useEffect(() => {
		const container = tabViewerRef.current;
		if (!container) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setContainerWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	// Hide mobile controls bar (and NavBar via body class) when the user scrolls down;
	// restore after 40 px of upward scroll.
	useEffect(() => {
		const isDesktop = window.innerWidth >= 768;
		// Desktop: scroll source is the tab viewer; mobile: the main scroll container.
		const target: Element | null = isDesktop
			? tabViewerRef.current
			: document.querySelector("main");
		if (!target) return;

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

	function handleSelectPattern(p: FingerpickPattern) {
		stop();
		setSelectedPattern(p);
		setBpm(p.bpm);
		dragBpmRef.current = p.bpm;
		setCursorResetTick((t) => t + 1);
	}

	function handlePlay() {
		const pending = pendingSeekRef.current;
		pendingSeekRef.current = null;
		const startOffset = pending
			? findSlotStartTime(scheduleEventsRef.current, pending.measureIndex, pending.slotIndex)
			: 0;
		play({ ...selectedPattern, bpm }, { loop: true, loopGapSeconds: loopGap }, startOffset);
	}

	function handleStop() {
		stop();
		pendingSeekRef.current = null;
		setCursorResetTick((t) => t + 1);
	}

	function handlePlayPause() {
		if (isPlaying) {
			pause();
		} else if (isPaused) {
			resume();
		} else {
			handlePlay();
		}
	}

	// Used by ±10 buttons and tap tempo — always reschedules immediately.
	function handleBpmChange(newBpm: number) {
		const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, newBpm));
		setBpm(clamped);
		applyBpmChange(clamped);
	}

	// Slider-specific handlers that decouple drag ticks from rescheduling.
	function handleSliderChange(rawValue: number) {
		const clamped = Math.min(MAX_BPM, Math.max(MIN_BPM, rawValue));
		setBpm(clamped);
		dragBpmRef.current = clamped;
		navigator.vibrate?.(10);
		if (!isDraggingSliderRef.current) {
			// Keyboard arrow key on a focused slider — reschedule immediately.
			applyBpmChange(clamped);
		}
		// During pointer drag: display updates but rescheduling is deferred to pointer up.
	}

	function handleSliderPointerDown() {
		isDraggingSliderRef.current = true;
		wasPlayingRef.current = isPlaying;
		if (isPlaying) {
			// Silence audio immediately; saves elapsed position in pausedAtRef so
			// handleSliderPointerUp can resume from the exact same musical position.
			pause();
		}
	}

	function handleSliderPointerUp() {
		isDraggingSliderRef.current = false;
		const finalBpm = dragBpmRef.current;
		const shouldResume = wasPlayingRef.current;
		wasPlayingRef.current = false;
		// applyBpmChange converts pausedAtRef (old-BPM elapsed) to the new-BPM
		// equivalent position; resume() then picks up that converted value.
		applyBpmChange(finalBpm);
		if (shouldResume) {
			resume();
		}
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
		const rawBpm = Math.round(60000 / avgInterval);
		handleBpmChange(rawBpm);
		navigator.vibrate?.(10);
	}

	// ── Bottom bar / sheet gesture handlers ─────────────────────────────────────

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

	// ── Click-to-seek ───────────────────────────────────────────────────────────

	// Snaps the cursor and measure-highlight overlays directly to a note element.
	// Used on seek (discrete user-initiated jump) — bypasses exponential smoothing.
	function snapCursorToNote(noteEl: SVGElement, measureIndex: number): void {
		const playhead = cursorRef.current;
		const measureHL = measureHighlightRef.current;
		const container = tabViewerRef.current;
		if (!playhead || !container) return;

		const svgEl = noteEl.closest<SVGElement>("svg");
		if (!svgEl) return;

		const containerRect = container.getBoundingClientRect();
		const noteRect = noteEl.getBoundingClientRect();
		const svgRect = svgEl.getBoundingClientRect();

		const x0 = noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
		const top = svgRect.top - containerRect.top + container.scrollTop;

		// Snap rendered position so the next RAF tick also snaps (prevTimestampRef = 0
		// is the existing signal for "first frame of playback — snap, don't chase").
		renderedXRef.current = x0;
		prevTimestampRef.current = 0;

		playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
		playhead.style.top = `${top}px`;
		playhead.style.height = `${svgRect.height}px`;
		playhead.style.display = "block";

		if (measureHL) {
			const stavesvg = container.querySelector<SVGElement>(
				`svg[data-stave-${measureIndex}-x]`,
			);
			if (stavesvg) {
				const staveSvgRect = stavesvg.getBoundingClientRect();
				const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
				const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
				measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
				measureHL.style.width = `${sw}px`;
				measureHL.style.top = `${top}px`;
				measureHL.style.height = `${svgRect.height}px`;
				measureHL.style.display = "block";
			}
		}

		// Prevent the RAF loop from re-triggering row/measure transition logic on
		// the very next tick (which would redundantly reposition the overlays).
		lastMeasureIdxRef.current = measureIndex;
		const rowIdx = rowsRef.current.findIndex((row) => {
			const s = row.startMeasureNumber - 1;
			return measureIndex >= s && measureIndex < s + row.measures.length;
		});
		if (rowIdx !== -1) lastScrolledRowRef.current = rowIdx;
	}

	// Clicking anywhere in the tab viewer seeks to the nearest note in the clicked
	// row (nearest by x-distance). Clicks outside all rows clamp to the nearest row.
	function handleTabClick(e: React.MouseEvent<HTMLDivElement>): void {
		// Restore controls visibility on any tab interaction.
		setControlsVisible(true);
		controlsVisibleRef.current = true;
		scrollUpDistanceRef.current = 0;
		window.dispatchEvent(new CustomEvent("fingerpick-controls-restore"));

		const container = tabViewerRef.current;
		if (!container) return;

		const noteEls = Array.from(
			container.querySelectorAll<SVGElement>("[data-measure-index][data-slot-index]"),
		);
		if (noteEls.length === 0) return;

		const allSvgs = Array.from(container.querySelectorAll<SVGElement>("svg"));
		if (allSvgs.length === 0) return;

		const clickYVp = e.clientY;
		const clickXVp = e.clientX;

		// Find the row SVG the click landed in by viewport Y.
		let targetSvg = allSvgs.find((svg) => {
			const r = svg.getBoundingClientRect();
			return clickYVp >= r.top && clickYVp <= r.bottom;
		});

		// Click was between or outside rows — clamp to nearest by Y distance.
		if (!targetSvg) {
			let minDist = Infinity;
			for (const svg of allSvgs) {
				const r = svg.getBoundingClientRect();
				const dist = Math.min(Math.abs(clickYVp - r.top), Math.abs(clickYVp - r.bottom));
				if (dist < minDist) {
					minDist = dist;
					targetSvg = svg;
				}
			}
		}
		if (!targetSvg) return;

		// Notes in the target row only.
		const rowNotes = noteEls.filter((el) => targetSvg!.contains(el));
		if (rowNotes.length === 0) return;

		// Nearest note by X distance.
		let nearestEl: SVGElement | null = null;
		let minXDist = Infinity;
		for (const el of rowNotes) {
			const r = el.getBoundingClientRect();
			const dist = Math.abs(r.left + r.width / 2 - clickXVp);
			if (dist < minXDist) {
				minXDist = dist;
				nearestEl = el;
			}
		}
		if (!nearestEl) return;

		const measureIndex = parseInt(nearestEl.getAttribute("data-measure-index") ?? "0", 10);
		const slotIndex = parseInt(nearestEl.getAttribute("data-slot-index") ?? "0", 10);

		if (isPlaying || isPaused) {
			// Audio engine handles the reschedule (playing) or saved-position update (paused).
			seekToNote(measureIndex, slotIndex);
		} else {
			// Stopped: record the target so handlePlay() starts from here.
			pendingSeekRef.current = { measureIndex, slotIndex };
		}
		snapCursorToNote(nearestEl, measureIndex);
	}

	// Mirror the audio engine's event list so the RAF loop has per-note timestamps
	// for interpolation. Recomputed whenever BPM or pattern changes.
	useEffect(() => {
		scheduleEventsRef.current = fingerpickPatternToScheduleEvents(selectedPattern, bpm);
		measureBoundariesRef.current = computeMeasureBoundaries(selectedPattern, bpm);
	}, [selectedPattern, bpm]);

	// Position cursor and measure highlight at the very first note as soon as the
	// SVG data attributes are available (TabStaveRow renders asynchronously via
	// ResizeObserver + rAF, so we retry each frame until the DOM is ready).
	useEffect(() => {
		let rafId: number;
		function tryInitialPosition() {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafId = requestAnimationFrame(tryInitialPosition);
				return;
			}
			const noteEl = container.querySelector<SVGElement>(
				'[data-measure-index="0"][data-slot-index="0"]',
			);
			const svgEl = noteEl?.closest("svg");
			if (!noteEl || !svgEl) {
				rafId = requestAnimationFrame(tryInitialPosition);
				return;
			}
			const containerRect = container.getBoundingClientRect();
			const noteRect = noteEl.getBoundingClientRect();
			const svgRect = svgEl.getBoundingClientRect();
			const x0 =
				noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
			const top = svgRect.top - containerRect.top + container.scrollTop;

			playhead.style.top = `${top}px`;
			playhead.style.height = `${svgRect.height}px`;
			playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
			playhead.style.display = "block";

			if (measureHL) {
				const stavesvg = container.querySelector<SVGElement>("svg[data-stave-0-x]");
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(stavesvg.getAttribute("data-stave-0-x") ?? "0");
					const sw = parseFloat(stavesvg.getAttribute("data-stave-0-w") ?? "0");
					measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
					measureHL.style.width = `${sw}px`;
					measureHL.style.top = `${top}px`;
					measureHL.style.height = `${svgRect.height}px`;
					measureHL.style.display = "block";
				}
			}
		}
		rafId = requestAnimationFrame(tryInitialPosition);
		return () => cancelAnimationFrame(rafId);
	}, []);

	// When Stop is pressed, cursorResetTick increments and this effect re-runs the
	// same rAF retry loop used on mount — scroll container to top first so the
	// cursor lands in the visible area, then reposition to measure 0 / slot 0.
	// cursorResetTick starts at 0 (mount); the guard skips the initial run so the
	// mount effect handles first positioning without a double-trigger.
	useEffect(() => {
		if (cursorResetTick === 0) return;
		let rafId: number;
		function resetToInitial() {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafId = requestAnimationFrame(resetToInitial);
				return;
			}
			const noteEl = container.querySelector<SVGElement>(
				'[data-measure-index="0"][data-slot-index="0"]',
			);
			const svgEl = noteEl?.closest("svg");
			if (!noteEl || !svgEl) {
				rafId = requestAnimationFrame(resetToInitial);
				return;
			}
			const containerRect = container.getBoundingClientRect();
			const noteRect = noteEl.getBoundingClientRect();
			const svgRect = svgEl.getBoundingClientRect();
			const x0 =
				noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
			const top = svgRect.top - containerRect.top + container.scrollTop;
			playhead.style.top = `${top}px`;
			playhead.style.height = `${svgRect.height}px`;
			playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;
			if (measureHL) {
				const stavesvg = container.querySelector<SVGElement>("svg[data-stave-0-x]");
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(stavesvg.getAttribute("data-stave-0-x") ?? "0");
					const sw = parseFloat(stavesvg.getAttribute("data-stave-0-w") ?? "0");
					measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
					measureHL.style.width = `${sw}px`;
					measureHL.style.top = `${top}px`;
					measureHL.style.height = `${svgRect.height}px`;
				}
			}
		}
		rafId = requestAnimationFrame(resetToInitial);
		return () => cancelAnimationFrame(rafId);
	}, [cursorResetTick]);

	// ── Playback cursor RAF loop ─────────────────────────────────────────────
	// Starts when isPlaying becomes true; stopped on pause/stop or unmount.
	// All cursor updates go through direct DOM mutation — no React setState.
	useEffect(() => {
		if (!isPlaying) {
			if (rafRef.current !== undefined) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = undefined;
			}
			// Reset guards so the next play re-triggers row/measure positioning and
			// snaps renderedX to targetX on the first frame (avoids catch-up slide).
			lastScrolledRowRef.current = -1;
			lastMeasureIdxRef.current = -1;
			prevTimestampRef.current = 0;
			lastPassIndexRef.current = 0;
			// Pause: cursor stays frozen at current position.
			// Stop: handled by the cursorResetTick effect above.
			return;
		}

		function tick(timestamp: number) {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const progress = playbackGetterRef.current();
			if (!progress) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const { elapsed, passIndex } = progress;
			const position = getProgressAtTime(
				scheduleEventsRef.current,
				elapsed,
				measureBoundariesRef.current,
			);
			if (!position) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}
			const { measureIndex, slotIndex } = position;
			const events = scheduleEventsRef.current;
			const currentRows = rowsRef.current;

			// Loop pass boundary: snap cursor instead of smoothly chasing from the
			// last note of the previous pass back to the first note of the new pass.
			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
			}

			const containerRect = container.getBoundingClientRect();

			const noteEl = container.querySelector<SVGElement>(
				`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
			);

			if (!noteEl) {
				// Slot has no DOM element (rest/GhostNote) — drift cursor from measure left
				// edge toward the first non-rest note's position over the rest's duration.
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
					);
					const snapX =
						staveSvgRect.left - containerRect.left + sx + container.scrollLeft;

					const firstNonRestEvent = events.find((e) => e.measureIndex === measureIndex);
					const measureBoundary = measureBoundariesRef.current.find(
						(b) => b.measureIndex === measureIndex,
					);

					let driftX = snapX;
					let didDrift = false;
					if (firstNonRestEvent) {
						const firstNonRestEl = container.querySelector<SVGElement>(
							`[data-measure-index="${measureIndex}"][data-slot-index="${firstNonRestEvent.slotIndex}"]`,
						);
						if (firstNonRestEl) {
							const firstNonRestRect = firstNonRestEl.getBoundingClientRect();
							const x1 =
								firstNonRestRect.left -
								containerRect.left +
								firstNonRestRect.width / 2 +
								container.scrollLeft;
							const measureStart =
								measureBoundary?.startTime ?? firstNonRestEvent.time;
							const restDuration = firstNonRestEvent.time - measureStart;
							const restElapsed = elapsed - measureStart;
							const frac =
								restDuration > 0
									? Math.max(0, Math.min(1, restElapsed / restDuration))
									: 0;
							driftX = snapX + (x1 - snapX) * frac;
							didDrift = true;
						}
					}

					if (didDrift) {
						const prevTime = prevTimestampRef.current;
						if (prevTime === 0) {
							renderedXRef.current = driftX;
						} else {
							const dt = (timestamp - prevTime) / 1000;
							renderedXRef.current +=
								(driftX - renderedXRef.current) *
								(1 - Math.exp(-CURSOR_LAMBDA * dt));
						}
						prevTimestampRef.current = timestamp;
					} else {
						renderedXRef.current = snapX;
						prevTimestampRef.current = 0;
					}
					playhead.style.transform = `translateX(${Math.round(renderedXRef.current - 3)}px)`;

					if (measureIndex !== lastMeasureIdxRef.current) {
						lastMeasureIdxRef.current = measureIndex;
						if (measureHL) {
							const sw = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
							);
							measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
							measureHL.style.width = `${sw}px`;
							measureHL.style.display = "block";
						}
						const rowIdx = currentRows.findIndex((row) => {
							const s = row.startMeasureNumber - 1;
							return measureIndex >= s && measureIndex < s + row.measures.length;
						});
						if (rowIdx !== -1 && rowIdx !== lastScrolledRowRef.current) {
							const svgRect = stavesvg.getBoundingClientRect();
							const top = svgRect.top - containerRect.top + container.scrollTop;
							playhead.style.top = `${top}px`;
							playhead.style.height = `${svgRect.height}px`;
							if (measureHL) {
								measureHL.style.top = `${top}px`;
								measureHL.style.height = `${svgRect.height}px`;
							}
							lastScrolledRowRef.current = rowIdx;
							rowRefs.current[rowIdx]?.scrollIntoView({
								behavior: "smooth",
								block: "center",
							});
						}
					}
				}
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const noteRect = noteEl.getBoundingClientRect();
			const x0 = noteRect.left - containerRect.left + noteRect.width / 2;

			// Find the schedule event for the current note and the next event after it.
			const t0Event = events.find(
				(e) => e.measureIndex === measureIndex && e.slotIndex === slotIndex,
			);
			const t0 = t0Event?.time ?? elapsed;
			const nextEvent = events.find((e) => e.time > t0);

			// True when this is the last note in its measure or the last note overall —
			// drift to the measure's right edge rather than interpolating toward the next note.
			const isLastNoteInMeasure = !nextEvent || nextEvent.measureIndex !== measureIndex;

			let targetX = x0;
			if (isLastNoteInMeasure) {
				const lastEvent = events[events.length - 1];
				const noteDuration =
					t0Event?.duration ?? (lastEvent ? Math.max(0.1, lastEvent.time - t0 + 0.5) : 1);
				const frac = Math.max(0, Math.min(1, (elapsed - t0) / noteDuration));
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
					);
					const sw = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
					);
					const measureRight = staveSvgRect.left - containerRect.left + sx + sw;
					targetX = x0 + (measureRight - x0) * frac;
				}
			} else if (nextEvent) {
				// Interpolate between consecutive notes in the same measure.
				// When x1 < x0 the next note is on a different row; substitute the current
				// measure's right edge as x1 so the cursor keeps drifting rightward.
				const nextEl = container.querySelector<SVGElement>(
					`[data-measure-index="${nextEvent.measureIndex}"][data-slot-index="${nextEvent.slotIndex}"]`,
				);
				if (nextEl) {
					const nRect = nextEl.getBoundingClientRect();
					const x1 = nRect.left - containerRect.left + nRect.width / 2;
					const frac = Math.max(0, Math.min(1, (elapsed - t0) / (nextEvent.time - t0)));
					if (x1 >= x0) {
						targetX = x0 + (x1 - x0) * frac;
					} else {
						// next note is on a different row — drift to measure right edge
						const stavesvg = container.querySelector<SVGElement>(
							`svg[data-stave-${measureIndex}-x]`,
						);
						if (stavesvg) {
							const staveSvgRect = stavesvg.getBoundingClientRect();
							const sx = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
							);
							const sw = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
							);
							const measureRight = staveSvgRect.left - containerRect.left + sx + sw;
							targetX = x0 + (measureRight - x0) * frac;
						}
					}
				}
			}

			// Exponential smoothing: rendered position chases target continuously so
			// per-note velocity changes never cause a visible decelerate/accelerate stutter.
			// First frame of a new playback session: snap directly to avoid a catch-up slide.
			const prevTime = prevTimestampRef.current;
			if (prevTime === 0) {
				renderedXRef.current = targetX;
			} else {
				const dt = (timestamp - prevTime) / 1000;
				renderedXRef.current +=
					(targetX - renderedXRef.current) * (1 - Math.exp(-CURSOR_LAMBDA * dt));
			}
			prevTimestampRef.current = timestamp;

			playhead.style.transform = `translateX(${Math.round(renderedXRef.current - 3)}px)`;

			// Row transition: update vertical position for both overlays and auto-scroll.
			const rowIdx = currentRows.findIndex((row) => {
				const s = row.startMeasureNumber - 1;
				return measureIndex >= s && measureIndex < s + row.measures.length;
			});
			if (rowIdx !== -1 && rowIdx !== lastScrolledRowRef.current) {
				const svgEl = noteEl.closest("svg");
				const svgRect = svgEl?.getBoundingClientRect();
				if (svgRect) {
					const top = svgRect.top - containerRect.top + container.scrollTop;
					playhead.style.top = `${top}px`;
					playhead.style.height = `${svgRect.height}px`;
					if (measureHL) {
						measureHL.style.top = `${top}px`;
						measureHL.style.height = `${svgRect.height}px`;
					}
				}
				lastScrolledRowRef.current = rowIdx;
				prevTimestampRef.current = 0;
				isAutoScrollingRef.current = true;
				window.dispatchEvent(new CustomEvent("fingerpick-autoscroll-start"));
				rowRefs.current[rowIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
				setTimeout(() => {
					isAutoScrollingRef.current = false;
					window.dispatchEvent(new CustomEvent("fingerpick-autoscroll-end"));
				}, 500);
			}

			// Measure transition: update the measure background highlight.
			if (measureIndex !== lastMeasureIdxRef.current) {
				lastMeasureIdxRef.current = measureIndex;
				if (measureHL) {
					const stavesvg = container.querySelector<SVGElement>(
						`svg[data-stave-${measureIndex}-x]`,
					);
					if (stavesvg) {
						const svgRect = stavesvg.getBoundingClientRect();
						const sx = parseFloat(
							stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
						);
						const sw = parseFloat(
							stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
						);
						measureHL.style.left = `${svgRect.left - containerRect.left + sx}px`;
						measureHL.style.width = `${sw}px`;
						measureHL.style.display = "block";
					}
				}
			}

			rafRef.current = requestAnimationFrame(tick);
		}

		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== undefined) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = undefined;
			}
		};
	}, [isPlaying]);

	// Spacebar toggles Play/Pause. Skips when focus is inside a text/select element.
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				(e.target instanceof HTMLInputElement && e.target.type !== "range") ||
				e.target instanceof HTMLSelectElement ||
				e.target instanceof HTMLTextAreaElement
			)
				return;
			if (e.code === "Space") {
				e.preventDefault();
				handlePlayPause();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlaying, isPaused, isLoaded, bpm, loopGap]);

	// Greedy row layout driven by content width; guard: render nothing until the
	// ResizeObserver fires with the real container width on mount.
	const rows = useMemo(() => {
		if (containerWidth === 0) return [];
		const widthRows = computeAllMeasureWidths(selectedPattern.measures, containerWidth);
		let offset = 0;
		return widthRows.map((rowWidths) => {
			const start = offset;
			const rowMeasures = selectedPattern.measures.slice(start, start + rowWidths.length);
			offset += rowWidths.length;
			return { measures: rowMeasures, startMeasureNumber: start + 1, widths: rowWidths };
		});
	}, [selectedPattern.measures, containerWidth]);

	// Keep refs in sync with the latest render values so the RAF closure never goes stale.
	// useEffect (not inline assignment) satisfies react-hooks/refs; the one-frame lag
	// is harmless — getPlaybackProgress reads audio engine refs (never React state), and
	// rows changes only on resize/pattern edit, not mid-playback.
	useEffect(() => {
		rowsRef.current = rows;
	}, [rows]);
	useEffect(() => {
		playbackGetterRef.current = getPlaybackProgress;
	}, [getPlaybackProgress]);

	return (
		<>
			<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-slate-50">
				{/* Left sidebar — lg: static; below lg: slide-in overlay */}
				<div
					className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-slate-200 bg-white flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
						showLibrary ? "translate-x-0" : "-translate-x-full"
					}`}
				>
					<FingerpickPatternLibrary
						patterns={patterns}
						customPatterns={customPatterns}
						selectedPattern={selectedPattern}
						setSelectedPattern={handleSelectPattern}
						favouriteIds={favouriteIds}
						toggleFavourite={toggleFavourite}
						onSaveCustom={saveCustomPattern}
						onDeleteCustom={deleteCustomPattern}
						onClose={() => setShowLibrary(false)}
						user={user}
					/>
				</div>

				{/* Backdrop — tap outside to close library on mobile/tablet */}
				{showLibrary && (
					<div
						className="fixed inset-0 z-30 bg-black/20 lg:hidden"
						onClick={() => setShowLibrary(false)}
					/>
				)}

				{/* Centre — TAB viewer
			    md: fixed-height column → inner wrapper fills it (flex-1 + min-h-0)
			    → title is shrink-0 → measures scroll vertically inside min-h-0 container.
			    Mobile: no height constraint, page scroll handles overflow naturally. */}
				<div className="md:flex-1 flex flex-col px-4 md:px-8 py-6 md:py-8 md:overflow-hidden">
					<div className="relative w-full max-w-4xl mx-auto flex flex-col min-h-0 md:flex-1">
						<div className="mb-4 shrink-0">
							<h1 className="text-lg font-semibold text-slate-700">
								{selectedPattern.name}
							</h1>
							<p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
								{bpm} BPM &middot; {selectedPattern.timeSignature[0]}/
								{selectedPattern.timeSignature[1]}
							</p>
						</div>

						{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport.
					    position:relative anchors the cursor overlay div. */}
						<div
							ref={tabViewerRef}
							data-tab-viewer
							className="relative min-h-0 min-w-0 overflow-hidden overflow-y-auto bg-white rounded-xl border border-slate-100 cursor-pointer"
							onClick={handleTabClick}
						>
							{/* Measure background highlight — updated only on measure transitions. */}
							<div
								ref={measureHighlightRef}
								aria-hidden="true"
								className="absolute pointer-events-none"
								style={{
									display: "none",
									backgroundColor: "rgba(74, 111, 165, 0.07)",
									borderRadius: 3,
								}}
							/>
							{/* Playhead line — sits BEFORE the SVG rows in DOM order so it renders
						    behind VexFlow note numbers; translateX updated every RAF frame. */}
							<div
								ref={cursorRef}
								aria-hidden="true"
								className="absolute pointer-events-none"
								style={{
									display: "none",
									width: 6,
									left: 0,
									backgroundColor: "rgba(74, 111, 165, 0.5)",
									borderRadius: 5,
								}}
							/>
							<div className="flex flex-col pb-20 md:pb-0">
								{rows.map((row, rowIdx) => (
									<div
										key={row.measures[0].id}
										ref={(el) => {
											rowRefs.current[rowIdx] = el;
										}}
									>
										<TabStaveRow
											measures={row.measures}
											startMeasureNumber={row.startMeasureNumber}
											startMeasureIndex={row.startMeasureNumber - 1}
											measureWidths={row.widths}
										/>
									</div>
								))}
							</div>
						</div>

						{/* Mobile library toggle */}
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
					</div>
				</div>

				{/* Right panel — controls */}
				<div className="hidden md:flex w-full border-t border-line bg-popover md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex-col">
					<h2 className="w-full px-5 py-4 shrink-0 border-b border-line font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-ink-faint">
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
									onClick={isLoaded ? handlePlayPause : undefined}
									disabled={!isLoaded}
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
									onClick={handleStop}
									disabled={!isPlaying && !isPaused}
									aria-label="Stop and return to start"
									className="flex h-13 flex-1 items-center justify-center border border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint disabled:pointer-events-none disabled:opacity-30"
								>
									<CircleStop size={20} strokeWidth={1.5} />
								</button>
							</div>
							{!isLoaded && (
								<p className="text-center font-mono text-[10px] tracking-wide text-ink-dim">
									Loading samples…
								</p>
							)}
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
									<span
										aria-hidden="true"
										className="absolute inset-0 opacity-[0.09]"
									>
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
								onValue={handleSliderChange}
								onDragStart={handleSliderPointerDown}
								onDragEnd={handleSliderPointerUp}
								ticks={BPM_TICK_PERCENTS}
								tickValues={BPM_TICK_VALUES}
								tickLabels={BPM_TICK_LABELS}
								scale={["40", "130", "220"]}
								ariaLabel="Tempo in BPM"
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
										onClick={() => handleBpmChange(bpm + delta)}
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
										onClick={() => handleBpmChange(bpm + delta)}
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
								<Rocker
									checked={playOnce}
									onChange={setPlayOnce}
									ariaLabel="Play once"
								/>
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
									onChange={(v) => {
										const gap = Number(v) as LoopGapSeconds;
										setLoopGap(gap);
										applyLoopGapChange(gap);
									}}
									disabled={playOnce}
								/>
							</div>
						</div>

						{/* NOTE SOUND */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Note Sound</span>
								<span className="tabular-nums">{Math.round(noteGain * 100)}%</span>
							</div>
							<Fader
								min={0}
								max={2}
								step={0.01}
								value={noteGain}
								onValue={(v) => {
									setNoteGain(v);
									navigator.vibrate?.(10);
								}}
								ticks={[0, 25, 50, 75, 100]}
								tickValues={[0, 0.5, 1, 1.5, 2]}
								scale={["0", "100", "200"]}
								ariaLabel="Note volume"
							/>
						</div>

						{/* METRONOME */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Metronome</span>
								<span className="tabular-nums">
									{Math.round(metronomeGain * 100)}%
								</span>
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
									value={metronomeSubdivision}
									onChange={(v) =>
										setMetronomeSubdivision(v as MetronomeSubdivision)
									}
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
					className="md:hidden fixed z-60 bg-popover rounded-xl border border-line shadow-lg px-4 py-4 flex items-center justify-center -translate-x-1/2"
					style={{ bottom: bpmPopoverPos.bottom, left: bpmPopoverPos.left }}
				>
					<input
						type="range"
						min={MIN_BPM}
						max={MAX_BPM}
						value={bpm}
						onChange={(e) => handleSliderChange(Number(e.target.value))}
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

			{/* Backdrop — intercepts taps outside the drawer to close it without triggering tab seek */}
			{showSheet && (
				<div className="md:hidden fixed inset-0 z-20" onClick={() => setShowSheet(false)} />
			)}

			{/* ── Unified mobile drawer ────────────────────────────────────────── */}
			<div
				className="md:hidden fixed bottom-0 left-0 right-0 z-30 rounded-t-2xl bg-popover border-t border-line-strong shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden transition-transform duration-300 ease-out"
				style={{ transform: controlsVisible ? "translateY(0)" : "translateY(100%)" }}
				onPointerDown={(e) => {
					if (!bpmButtonRef.current?.contains(e.target as Node)) {
						setShowBpmPopover(false);
					}
				}}
			>
				{/* Expandable controls panel — max-height transition reveals/hides content */}
				<div
					className={`bg-popover overflow-hidden transition-[max-height] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${
						showSheet ? "max-h-[calc(33.333vh-56px)] overflow-y-auto" : "max-h-0"
					}`}
				>
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
						<div className="w-9 h-1 rounded-full bg-line-strong" />
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
										onClick={() => handleBpmChange(bpm + delta)}
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
										onClick={() => handleBpmChange(bpm + delta)}
										className="flex-1 border border-line-strong py-1.75 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
									>
										{label}
									</button>
								))}
							</div>
							<Fader
								min={MIN_BPM}
								max={MAX_BPM}
								step={1}
								value={bpm}
								onValue={handleSliderChange}
								onDragStart={handleSliderPointerDown}
								onDragEnd={handleSliderPointerUp}
								ticks={BPM_TICK_PERCENTS}
								tickValues={BPM_TICK_VALUES}
								tickLabels={BPM_TICK_LABELS}
								scale={["40", "130", "220"]}
								ariaLabel="Tempo in BPM"
							/>
						</div>

						{/* Note Sound volume */}
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Note Sound</span>
								<span className="tabular-nums">{Math.round(noteGain * 100)}%</span>
							</div>
							<Fader
								min={0}
								max={2}
								step={0.01}
								value={noteGain}
								onValue={(v) => {
									setNoteGain(v);
									navigator.vibrate?.(10);
								}}
								ticks={[0, 25, 50, 75, 100]}
								tickValues={[0, 0.5, 1, 1.5, 2]}
								scale={["0", "100", "200"]}
								ariaLabel="Note volume"
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
								value={metronomeSubdivision}
								onChange={(v) => setMetronomeSubdivision(v as MetronomeSubdivision)}
								disabled={!metronomeEnabled}
							/>
						</div>

						{/* Metronome volume */}
						<div className={!metronomeEnabled ? "opacity-40" : ""}>
							<div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								<span>Metronome vol.</span>
								<span className="tabular-nums">
									{Math.round(metronomeGain * 100)}%
								</span>
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

						{/* Loop Gap */}
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
								onChange={(v) => {
									const gap = Number(v) as LoopGapSeconds;
									setLoopGap(gap);
									applyLoopGapChange(gap);
								}}
								disabled={playOnce}
							/>
						</div>
					</div>
				</div>

				<div className="border-t border-line" />

				{/* Always-visible bottom bar */}
				<div
					className="bg-popover/95 backdrop-blur-sm flex items-center gap-1.5 px-3 py-2"
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

					{/* Chevron — toggles the controls panel open/closed */}
					<button
						onClick={() => setShowSheet((v) => !v)}
						className="p-1.5 rounded-full text-ink-faint hover:text-ink transition-colors duration-150 shrink-0"
					>
						<ChevronUp
							size={20}
							className={`transition-transform duration-300 ${showSheet ? "rotate-180" : ""}`}
						/>
					</button>

					{/* Stop + Play/Pause — flush right */}
					<div className="ml-auto flex items-center gap-0.5 shrink-0">
						<button
							onClick={handleStop}
							className={`p-1 text-ink-dim transition-colors duration-150 ${
								isPlaying || isPaused ? "visible" : "invisible"
							}`}
						>
							<CircleStop size={28} strokeWidth={1.5} />
						</button>
						<div
							onClick={isLoaded ? handlePlayPause : undefined}
							className={`transition-all duration-150 active:scale-95 ${
								isLoaded
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
		</>
	);
}
