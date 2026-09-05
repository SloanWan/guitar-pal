"use client";

import PatternWorkspace, { type WorkspaceTab } from "@/components/strum/PatternWorkspace";
import StrumPatternLibrary from "@/components/strum/StrumPatternLibrary";
import {
	PRESET_STRUM_PATTERNS,
	TickMode,
	StrumPattern,
	STRUM_BPM_MIN,
	STRUM_BPM_MAX,
	DEFAULT_STRUM_BPM,
	type Bar,
	type ChordProgression,
	type ChordRef,
} from "@/lib/strumPatterns";
import {
	toBars,
	resolveBarChords,
	transposeBarPitches,
	patternBpm,
	normalizeBpm,
} from "@/lib/strumBars";
import { STRUM_PITCHES } from "@/components/strum/useGuitarSampleLoader";
import { setBarChord, barLocalBeatIndex } from "@/lib/strumBarEdit";
import {
	progressionsForPattern,
	nextOrderIndex,
	progressionBarsFromChords,
	progressionCapo,
	syncBarsToPattern,
} from "@/lib/strumProgressions";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

import { useState, useEffect, useRef, useMemo } from "react";

import { useAudioEngine, type BarPitches } from "@/components/strum/useAudioEngine";
import { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import {
	CirclePlay,
	CircleStop,
	ChevronUp,
	SquareMenu,
	Metronome,
	X,
	Play,
	Repeat,
	Volume2,
	Gauge,
	RotateCcw,
} from "lucide-react";
import CreatePatternModal from "@/components/strum/CreatePatternModal";
import ProgressionEditModal from "@/components/strum/ProgressionEditModal";
import { useChordProgressions } from "@/components/strum/useChordProgressions";
import { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import Fader from "@/components/ui/Fader";

const MIN_BPM = STRUM_BPM_MIN;
const MAX_BPM = STRUM_BPM_MAX;

// Device-local memory of where the user was in the workspace, so a refresh
// lands back on the same tab and the same progression.
const TAB_STORAGE_KEY = "strumTab";
const OPEN_PROGRESSION_STORAGE_KEY = "strumOpenProgression";

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

/** Fetches the voicings a bar's ChordRef points at, for the audio engine. */
async function lookupVoicings(ref: {
	root: string;
	suffix: string;
}): Promise<ChordVoicing[] | null> {
	const { data } = await createClient()
		.from("chords")
		.select("chord_voicings(id, label, start_fret, barre_fret, capo, frets, fingers)")
		.eq("root", ref.root)
		.eq("suffix", ref.suffix)
		.single();
	return (data as { chord_voicings: ChordVoicing[] } | null)?.chord_voicings ?? null;
}

export default function StrumPage() {
	// Null until the device-local choice has been read: showing a preset first and
	// swapping it out a tick later reads as a glitch, so the card waits instead.
	const [selectedPattern, setSelectedPattern] = useState<StrumPattern | null>(null);
	const [patternRestored, setPatternRestored] = useState(false);
	const [bpm, setBpm] = useState(() => patternBpm(PRESET_STRUM_PATTERNS[0]));
	const [tickMode, setTickMode] = useState<TickMode>("quarter");
	// Which view of the pattern is on screen: its own bar, or one of the chord
	// progressions written over it.
	const [tab, setTab] = useState<WorkspaceTab>("pattern");
	const [openProgressionId, setOpenProgressionId] = useState<string | null>(null);
	// Live bars being played. On the pattern tab any chord picked is session-only;
	// on the progressions tab the bars come from the open progression.
	const [bars, setBars] = useState<Bar[]>(() => toBars(PRESET_STRUM_PATTERNS[0]));
	const [barPitches, setBarPitches] = useState<BarPitches>([]);

	// Restore the tab first: it needs no data, so it can be applied on mount.
	const workspaceRestoredRef = useRef(false);
	useEffect(() => {
		const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
		queueMicrotask(() => {
			if (savedTab === "pattern" || savedTab === "progressions") setTab(savedTab);
			// Only now may the workspace be written back, or the default would
			// overwrite what was just restored.
			workspaceRestoredRef.current = true;
		});
	}, []);

	function handleBarChordChange(barIdx: number, chord: ConfirmedChord | null) {
		setBars((prev) =>
			setBarChord(
				prev,
				barIdx,
				chord
					? { root: chord.root, suffix: chord.suffix, voicingId: chord.voicingId ?? null }
					: null,
			),
		);
		setBarPitches((prev) =>
			prev.map((pitches, i) => (i === barIdx ? (chord?.pitches ?? null) : pitches)),
		);
	}

	const {
		isPlaying,
		start,
		stop,
		currBeat,
		currCell,
		currBar,
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
	} = useAudioEngine(bars, bpm, tickMode, barPitches);

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
	const {
		progressions,
		progressionsLoading,
		handleSaveProgression,
		handleDeleteProgression,
		handleDeletePatternProgressions,
	} = useChordProgressions(user, loading);

	// The selected pattern's own progressions, in playing order.
	const patternProgressions = useMemo(
		() => (selectedPattern ? progressionsForPattern(progressions, selectedPattern.id) : []),
		[progressions, selectedPattern],
	);
	const openProgression = patternProgressions.find((p) => p.id === openProgressionId) ?? null;

	// What the engine plays: the pattern's own bar, or the open progression's
	// bars. Serialized so the effect below keys on content rather than identity —
	// a progressions reload with unchanged content must not wipe the chords the
	// user picked on the pattern tab this session.
	const sourceBarsKey = JSON.stringify(
		tab === "progressions" && openProgression
			? openProgression.bars
			: toBars(selectedPattern ?? PRESET_STRUM_PATTERNS[0]),
	);

	// The capo only applies to the sequence that declares it; the pattern tab's
	// session chords always sound at concert pitch.
	const activeCapo = tab === "progressions" ? progressionCapo(openProgression) : 0;

	useEffect(() => {
		const next = JSON.parse(sourceBarsKey) as Bar[];
		// queueMicrotask: the codebase's idiom for deferring state writes out of
		// the effect body so they do not cascade renders.
		queueMicrotask(() => {
			setBars(next);
			setBarPitches(next.map(() => null));
		});

		let cancelled = false;
		resolveBarChords(next, lookupVoicings)
			.then((pitches) => {
				if (!cancelled) {
					setBarPitches(transposeBarPitches(pitches, activeCapo, STRUM_PITCHES));
				}
			})
			.catch((err: unknown) => {
				console.error("[StrumPage] chord resolution failed:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [sourceBarsKey, activeCapo]);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	// The progression the editor is open on; null when the editor is closed.
	// New progressions are typed inline instead, never through the editor.
	const [editingProgression, setEditingProgression] = useState<ChordProgression | null>(null);
	const [editingPattern, setEditingPattern] = useState<StrumPattern | null>(null);
	const [showLibrary, setShowLibrary] = useState(false);
	const [mutHintDismissed, setMutHintDismissed] = useState(false);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);

	// Mobile drawer state — three detents, same as the fingerpick drawer
	const [sheetDetent, setSheetDetent] = useState<"closed" | "half" | "full">("closed");
	const showSheet = sheetDetent !== "closed";
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
				handleHitPlayAndPause();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isPlaying]);

	// Restore the initial pattern once, after custom patterns finish loading (they
	// arrive async). A `?pattern=<id>` deep link (e.g. from /home) takes priority
	// over the device-local last-viewed id, and both resolve against presets AND
	// custom patterns so a favourited custom pattern opens correctly.
	const patternRestoredRef = useRef(false);
	useEffect(() => {
		if (patternRestoredRef.current || patternsLoading) return;
		patternRestoredRef.current = true;
		const queryId =
			typeof window !== "undefined"
				? new URLSearchParams(window.location.search).get("pattern")
				: null;
		const savedId = queryId ?? localStorage.getItem("lastStrumPattern");
		const found = savedId
			? [...PRESET_STRUM_PATTERNS, ...customPatterns].find((p) => p.id === savedId)
			: undefined;
		const next = found ?? PRESET_STRUM_PATTERNS[0];
		queueMicrotask(() => {
			setSelectedPattern(next);
			setBpm(patternBpm(next));
			setPatternRestored(true);
		});
	}, [patternsLoading, customPatterns]);

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

	// The progression can only be restored once the list — and the pattern it
	// belongs to — have loaded, so this runs again until the saved one shows up.
	const [progressionRestored, setProgressionRestored] = useState(false);
	useEffect(() => {
		if (progressionRestored || progressionsLoading || !patternRestored) return;
		const savedId = localStorage.getItem(OPEN_PROGRESSION_STORAGE_KEY);
		const found = savedId
			? patternProgressions.find((p) => p.id === savedId)
			: undefined;
		queueMicrotask(() => {
			if (found) {
				setOpenProgressionId(found.id);
				setBpm(bpmFor(found));
			}
			// Restored either way — a saved id the list no longer holds is gone.
			setProgressionRestored(true);
		});
	}, [progressionRestored, progressionsLoading, patternRestored, patternProgressions]);

	useEffect(() => {
		if (!workspaceRestoredRef.current) return;
		localStorage.setItem(TAB_STORAGE_KEY, tab);
		if (openProgressionId) {
			localStorage.setItem(OPEN_PROGRESSION_STORAGE_KEY, openProgressionId);
		} else {
			localStorage.removeItem(OPEN_PROGRESSION_STORAGE_KEY);
		}
	}, [tab, openProgressionId]);

	function handleSelectPattern(pattern: StrumPattern) {
		stop();
		setSelectedPattern(pattern);
		setBpm(patternBpm(pattern));
		setTab("pattern");
		setOpenProgressionId(null);
		localStorage.setItem("lastStrumPattern", pattern.id);
		// Mirror the choice to the account so /home can surface it cross-device.
		saveLastPattern(createClient(), user, "strum", pattern.id).catch(console.error);
	}

	/** The tempo something plays at: the progression's own, else the pattern's. */
	function bpmFor(progression: ChordProgression | null): number {
		if (progression?.bpm !== undefined) return normalizeBpm(progression.bpm);
		return selectedPattern ? patternBpm(selectedPattern) : DEFAULT_STRUM_BPM;
	}

	// The tempo the reset control returns to: whatever is on screen owns it.
	const defaultBpm = bpmFor(tab === "progressions" ? openProgression : null);

	function handleTabChange(next: WorkspaceTab) {
		if (next === tab) return;
		stop();
		setTab(next);
		setBpm(bpmFor(next === "progressions" ? openProgression : null));
	}

	function handleOpenProgression(id: string | null) {
		stop();
		setOpenProgressionId(id);
		setBpm(bpmFor(patternProgressions.find((p) => p.id === id) ?? null));
	}

	/** A typed chord sequence becomes a progression: one bar per chord. */
	function handleAddProgression(chords: ChordRef[]) {
		if (!selectedPattern) return;
		const progression: ChordProgression = {
			id: crypto.randomUUID(),
			patternId: selectedPattern.id,
			bars: progressionBarsFromChords(selectedPattern.beats, chords),
			orderIndex: nextOrderIndex(patternProgressions),
		};
		handleSaveProgression(progression);
		stop();
		setTab("progressions");
		setOpenProgressionId(progression.id);
		setBpm(bpmFor(progression));
	}

	function handleEditProgression(progression: ChordProgression) {
		setEditingProgression(progression);
	}

	function handleProgressionSave(update: {
		bars: Bar[];
		name: string;
		bpm?: number;
		capo: number;
	}) {
		if (!editingProgression) return;
		const next: ChordProgression = { ...editingProgression, ...update };
		handleSaveProgression(next);
		stop();
		if (openProgressionId === next.id) setBpm(bpmFor(next));
	}

	/**
	 * Carry a rhythm edit into the progressions written over the pattern. Bars the
	 * user re-wrote inside a progression keep their own rhythm; see
	 * `syncBarsToPattern`.
	 */
	function syncProgressionsToPattern(previous: StrumPattern, next: StrumPattern) {
		for (const progression of progressionsForPattern(progressions, next.id)) {
			const nextBars = syncBarsToPattern(progression.bars, previous.beats, next.beats);
			if (nextBars !== progression.bars) {
				handleSaveProgression({ ...progression, bars: nextBars });
			}
		}
	}

	/** Deleting a pattern takes the progressions written over it with it. */
	function handleRemovePattern(patternId: string) {
		handleDeleteCustomPattern(patternId);
		handleDeletePatternProgressions(patternId);
		if (openProgression?.patternId === patternId) {
			stop();
			setOpenProgressionId(null);
		}
	}

	function handleRemoveProgression(progression: ChordProgression) {
		handleDeleteProgression(progression.id);
		if (openProgressionId === progression.id) {
			stop();
			setOpenProgressionId(null);
		}
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

	// Step one detent up (closed → half → full) on drag-up / expand gestures.
	function expandSheet() {
		setSheetDetent((d) => (d === "closed" ? "half" : "full"));
	}

	// Step one detent down (full → half → closed) on drag-down / collapse gestures.
	function collapseSheet() {
		setSheetDetent((d) => (d === "full" ? "half" : "closed"));
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
			expandSheet();
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
						onDeletePattern={handleRemovePattern}
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
					// items-start, not centred: the card grows downwards with its tab's
					// content while the tab strip keeps a constant place on screen.
					className="relative h-[calc(100dvh-3.5rem-3.5rem)] md:h-auto md:flex-1 flex items-start justify-center overflow-hidden px-4 py-4 md:px-8 md:py-6"
					onClick={restoreControls}
				>
					{/* Library toggle — scoped to centre column, 768–1024 px only */}
					{!showLibrary && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setShowLibrary(true);
							}}
							className={`absolute top-3 right-3 z-10 lg:hidden flex items-center bg-denim text-on-denim px-2 py-2 transition-all duration-300 active:scale-95 ${
								controlsVisible
									? "opacity-100 pointer-events-auto"
									: "opacity-0 pointer-events-none"
							}`}
						>
							<SquareMenu />
						</button>
					)}
					<div className="flex max-h-full w-full max-w-160 flex-col">
						{!patternRestored ? (
							// Skeleton in the card's shape: tab strip, header, one bar row.
							<div className="flex w-full flex-col gap-2" aria-busy="true">
								<div className="flex gap-3 px-3 py-2">
									<div className="h-2 w-16 animate-pulse bg-denim-tint" />
									<div className="h-2 w-20 animate-pulse bg-denim-tint" />
								</div>
								<div className="flex flex-col gap-4 border border-line bg-step-grid p-5">
									<div className="h-4 w-40 animate-pulse bg-denim-tint" />
									<div className="h-16 w-full animate-pulse bg-denim-tint" />
								</div>
							</div>
						) : selectedPattern ? (
							<PatternWorkspace
								pattern={selectedPattern}
								bars={bars}
								activeCell={{
									barIdx: currBar,
									beatIdx: barLocalBeatIndex(bars, currBeat),
									cellIdx: currCell,
								}}
								tab={tab}
								onTabChange={handleTabChange}
								onBarChordChange={handleBarChordChange}
								progressions={patternProgressions}
								progressionsLoading={progressionsLoading || !progressionRestored}
								selectedProgressionId={openProgressionId}
								onSelectProgression={handleOpenProgression}
								onAddProgression={handleAddProgression}
								onEditProgression={handleEditProgression}
								onDeleteProgression={handleRemoveProgression}
								onEditPattern={
									customPatterns.some((p) => p.id === selectedPattern.id)
										? () => {
												setEditingPattern(selectedPattern);
												setCreateModalOpen(true);
											}
										: undefined
								}
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
					<h2 className="w-full px-5 py-4 shrink-0 border-b border-line font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-denim">
						Controls
					</h2>

					<div className="flex flex-col overflow-y-auto">
						{/* TRANSPORT */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Play size={12} strokeWidth={2} className="shrink-0" />
									Transport
								</span>
								{/* Loop toggle: on = loop the pattern, off = play once */}
								<span className="flex items-center gap-1.5">
									<Repeat size={12} strokeWidth={2} className="shrink-0" />
									<Rocker
										checked={!playOnce}
										onChange={(v) => setPlayOnce(!v)}
										ariaLabel="Loop"
									/>
								</span>
							</div>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleHitPlayAndPause}
									disabled={!selectedPattern}
									aria-label={isPlaying ? "Stop" : "Play"}
									className="flex h-13 flex-1 items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
								>
									{isPlaying ? (
										<CircleStop size={20} strokeWidth={1.5} />
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
							{/* STRUM SOUND — sits directly under the play controls */}
							<div className="flex flex-col gap-3">
								<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
									<span className="flex items-center gap-1.5">
										<Volume2 size={12} strokeWidth={2} className="shrink-0" />
										Strum Sound
									</span>
									<span className="flex items-center gap-2">
										<span className="tabular-nums">
											{Math.round(strumGain * 100)}%
										</span>
										<Rocker
											checked={strumEnabled}
											onChange={setStrumEnabled}
											ariaLabel="Strum sound"
										/>
									</span>
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
						</div>

						{/* TEMPO */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Gauge size={12} strokeWidth={2} className="shrink-0" />
									Tempo
								</span>
								<div className="flex items-center gap-2">
									<span>40–220</span>
									<button
										type="button"
										onClick={() => setBpm(defaultBpm)}
										disabled={bpm === defaultBpm}
										aria-label="Reset tempo to the pattern default"
										title={`Reset to ${defaultBpm} BPM`}
										className="flex items-center justify-center text-ink-faint transition-colors hover:text-denim disabled:pointer-events-none disabled:opacity-30"
									>
										<RotateCcw size={12} strokeWidth={2} />
									</button>
								</div>
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
										className="flex-1 border border-line-strong py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint border-b-denim"
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
						</div>

						{/* METRONOME — sits directly under Tempo. Header toggle enables the
					    metronome; accent on beat 1 is a strum-only extra below it. */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Metronome size={12} strokeWidth={2} className="shrink-0" />
									Metronome
								</span>
								<Rocker
									checked={metronomeEnabled}
									onChange={setMetronomeEnabled}
									ariaLabel="Metronome"
								/>
							</div>
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
				<div className="md:hidden fixed inset-0 z-20" onClick={() => setSheetDetent("closed")} />
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
						sheetDetent === "full"
							? "max-h-[calc(85vh-56px)] overflow-y-auto"
							: sheetDetent === "half"
								? "max-h-[calc(33.333vh-56px)] overflow-y-auto"
								: "max-h-0"
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
							const dy = e.clientY - handleDragStartYRef.current;
							if (dy < -40) {
								// Drag up → expand a detent.
								handleIsDraggingRef.current = false;
								expandSheet();
							} else if (dy > 40) {
								// Drag down → collapse a detent (full → half → closed).
								handleIsDraggingRef.current = false;
								collapseSheet();
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
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Gauge size={12} strokeWidth={2} className="shrink-0" />
									Tempo
								</span>
								<div className="flex items-center gap-2">
									<span className="tabular-nums text-denim">{bpm}</span>
									<button
										type="button"
										onClick={() => setBpm(defaultBpm)}
										disabled={bpm === defaultBpm}
										aria-label="Reset tempo to the pattern default"
										title={`Reset to ${defaultBpm} BPM`}
										className="flex items-center justify-center text-ink-faint transition-colors hover:text-denim disabled:pointer-events-none disabled:opacity-30"
									>
										<RotateCcw size={12} strokeWidth={2} />
									</button>
								</div>
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
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Volume2 size={12} strokeWidth={2} className="shrink-0" />
									Strum Sound
								</span>
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
					className="relative bg-popover flex items-center gap-1.5 px-3 py-2"
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

					{/* Loop icon toggle: on = loop the pattern, off = play once */}
					<button
						onClick={() => setPlayOnce(!playOnce)}
						aria-label="Loop"
						aria-pressed={!playOnce}
						className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${
							!playOnce
								? "border-denim text-denim"
								: "border-line-strong text-ink-faint"
						}`}
					>
						<Repeat size={18} />
					</button>

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

					{/* Chevron — centered in the bar; toggles the controls panel open/closed */}
					<button
						onClick={() => setSheetDetent((d) => (d === "closed" ? "half" : "closed"))}
						aria-label={showSheet ? "Close controls" : "Open controls"}
						className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5 text-ink-faint hover:text-ink transition-colors duration-150"
					>
						<ChevronUp
							size={20}
							className={`transition-transform duration-300 ${showSheet ? "rotate-180" : ""}`}
						/>
					</button>

					{/* Stop + Play — flush right */}
					<div className="ml-auto flex items-center gap-0.5 shrink-0">
						<button
							onClick={stop}
							aria-label="Stop and return to start"
							className={`p-1 text-ink-dim transition-colors duration-150 ${
								isPlaying ? "visible" : "invisible"
							}`}
						>
							<CircleStop size={28} strokeWidth={1.5} />
						</button>
						<div
							onClick={handleHitPlayAndPause}
							className={`flex h-11 w-11 items-center justify-center rounded-none bg-denim text-on-denim transition-all duration-150 active:scale-95 ${
								selectedPattern
									? "cursor-pointer"
									: "opacity-30 pointer-events-none"
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
						syncProgressionsToPattern(editingPattern, pattern);
						if (selectedPattern?.id === pattern.id) {
							setSelectedPattern(pattern);
							// The edit may have moved the pattern's default tempo — adopt it.
							setBpm(patternBpm(pattern));
						}
					} else {
						handleSaveCustomPattern(pattern);
					}
				}}
				editPattern={editingPattern ?? undefined}
				user={user}
			/>

			{editingProgression && (
				<ProgressionEditModal
					open
					onClose={() => setEditingProgression(null)}
					onSave={handleProgressionSave}
					progression={editingProgression}
					patternBpm={selectedPattern ? patternBpm(selectedPattern) : DEFAULT_STRUM_BPM}
				/>
			)}
		</>
	);
}
