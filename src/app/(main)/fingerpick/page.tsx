"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import FingerpickPatternLibrary from "@/components/fingerpick/FingerpickPatternLibrary";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import { useAutoScroll } from "@/components/fingerpick/useAutoScroll";
import { useHideOnScroll } from "@/components/fingerpick/useHideOnScroll";
import { useClickToSeek } from "@/components/fingerpick/useClickToSeek";
import {
	chordFretHints,
	chordRegionEnd,
	effectiveChords,
	heldButUnplucked,
	offShapeStrings,
	patternCapo,
	patternHasChords,
	setPatternCapo,
	type FretHint,
} from "@/lib/fingerpickChords";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import { selectRefVoicing } from "@/lib/strumBars";
import { chordVoicingToVexChords } from "@/lib/chordVoicingToVexChords";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";
import { vexChordDefToSVGProps } from "@/components/chords/ChordDiagram";
import ChordShapeStrip, { CHORD_STRIP_ASPECT } from "@/components/fingerpick/ChordShapeStrip";
import ChordViewToggle from "@/components/strum/ChordViewToggle";
import type { ChordLabel } from "@/lib/fingerpickToVexFlow";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
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
	Loader2,
	Play,
	Gauge,
	Repeat,
	Volume2,
	RotateCcw,
	ChevronsDown,
} from "lucide-react";
import Fader from "@/components/ui/Fader";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import Rocker from "@/components/ui/Rocker";
import Segmented from "@/components/fingerpick/Segmented";
import {
	CHORD_SHAPE_WIDTH_DEFAULT,
	CHORD_SHAPE_WIDTH_MAX,
	CHORD_SHAPE_WIDTH_MIN,
	SCROLL_SPEED_DEFAULT,
	SCROLL_SPEED_MAX,
	SCROLL_SPEED_MIN,
	readLastPatternId,
	useFingerpickPrefs,
	writeLastPatternId,
} from "@/components/fingerpick/useFingerpickPrefs";
import {
	BPM_TICK_LABELS,
	BPM_TICK_PERCENTS,
	BPM_TICK_VALUES,
	LOOP_GAP_OPTIONS,
	MAX_BPM,
	MIN_BPM,
	type LoopGapSeconds,
} from "@/components/fingerpick/playbackConstants";

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
		isLoading,
	} = useFingerpickPatterns(user, loading);

	const [showLibrary, setShowLibrary] = useState(false);
	// The scrolling tab viewer; the overlays, auto-scroll and click-to-seek all work inside it.
	const tabViewerRef = useRef<HTMLDivElement>(null);
	const [bpm, setBpm] = useState<number>(selectedPattern.bpm);
	// Repeats flattened into a linear playback timeline (the rendered staves stay compact).
	// Memoized on selectedPattern ONLY — expansion is bpm-independent (bpm is applied when
	// events are built from expanded.pattern), and a single memoized object keeps the audio
	// engine, the cursor event mirror, and the origin-index map all on one consistent
	// expansion. See src/lib/fingerpickRepeats.ts.
	const expanded = useMemo(() => expandFingerpickPattern(selectedPattern), [selectedPattern]);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);
	// Remembered view settings: chord line view and shape size, off-shape
	// colouring, auto-scroll speed.
	const {
		chordView,
		setChordView,
		chordShapeWidth,
		setChordShapeWidth,
		offShapeOn,
		setOffShapeOn,
		scrollSpeed,
		setScrollSpeed,
	} = useFingerpickPrefs();
	// Auto-scroll: the tab creeps upward at a set speed for reading along without
	// a hand free. Off by default; the speed is remembered.
	const {
		contentRef: rowsContainerRef,
		setAutoScroll,
		tabOverflows,
		autoScrollActive,
	} = useAutoScroll({ viewerRef: tabViewerRef, scrollSpeed, patternId: selectedPattern.id });
	const hasChords = patternHasChords(selectedPattern.measures);
	const showChordDiagrams = hasChords && chordView === "diagram";
	const chordShapeSize = useMemo(
		() => ({
			width: chordShapeWidth,
			height: Math.round(chordShapeWidth * CHORD_STRIP_ASPECT),
		}),
		[chordShapeWidth],
	);
	// Shapes for the chord line's diagram view: the player's own voicings, and
	// the library's for every chord the pattern names, through the shared cache.
	const { voicings: userVoicings } = useUserChordVoicings(
		showChordDiagrams ? user : null,
		loading || !showChordDiagrams,
	);
	const chordRefs = useMemo(
		() =>
			showChordDiagrams
				? selectedPattern.measures.flatMap((m) =>
						m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : [])),
					)
				: [],
		[selectedPattern.measures, showChordDiagrams],
	);
	const voicingsFor = useChordVoicings(chordRefs, userVoicings);
	// What each string plays in the shape under every slot, for the off-shape
	// colouring. Recomputed only when the pattern or a shape lookup changes —
	// never per frame — and it is six comparisons per slot.
	const showOffShape = showChordDiagrams && offShapeOn;
	const offShapeBySlot = useMemo<readonly number[][][]>(() => {
		if (!showOffShape) return [];
		const chords = effectiveChords(selectedPattern.measures);
		return selectedPattern.measures.map((measure, mi) =>
			measure.slots.map((slot, si) => {
				const ref = chords[mi][si];
				let hints: FretHint[] | null = null;
				if (ref) {
					const state = voicingsFor(ref);
					const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
					hints = voicing ? chordFretHints(voicing) : null;
				}
				return offShapeStrings(slot, hints);
			}),
		);
	}, [selectedPattern.measures, showOffShape, voicingsFor]);
	const offShapeAt = useCallback(
		(measureIndex: number, slotIndex: number): readonly number[] =>
			offShapeBySlot[measureIndex]?.[slotIndex] ?? [],
		[offShapeBySlot],
	);
	// The shape over a chord symbol. Strings the shape holds but nothing in the
	// chord's stretch of that measure plucks are drawn faintly, so the fingers
	// that only complete the chord read differently from the ones that sound.
	const chordDiagram = useCallback(
		(label: ChordLabel & { measureIndex: number }) => {
			const state = voicingsFor(label.chord);
			if (state.status !== "ready") return null;
			const voicing = selectRefVoicing(label.chord, state.voicings);
			const measure = selectedPattern.measures[label.measureIndex];
			if (!voicing || !measure) return null;
			const unplucked = heldButUnplucked(
				measure.slots,
				label.slotIndex,
				chordRegionEnd(measure, label.slotIndex),
				voicing,
			);
			const { frets, startFret, barreFret } = vexChordDefToSVGProps(
				chordVoicingToVexChords(voicing),
			);
			return (
				<ChordShapeStrip
					frets={frets}
					startFret={startFret}
					barreFret={barreFret}
					// The strip's strings are indexed low E first; the pattern's the other way.
					dimmedStrings={[...unplucked].reverse()}
					width={chordShapeWidth}
				/>
			);
		},
		[voicingsFor, selectedPattern.measures, chordShapeWidth],
	);
	// Bottom-sheet detent (Google-Maps style): "closed" shows only the bottom bar,
	// "half" is the default open height, "full" is the tall/expanded height. The
	// drawer handle steps between detents; dragging up expands, dragging down closes.
	const [sheetDetent, setSheetDetent] = useState<"closed" | "half" | "full">("closed");
	const showSheet = sheetDetent !== "closed";
	const [showBpmPopover, setShowBpmPopover] = useState(false);
	// Pixel width of the tab viewer container; 0 until the ResizeObserver fires on mount.
	const [containerWidth, setContainerWidth] = useState(0);
	const [bpmPopoverPos, setBpmPopoverPos] = useState<{ bottom: number; left: number }>({
		bottom: 0,
		left: 0,
	});
	const bpmButtonRef = useRef<HTMLButtonElement>(null);
	const tapTimesRef = useRef<number[]>([]);
	// One-shot guard for restoring the last-viewed pattern from localStorage. Set
	// true once restore runs or the user picks a pattern, whichever comes first.
	// State (not a ref) so the tab viewer can show a loading placeholder until the
	// saved pattern is resolved, instead of flashing the default preset.
	const [patternRestored, setPatternRestored] = useState(false);
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
		noteGain,
		setNoteGain,
		applyBpmChange,
		applyLoopGapChange,
		seekToNote,
	} = useFingerpickAudioEngine();

	// ── Cursor / scroll ─────────────────────────────────────────────────────
	// Greedy row layout driven by content width; guard: render nothing until the
	// ResizeObserver fires with the real container width on mount.
	const rows = useMemo(
		() =>
			layoutMeasureRows(
				selectedPattern.measures,
				containerWidth,
				showChordDiagrams ? chordShapeSize.width : 0,
			),
		[selectedPattern.measures, containerWidth, showChordDiagrams, chordShapeSize.width],
	);

	const {
		cursorRef,
		measureHighlightRef,
		rowRefs,
		isAutoScrollingRef,
		resetCursor,
		snapCursorToNote,
		startOffsetFor,
		toExpandedMeasureIndex,
	} = usePlaybackCursor({ tabViewerRef, expanded, bpm, rows, isPlaying, getPlaybackProgress });
	// Bottom bar drag-to-open-sheet gesture refs.
	const bottomBarDragStartYRef = useRef<number>(0);
	const bottomBarIsDraggingRef = useRef<boolean>(false);
	// Drag handle drag-to-close gesture refs.
	const handleDragStartYRef = useRef(0);
	const handleIsDraggingRef = useRef(false);
	const { controlsVisible, restoreControls } = useHideOnScroll({
		viewerRef: tabViewerRef,
		isAutoScrollingRef,
	});
	const { handleTabClick, takePendingSeek, clearPendingSeek } = useClickToSeek({
		viewerRef: tabViewerRef,
		isPlaying,
		isPaused,
		seekToNote,
		toExpandedMeasureIndex,
		snapCursorToNote,
		onInteract: restoreControls,
	});

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

	function handleSelectPattern(p: FingerpickPattern) {
		// An explicit choice also ends the one-shot restore window: it must not be
		// overridden by the saved id once async pattern loading finishes.
		setPatternRestored(true);
		stop();
		setSelectedPattern(p);
		setBpm(p.bpm);
		dragBpmRef.current = p.bpm;
		resetCursor();
		// Below lg the library is a slide-in over the tab: picking a pattern is
		// what it was opened for, so it goes away and shows the pick. At lg it is
		// static and this is a no-op.
		setShowLibrary(false);
		// Mirror the choice to the account so /home can surface it cross-device.
		saveLastPattern(createClient(), user, "fingerpick", p.id).catch(console.error);
	}

	// Saving an edit to the currently-selected pattern: the audio engine snapshots
	// the pattern into a ref at play() time, so a running loop would keep playing the
	// pre-edit notes. Reset the engine here so the change is heard without a manual
	// page refresh — restart from the top if it was playing, otherwise just clear any
	// stale scheduled/paused audio so the next play() rebuilds from the saved edit.
	function handleSaveCustom(pattern: FingerpickPattern) {
		const isCurrent = pattern.id === selectedPattern.id;
		const wasPlaying = isCurrent && isPlaying;
		saveCustomPattern(pattern);
		if (!isCurrent) return;
		stop();
		if (wasPlaying) {
			// Expand the just-saved pattern so playback picks up any repeat edits immediately
			// (the memoized `expanded` recomputes only after selectedPattern re-renders).
			const savedExpanded = expandFingerpickPattern(pattern);
			play(
				{ ...savedExpanded.pattern, bpm },
				{ loop: true, loopGapSeconds: loopGap, forceLetRing: true },
			);
		}
		resetCursor();
	}

	// Whether the pattern on screen is one of the player's own (and so saved on
	// edit) rather than a preset.
	const isCustomPattern = customPatterns.some((p) => p.id === selectedPattern.id);

	// Capo from the header badge. A custom pattern is saved with it (through the
	// same path the editor saves by, so playback and the library pick it up); a
	// preset cannot be, so the change lives on the selected pattern for this
	// session — the badge's tooltip says so.
	function handleCapoChange(fret: number) {
		const next = setPatternCapo(selectedPattern, fret);
		if (isCustomPattern) handleSaveCustom(next);
		else {
			stop();
			setSelectedPattern(next);
			resetCursor();
		}
	}

	function handlePlay() {
		const pending = takePendingSeek();
		const startOffset = pending ? startOffsetFor(pending) : 0;
		// forceLetRing: every note rings at the long letRingDecayTc τ (terminated only
		// by voice stealing) — a fuller, more natural fingerstyle sustain. This is a
		// playback mode, so the pattern data is left untouched; letRing changes only
		// the audio envelope, not timing/positions, so scheduleEventsRef stays valid.
		play(
			{ ...expanded.pattern, bpm },
			{ loop: true, loopGapSeconds: loopGap, forceLetRing: true },
			startOffset,
		);
	}

	function handleStop() {
		stop();
		clearPendingSeek();
		resetCursor();
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

	// Restore the last-viewed pattern once patterns finish loading (custom patterns
	// arrive async, so wait for isLoading to clear before resolving the saved id).
	// Routed through handleSelectPattern so BPM/cursor state sync like a normal pick.
	// Marking patternRestored true here also hides the loading placeholder.
	useEffect(() => {
		if (patternRestored || isLoading) return;
		const savedId = readLastPatternId();
		const match =
			savedId && savedId !== selectedPattern.id
				? patterns.find((p) => p.id === savedId)
				: undefined;
		// One-shot sync from persisted (external) storage after async load — the
		// extra render is intentional and bounded to a single restore.
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (match) handleSelectPattern(match); // also flips patternRestored true
		else setPatternRestored(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, patternRestored]);

	// Persist the current pattern so a refresh reopens it. Gated on the restore
	// flag so the initial default doesn't clobber the saved id before restore runs.
	useEffect(() => {
		if (!patternRestored) return;
		writeLastPatternId(selectedPattern.id);
	}, [selectedPattern.id, patternRestored]);

	// Spacebar toggles play/pause, anywhere on the page — but not in a form field
	// and not behind an open dialog (see shouldRunPageShortcut).
	//
	// Held through a ref, and subscribed exactly once: the toggle reads the
	// pattern, the samples' load state and the tempo, and a dependency list that
	// misses one of them leaves the key acting on a state the page has already
	// left behind.
	const playPauseRef = useRef(handlePlayPause);
	useEffect(() => {
		playPauseRef.current = handlePlayPause;
	});
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code !== "Space" || !shouldRunPageShortcut(e)) return;
			e.preventDefault();
			playPauseRef.current();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<>
			<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-workspace">
				{/* Left sidebar — lg: static; below lg: slide-in overlay */}
				<div
					className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-line bg-sidebar flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
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
						onSaveCustom={handleSaveCustom}
						onDeleteCustom={deleteCustomPattern}
						onClose={() => setShowLibrary(false)}
						user={user}
						isLoading={isLoading}
					/>
				</div>

				{/* Backdrop — tap outside to close library on mobile/tablet */}
				{showLibrary && (
					<div
						className="fixed inset-0 z-30 bg-(--backdrop) lg:hidden"
						onClick={() => setShowLibrary(false)}
					/>
				)}

				{/* Centre — TAB viewer
			    md: fixed-height column → inner wrapper fills it (flex-1 + min-h-0)
			    → title is shrink-0 → measures scroll vertically inside min-h-0 container.
			    Mobile: no height constraint, page scroll handles overflow naturally. */}
				<div className="md:flex-1 flex flex-col px-4 md:px-8 py-6 md:py-8 md:overflow-hidden">
					<div className="relative w-full max-w-4xl mx-auto flex flex-col min-h-0 md:flex-1">
						{/* Loading overlay while patterns are fetched and the last-viewed one is
						    restored — kept as an overlay (not a conditional) so the tab viewer
						    stays mounted and its ResizeObserver can measure width underneath. */}
						{!patternRestored && (
							<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-workspace">
								<Loader2 className="h-6 w-6 animate-spin text-denim" />
								<span className="text-xs text-tab-meta uppercase tracking-wider">
									Loading pattern…
								</span>
							</div>
						)}
						{/* Fixed-height header: every row is as tall as its tallest possible
						    occupant (the fader), so controls appearing and disappearing —
						    the speed fader, the Size fader, the Off-shape switch — never move
						    the tab beneath. */}
						<div className="mb-4 shrink-0">
							<div className="flex h-9 items-center gap-3">
								<h1 className="truncate text-lg font-semibold text-tab-title">
									{selectedPattern.name}
								</h1>
								{/* Auto-scroll: creep the tab upward at a set speed. The speed
								    fader is only there while it is running. */}
								<button
									type="button"
									onClick={() => setAutoScroll((on) => !on)}
									disabled={!tabOverflows}
									aria-pressed={autoScrollActive}
									aria-label={autoScrollActive ? "Stop auto-scroll" : "Start auto-scroll"}
									title={
										!tabOverflows
											? "The whole tab is in view — nothing to scroll"
											: autoScrollActive
												? "Stop auto-scroll"
												: "Auto-scroll the tab"
									}
									className={`flex h-7 w-7 items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
										autoScrollActive
											? "border-denim bg-denim text-on-denim"
											: "border-line-strong text-ink-dim hover:border-denim hover:text-denim disabled:hover:border-line-strong disabled:hover:text-ink-dim"
									}`}
								>
									<ChevronsDown size={14} className={autoScrollActive ? "animate-bounce" : ""} />
								</button>
								{autoScrollActive && (
									<div className="fp-reveal flex items-center gap-2">
										<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
											Speed
										</span>
										<div className="w-24 sm:w-28">
											<Fader
												min={SCROLL_SPEED_MIN}
												max={SCROLL_SPEED_MAX}
												step={2}
												value={scrollSpeed}
												onValue={setScrollSpeed}
												ticks={[
													0,
													((SCROLL_SPEED_DEFAULT - SCROLL_SPEED_MIN) /
														(SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)) *
														100,
													100,
												]}
												tickValues={[SCROLL_SPEED_MIN, SCROLL_SPEED_DEFAULT, SCROLL_SPEED_MAX]}
												scale={[]}
												ariaLabel="Auto-scroll speed"
											/>
										</div>
									</div>
								)}
							</div>
							{/* Meta line, with the chord-line controls beside it — or under it
							    on a phone, where the row has no room for both. */}
							<div className="flex flex-col sm:h-9 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
							<div className="flex h-6 items-center gap-2 text-xs text-tab-meta uppercase tracking-wider sm:h-9">
								<span>
									{bpm} BPM &middot; {selectedPattern.timeSignature[0]}/
									{selectedPattern.timeSignature[1]}
								</span>
								{/* The TAB is written behind the capo; this says how much higher
								    it sounds, and is where to change it — a select styled as the
								    badge. "No capo" is said too, so a player about to play along
								    never has to wonder whether the badge is just missing. A preset
								    keeps the change for this session only; a custom pattern saves it. */}
								<select
									value={patternCapo(selectedPattern)}
									onChange={(e) => handleCapoChange(Number(e.target.value))}
									aria-label="Capo fret"
									title={
										isCustomPattern
											? "Capo — the TAB is written behind it; playback sounds this much higher"
											: "Capo — the TAB is written behind it; a preset keeps this for the session only"
									}
									className={`cursor-pointer appearance-none border px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal focus:outline-none focus-visible:border-denim ${
										patternCapo(selectedPattern) > 0
											? "border-denim-border bg-denim-tint text-denim"
											: "border-line bg-transparent text-ink-faint hover:text-ink-dim"
									}`}
								>
									<option value={0}>No capo</option>
									{Array.from({ length: STRUM_CAPO_MAX }, (_, i) => i + 1).map((fret) => (
										<option key={fret} value={fret}>
											Capo {fret}
										</option>
									))}
								</select>
							</div>
							{/* Chord line view, at the row's other end — only a question for a
							    pattern that names chords. The size slider appears with the
							    shapes it sizes. */}
							<div className="flex h-9 shrink-0 flex-row-reverse items-center gap-3 self-start sm:flex-row sm:self-auto">
								{hasChords && chordView === "diagram" && (
										<div className="fp-reveal fp-reveal-2 flex flex-row-reverse items-center gap-3 sm:flex-row">
											<div className="flex items-center gap-2">
											<Rocker
												checked={offShapeOn}
												onChange={setOffShapeOn}
												ariaLabel="Colour fret numbers outside the chord shape"
											/>
											<span
												className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim"
												title="Colour the fret numbers that are not part of the chord shape in effect"
											>
												Off-shape
											</span>
											</div>
											<span aria-hidden className="h-4 w-px bg-line-strong" />
										</div>
									)}
								{hasChords && chordView === "diagram" && (
										<div className="fp-reveal flex flex-row-reverse items-center gap-3 sm:flex-row">
											<div className="flex items-center gap-2">
											<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
												Size
											</span>
											{/* The same fader as the transport's, so the header reads as
											    one set of controls. No scale row: the range is a feel, not
											    a number anyone needs to read off. */}
											<div className="w-20 sm:w-28">
												<Fader
													min={CHORD_SHAPE_WIDTH_MIN}
													max={CHORD_SHAPE_WIDTH_MAX}
													step={4}
													value={chordShapeWidth}
													onValue={setChordShapeWidth}
													ticks={[
														0,
														((CHORD_SHAPE_WIDTH_DEFAULT - CHORD_SHAPE_WIDTH_MIN) /
															(CHORD_SHAPE_WIDTH_MAX - CHORD_SHAPE_WIDTH_MIN)) *
															100,
														100,
													]}
													tickValues={[
														CHORD_SHAPE_WIDTH_MIN,
														CHORD_SHAPE_WIDTH_DEFAULT,
														CHORD_SHAPE_WIDTH_MAX,
													]}
													scale={[]}
													ariaLabel="Chord shape size"
												/>
											</div>
											</div>
											<span aria-hidden className="h-4 w-px bg-line-strong" />
										</div>
									)}
								{hasChords && (
									<ChordViewToggle value={chordView} onChange={setChordView} />
								)}
							</div>
							</div>
						</div>

						{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport.
					    position:relative anchors the cursor overlay div. */}
						<div
							ref={tabViewerRef}
							data-tab-viewer
							className="relative min-h-0 min-w-0 overflow-hidden overflow-y-auto cursor-pointer"
							onClick={handleTabClick}
						>
							{/* Measure highlight — updated only on measure transitions. Stacked
							    ABOVE the rows (z-10): it is translucent, so the look is the same,
							    but the opaque patches VexFlow paints behind fret numbers no
							    longer show through it as pale squares. */}
							<div
								ref={measureHighlightRef}
								aria-hidden="true"
								className="absolute z-10 pointer-events-none"
								style={{
									display: "none",
									backgroundColor: "var(--measure-hl)",
								}}
							/>
							{/* Playhead line — stacked above the rows (z-10, after the highlight
						    in DOM order so it paints over it), so it crosses the fret numbers
						    rather than being cut by them; translateX updated every RAF frame. */}
							<div
								ref={cursorRef}
								aria-hidden="true"
								className="absolute z-10 pointer-events-none"
								style={{
									display: "none",
									width: 2,
									left: 0,
									backgroundColor: "var(--denim-accent)",
									boxShadow: "var(--glow-playhead)",
								}}
							>
								{/* Downward-pointing triangle cap centred on the 2px line. */}
								<span
									aria-hidden="true"
									style={{
										position: "absolute",
										top: -6,
										left: -4,
										width: 0,
										height: 0,
										borderLeft: "5px solid transparent",
										borderRight: "5px solid transparent",
										borderTop: "6px solid var(--denim-accent)",
									}}
								/>
							</div>
							{/* pt-2 leaves headroom so the playhead's triangle cap (top: -6px
						    relative to the cursor line, which is positioned at the row's stave
						    top) isn't clipped by the scroll container's overflow at row 0. */}
							<div ref={rowsContainerRef} className="flex flex-col pt-2 pb-20 md:pb-0">
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
											chordDiagram={showChordDiagrams ? chordDiagram : undefined}
											chordDiagramSize={chordShapeSize}
											offShapeStrings={showOffShape ? offShapeAt : undefined}
										/>
									</div>
								))}
							</div>
						</div>

						{/* Mobile library toggle */}
						{!showLibrary && (
							<button
								onClick={() => setShowLibrary(true)}
								className={`absolute top-0 right-0 z-30 lg:hidden flex items-center gap-2 text-white text-sm font-semibold px-2 py-2 transition-all duration-300 active:scale-95 ${
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
								{/* Loop toggle: on = loop the tab, off = play once */}
								<span className="flex items-center gap-1.5">
									<Repeat size={12} strokeWidth={2} className="shrink-0" />
									<Rocker
										checked={!playOnce}
										onChange={(v) => setPlayOnce(!v)}
										ariaLabel="Loop"
									/>
								</span>
							</div>
							{/* Gap between loop passes — only a question while looping. */}
							{!playOnce && (
								<div className="flex items-center gap-3">
									<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
										Loop gap
									</span>
									<div className="flex-1">
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
										/>
									</div>
								</div>
							)}
							<div className="flex gap-2">
								<button
									type="button"
									onClick={isLoaded ? handlePlayPause : undefined}
									disabled={!isLoaded}
									aria-label={!isLoaded ? "Loading samples" : isPlaying ? "Pause" : "Play"}
									className="flex h-13 flex-1 items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
								>
									{/* Dimmed said "not yet" but not "nearly"; the spinner does. */}
									{!isLoaded ? (
										<Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
									) : isPlaying ? (
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
							{/* NOTE SOUND — sits directly under the play controls */}
							<div className="flex flex-col gap-3">
								<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
									<span className="flex items-center gap-1.5">
										<Volume2 size={12} strokeWidth={2} className="shrink-0" />
										Note Sound
									</span>
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
						</div>

						{/* TEMPO */}
						<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Gauge size={12} strokeWidth={2} className="shrink-0" />
									Tempo
								</span>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => handleBpmChange(selectedPattern.bpm)}
										disabled={bpm === selectedPattern.bpm}
										aria-label="Reset tempo to default"
										title={`Reset to ${selectedPattern.bpm} BPM`}
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
											onClick={() => handleBpmChange(bpm + delta)}
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
											onClick={() => handleBpmChange(bpm + delta)}
											className="flex-1 border border-line-strong py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint"
										>
											{label}
										</button>
									))}
								</div>
							</div>
						</div>

						{/* METRONOME — sits directly under Tempo. Header toggle enables the
						    metronome (with accent on beat 1, always on when enabled). */}
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
									value={metronomeSubdivision}
									onChange={(v) =>
										setMetronomeSubdivision(v as MetronomeSubdivision)
									}
									disabled={!metronomeEnabled}
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
				<div className="md:hidden fixed inset-0 z-20" onClick={() => setSheetDetent("closed")} />
			)}

			{/* ── Unified mobile drawer ────────────────────────────────────────── */}
			<div
				className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-popover border-t border-line-strong overflow-hidden transition-transform duration-300 ease-out"
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
						sheetDetent === "full"
							? "max-h-[calc(85vh-56px)] overflow-y-auto"
							: sheetDetent === "half"
								? "max-h-[calc(33.333vh-56px)] overflow-y-auto"
								: "max-h-0"
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
						{/* Loop gap — only a question while looping (the bar's loop toggle). */}
						{!playOnce && (
							<div className="flex flex-col gap-3">
								<div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
									<Repeat size={12} strokeWidth={2} className="shrink-0" />
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
								/>
							</div>
						)}
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
										onClick={() => handleBpmChange(selectedPattern.bpm)}
										disabled={bpm === selectedPattern.bpm}
										aria-label="Reset tempo to default"
										title={`Reset to ${selectedPattern.bpm} BPM`}
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
							<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<span className="flex items-center gap-1.5">
									<Volume2 size={12} strokeWidth={2} className="shrink-0" />
									Note Sound
								</span>
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

					</div>
				</div>

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

					{/* Loop icon toggle: on = loop the tab, off = play once */}
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
							className={`flex h-11 w-11 items-center justify-center rounded-none bg-denim text-on-denim transition-all duration-150 active:scale-95 ${
								isLoaded ? "cursor-pointer" : "opacity-30 pointer-events-none"
							}`}
						>
							{!isLoaded ? (
								<Loader2 size={22} strokeWidth={1.5} className="animate-spin" />
							) : isPlaying ? (
								<CirclePause size={22} strokeWidth={1.5} />
							) : (
								<CirclePlay size={22} strokeWidth={1.5} />
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
