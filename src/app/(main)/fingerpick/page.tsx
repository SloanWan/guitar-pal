"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { FingerpickPattern, StringFret, Measure } from "@/lib/fingerpickTypes";
import {
	fingerpickPatternToScheduleEvents,
	findSlotStartTime,
	type ScheduleEvent,
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
	CirclePlay,
	CirclePause,
	CircleStop,
	X,
	SquareMenu,
	Plus,
	Minus,
	ChevronUp,
	Metronome,
} from "lucide-react";

// ── StringFret factory helpers ──────────────────────────────────────────────
// Reduce the verbosity of the required { fret, technique, tied, muted } shape.
const S = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const N = (fret: number): StringFret => ({ fret, technique: null, tied: false, muted: false });
const Hn = (fret: number): StringFret => ({
	fret,
	technique: "hammer-on",
	tied: false,
	muted: false,
});
const Po = (fret: number): StringFret => ({
	fret,
	technique: "pull-off",
	tied: false,
	muted: false,
});
const Su = (fret: number): StringFret => ({
	fret,
	technique: "slide-up",
	tied: false,
	muted: false,
});
const Sd = (fret: number): StringFret => ({
	fret,
	technique: "slide-down",
	tied: false,
	muted: false,
});
const Ti = (fret: number): StringFret => ({ fret, technique: null, tied: true, muted: false });
const Mx = (): StringFret => ({ fret: null, technique: null, tied: false, muted: true });

// ── Preset pattern ─────────────────────────────────────────────────────────
// Exercises every supported technique and all five duration values in one pattern.
//
// m1 — quarter notes: normal frets + muted ("x") note
// m2 — eighth notes + beams: hammer-on (h) and pull-off (p) on D string
// m3 — quarter notes: slide-up (/), tied arc, slide-down (\) on A string
// m4 — half + quarter rest + four sixteenth notes on high-e (exercises half, rest, sixteenth)
// m5 — single whole note on G string (exercises whole)
//
// Strings index: [e(high), B, G, D, A, E(low)] = [0, 1, 2, 3, 4, 5]
const PRESET_FINGERPICK_PATTERN: FingerpickPattern = {
	id: "technique-showcase",
	name: "Technique Showcase",
	bpm: 80,
	timeSignature: [4, 4],
	measures: [
		// ── m1: quarter notes — normal frets, muted note ────────────────
		{
			id: "m1",
			slots: [
				{ id: "s01", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s02", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s03", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s04", duration: "quarter", strings: [S(), S(), S(), S(), N(2), S()] },
			],
		},

		// ── m2: eighth notes — beams, hammer-on, pull-off on D string ────
		{
			id: "m2",
			slots: [
				{ id: "s05", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s06", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s07", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s08", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s09", duration: "eighth", strings: [S(), S(), S(), N(0), S(), S()] },
				{ id: "s10", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s11", duration: "eighth", strings: [S(), S(), S(), N(2), S(), S()] },
				{ id: "s12", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
			],
		},

		// ── m3: quarter notes — slide-up, tied arc, slide-down on A ──────
		{
			id: "m3",
			slots: [
				{ id: "s13", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s14", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s15", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s16", duration: "quarter", strings: [S(), S(), S(), S(), Sd(0), S()] },
			],
		},

		// ── m4: half + rest + 4 sixteenth notes (2 + 1 + 1 = 4 beats) ───
		{
			id: "m4",
			slots: [
				{ id: "s17", duration: "half", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s18", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s19", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s20", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s21", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s22", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m5: whole note — G string open (4 beats) ─────────────────────
		{
			id: "m5",
			slots: [{ id: "s23", duration: "whole", strings: [S(), S(), N(0), S(), S(), S()] }],
		},

		// ── m6: rest + 4 sixteenths + triplet + 4 sixteenths ─────────────
		// beat 1: quarter rest
		// beat 2: four sixteenth notes on high-e
		// beat 3: eighth-note triplet on B string (3 notes in 1 beat)
		// beat 4: four sixteenth notes on G string
		{
			id: "m6",
			slots: [
				{ id: "s24", duration: "rest", strings: [S(), S(), S(), S(), S(), S()] },
				{ id: "s25", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s26", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s27", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s28", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s29", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s30", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s31", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s32", duration: "sixteenth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s33", duration: "sixteenth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s34", duration: "sixteenth", strings: [S(), S(), N(4), S(), S(), S()] },
				{ id: "s35", duration: "sixteenth", strings: [S(), S(), N(5), S(), S(), S()] },
			],
		},

		// ── m7: eighth-note hammer-on / pull-off drill on G string ───────────
		{
			id: "m7",
			slots: [
				{ id: "s36", duration: "eighth", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s37", duration: "eighth", strings: [S(), S(), Hn(2), S(), S(), S()] },
				{ id: "s38", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s39", duration: "eighth", strings: [S(), S(), Po(0), S(), S(), S()] },
				{ id: "s40", duration: "eighth", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s41", duration: "eighth", strings: [S(), S(), Hn(4), S(), S(), S()] },
				{ id: "s42", duration: "eighth", strings: [S(), S(), N(4), S(), S(), S()] },
				{ id: "s43", duration: "eighth", strings: [S(), S(), Po(2), S(), S(), S()] },
			],
		},

		// ── m8: slide-up / tied / slide-down on A string (4 quarters) ────────
		{
			id: "m8",
			slots: [
				{ id: "s44", duration: "quarter", strings: [S(), S(), S(), S(), N(0), S()] },
				{ id: "s45", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s46", duration: "quarter", strings: [S(), S(), S(), S(), Ti(5), S()] },
				{ id: "s47", duration: "quarter", strings: [S(), S(), S(), S(), Sd(2), S()] },
			],
		},

		// ── m9: half on E-low + 4 eighths ascending on high-e ────────────────
		{
			id: "m9",
			slots: [
				{ id: "s48", duration: "half", strings: [S(), S(), S(), S(), S(), N(3)] },
				{ id: "s49", duration: "eighth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s50", duration: "eighth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s51", duration: "eighth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s52", duration: "eighth", strings: [N(10), S(), S(), S(), S(), S()] },
			],
		},

		// ── m10: 16 sixteenth notes — ascending / descending run on high-e ───
		{
			id: "m10",
			slots: [
				{ id: "s53", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s54", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s55", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s56", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s57", duration: "sixteenth", strings: [N(12), S(), S(), S(), S(), S()] },
				{ id: "s58", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s59", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s60", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s61", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s62", duration: "sixteenth", strings: [N(7), S(), S(), S(), S(), S()] },
				{ id: "s63", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s64", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s65", duration: "sixteenth", strings: [N(12), S(), S(), S(), S(), S()] },
				{ id: "s66", duration: "sixteenth", strings: [N(10), S(), S(), S(), S(), S()] },
				{ id: "s67", duration: "sixteenth", strings: [N(8), S(), S(), S(), S(), S()] },
				{ id: "s68", duration: "sixteenth", strings: [N(5), S(), S(), S(), S(), S()] },
			],
		},

		// ── m11: triplet groove — 4 beats of eighth-triplets on B string ──────
		{
			id: "m11",
			slots: [
				{ id: "s69", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s70", duration: "eighth-triplet", strings: [S(), N(1), S(), S(), S(), S()] },
				{ id: "s71", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s72", duration: "eighth-triplet", strings: [S(), N(0), S(), S(), S(), S()] },
				{ id: "s73", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s74", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s75", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s76", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s77", duration: "eighth-triplet", strings: [S(), N(7), S(), S(), S(), S()] },
				{ id: "s78", duration: "eighth-triplet", strings: [S(), N(5), S(), S(), S(), S()] },
				{ id: "s79", duration: "eighth-triplet", strings: [S(), N(3), S(), S(), S(), S()] },
				{ id: "s80", duration: "eighth-triplet", strings: [S(), N(1), S(), S(), S(), S()] },
			],
		},

		// ── m12: multi-string chordal quarters ───────────────────────────────
		{
			id: "m12",
			slots: [
				{ id: "s81", duration: "quarter", strings: [N(0), S(), N(0), S(), N(0), S()] },
				{ id: "s82", duration: "quarter", strings: [N(1), S(), N(0), S(), N(2), S()] },
				{ id: "s83", duration: "quarter", strings: [N(0), S(), N(0), S(), N(0), S()] },
				{ id: "s84", duration: "quarter", strings: [S(), N(0), S(), N(2), S(), N(3)] },
			],
		},

		// ── m13: muted riff on E-low — quarter + quarter + eighth + eighth + quarter ──
		{
			id: "m13",
			slots: [
				{ id: "s85", duration: "quarter", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s86", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(3)] },
				{ id: "s87", duration: "eighth", strings: [S(), S(), S(), S(), S(), Mx()] },
				{ id: "s88", duration: "eighth", strings: [S(), S(), S(), S(), S(), N(5)] },
				{ id: "s89", duration: "quarter", strings: [S(), S(), S(), S(), S(), N(7)] },
			],
		},

		// ── m14: grand finale — quarter + 2 eighths (h/p) + quarter (slide) + triplet ──
		{
			id: "m14",
			slots: [
				{ id: "s90", duration: "quarter", strings: [N(5), S(), S(), S(), S(), S()] },
				{ id: "s91", duration: "eighth", strings: [S(), S(), S(), Hn(2), S(), S()] },
				{ id: "s92", duration: "eighth", strings: [S(), S(), S(), Po(0), S(), S()] },
				{ id: "s93", duration: "quarter", strings: [S(), S(), S(), S(), Su(5), S()] },
				{ id: "s94", duration: "eighth-triplet", strings: [S(), S(), N(0), S(), S(), S()] },
				{ id: "s95", duration: "eighth-triplet", strings: [S(), S(), N(2), S(), S(), S()] },
				{ id: "s96", duration: "eighth-triplet", strings: [S(), S(), N(4), S(), S(), S()] },
			],
		},
	],
};

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

// Higher = tighter/snappier following, lower = smoother/more lag.
// At 20, steady-state lag behind a constant-velocity target is ~v/20 px/s — barely
// perceptible on dense sixteenth-note runs (~8 px) and invisible on slower material.
const CURSOR_LAMBDA = 20;

export default function FingerpickPage() {
	const [showLibrary, setShowLibrary] = useState(false);
	const [pattern] = useState<FingerpickPattern>(PRESET_FINGERPICK_PATTERN);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);
	const [bpm, setBpm] = useState<number>(PRESET_FINGERPICK_PATTERN.bpm);
	// Incremented each time Stop is pressed; triggers the cursor-reset effect below.
	const [cursorResetTick, setCursorResetTick] = useState(0);
	const [showSheet, setShowSheet] = useState(false);
	const [showBpmPopover, setShowBpmPopover] = useState(false);
	// Pixel width of the tab viewer container; 0 until the ResizeObserver fires on mount.
	const [containerWidth, setContainerWidth] = useState(0);
	const tapTimesRef = useRef<number[]>([]);
	// Tracks the latest BPM value during slider drag so onPointerUp reads the
	// correct final value regardless of React batching.
	const dragBpmRef = useRef(PRESET_FINGERPICK_PATTERN.bpm);
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

	// Preload presets on mount so the first Play is instant.
	// load() is stable in intent but re-created each render; the empty-dep array
	// is intentional — we only want one preload call per page mount.
	useEffect(() => {
		void load();
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

	function handlePlay() {
		const pending = pendingSeekRef.current;
		pendingSeekRef.current = null;
		const startOffset = pending
			? findSlotStartTime(scheduleEventsRef.current, pending.measureIndex, pending.slotIndex)
			: 0;
		play({ ...pattern, bpm }, { loop: true, loopGapSeconds: loopGap }, startOffset);
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
	// for interpolation. Recomputed whenever BPM changes (same trigger as applyBpmChange).
	useEffect(() => {
		scheduleEventsRef.current = fingerpickPatternToScheduleEvents(pattern, bpm);
	}, [pattern, bpm]);

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
			const x0 = noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
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
			const x0 = noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
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

			const { measureIndex, slotIndex, elapsed, passIndex } = progress;
			const events = scheduleEventsRef.current;
			const currentRows = rowsRef.current;

			// Loop pass boundary: snap cursor instead of smoothly chasing from the
			// last note of the previous pass back to the first note of the new pass.
			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
			}

			const noteEl = container.querySelector<SVGElement>(
				`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
			);
			if (!noteEl) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const containerRect = container.getBoundingClientRect();
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
				const noteDuration = t0Event?.duration ?? (lastEvent ? Math.max(0.1, lastEvent.time - t0 + 0.5) : 1);
				const frac = Math.max(0, Math.min(1, (elapsed - t0) / noteDuration));
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
					const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
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
				rowRefs.current[rowIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
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
		const widthRows = computeAllMeasureWidths(pattern.measures, containerWidth);
		let offset = 0;
		return widthRows.map((rowWidths) => {
			const start = offset;
			const rowMeasures = pattern.measures.slice(start, start + rowWidths.length);
			offset += rowWidths.length;
			return { measures: rowMeasures, startMeasureNumber: start + 1, widths: rowWidths };
		});
	}, [pattern.measures, containerWidth]);

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
					<div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-slate-200">
						<h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
							Pattern Library
						</h2>
						<button
							onClick={() => setShowLibrary(false)}
							className="lg:hidden h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
						>
							<X size={18} />
						</button>
					</div>
					<div className="flex-1 flex items-center justify-center">
						<p className="text-xs text-slate-400 text-center px-4">
							Pattern library coming soon
						</p>
					</div>
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
							<h1 className="text-lg font-semibold text-slate-700">{pattern.name}</h1>
							<p className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">
								{bpm} BPM &middot; {pattern.timeSignature[0]}/
								{pattern.timeSignature[1]}
							</p>
						</div>

						{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport.
					    position:relative anchors the cursor overlay div. */}
						<div
							ref={tabViewerRef}
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
								className="fixed top-17 right-4 z-30 md:hidden flex items-center gap-2 text-white text-sm font-semibold rounded-md px-2 py-2 shadow-lg transition-all duration-200 active:scale-95"
								style={{ backgroundColor: "var(--denim)" }}
							>
								<SquareMenu />
							</button>
						)}
					</div>
				</div>

				{/* Right panel — controls */}
				<div className="hidden md:flex w-full border-t border-slate-200 bg-white md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex-col">
					<h2 className="w-full px-5 py-4 shrink-0 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
						Controls
					</h2>

					<div className="flex flex-col gap-5 px-5 py-5 overflow-y-auto">
						{/* Play / Pause toggle */}
						<div
							onClick={isLoaded ? handlePlayPause : undefined}
							className={`flex items-center justify-center transition-all duration-150 active:scale-95 ${
								isLoaded
									? "cursor-pointer text-denim hover:text-denim-dark"
									: "opacity-30 pointer-events-none text-denim"
							}`}
						>
							{isPlaying ? (
								<CirclePause size={56} strokeWidth={1.5} />
							) : (
								<CirclePlay size={56} strokeWidth={1.5} />
							)}
						</div>

						{/* Stop button — shown while playing or paused */}
						{(isPlaying || isPaused) && (
							<button
								onClick={handleStop}
								className="flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 hover:cursor-pointer transition-colors duration-200 text-xs font-medium"
							>
								<CircleStop size={16} strokeWidth={1.5} />
								Stop and back to start
							</button>
						)}

						{!isLoaded && (
							<p className="text-[10px] text-slate-400 text-center">
								Loading samples…
							</p>
						)}

						{/* BPM slider */}
						<input
							type="range"
							min={MIN_BPM}
							max={MAX_BPM}
							value={bpm}
							onChange={(e) => handleSliderChange(Number(e.target.value))}
							onPointerDown={handleSliderPointerDown}
							onPointerUp={handleSliderPointerUp}
							className="w-full accent-denim cursor-pointer"
						/>

						{/* ±10 BPM + display */}
						<div className="flex justify-between items-center">
							<Button
								variant="outline"
								className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
								onClick={() => handleBpmChange(bpm - 10)}
							>
								<Minus size={16} />
							</Button>
							<div className="flex flex-col items-center gap-0.5">
								<span className="text-5xl font-bold tracking-tight text-denim">
									{bpm}
								</span>
								<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
									BPM
								</span>
							</div>
							<Button
								variant="outline"
								className="h-10 w-10 p-0 rounded-full border-slate-200 hover:border-denim hover:text-denim transition-colors duration-150"
								onClick={() => handleBpmChange(bpm + 10)}
							>
								<Plus size={16} />
							</Button>
						</div>

						{/* Tap Tempo */}
						<Button
							onClick={handleTapTempo}
							className="h-9 w-full text-sm font-semibold cursor-pointer transition-all duration-150"
							style={{ backgroundColor: "var(--denim)", color: "white" }}
						>
							Tap Tempo
						</Button>

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

						{/* Loop gap — disabled/greyed when play-once is active */}
						<div
							className={`flex flex-col gap-2 transition-opacity duration-200 ${
								playOnce ? "opacity-40 pointer-events-none" : ""
							}`}
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
										onClick={() => {
											setLoopGap(gap);
											applyLoopGapChange(gap);
										}}
										className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
										style={
											loopGap === gap && !playOnce
												? {
														backgroundColor: "var(--denim)",
														color: "white",
													}
												: undefined
										}
									>
										{gap}s
									</Button>
								))}
							</div>
						</div>

						{/* Note sound section */}
						<div className="flex flex-col gap-1.5">
							<div className="flex justify-between items-center">
								<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
									Note Sound
								</span>
								<span className="text-xs tabular-nums text-slate-400">
									{Math.round(noteGain * 100)}%
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={2}
								step={0.01}
								value={noteGain}
								onChange={(e) => {
									setNoteGain(Number(e.target.value));
									navigator.vibrate?.(10);
								}}
								className="w-full accent-denim cursor-pointer"
							/>
						</div>

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

						{/* Accent beat 1 toggle */}
						<div
							className={`flex items-center justify-between transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40" : ""
							}`}
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

						{/* Subdivision density */}
						<div
							className={`flex flex-col gap-2 transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40" : ""
							}`}
						>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								Subdivision
							</span>
							<div className="flex gap-1">
								{(
									[
										{ value: "quarter", label: "1/4" },
										{ value: "eighth", label: "1/8" },
										{ value: "sixteenth", label: "1/16" },
									] satisfies { value: MetronomeSubdivision; label: string }[]
								).map(({ value, label }) => (
									<Button
										key={value}
										variant={
											metronomeSubdivision === value ? "default" : "outline"
										}
										disabled={!metronomeEnabled}
										onClick={() => setMetronomeSubdivision(value)}
										className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
										style={
											metronomeSubdivision === value
												? {
														backgroundColor: "var(--denim)",
														color: "white",
													}
												: undefined
										}
									>
										{label}
									</Button>
								))}
							</div>
						</div>

						{/* Metronome volume */}
						<div
							className={`flex flex-col gap-1.5 transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40" : ""
							}`}
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
								onChange={(e) => {
									setMetronomeGain(Number(e.target.value));
									navigator.vibrate?.(10);
								}}
								className="w-full accent-denim cursor-pointer"
							/>
						</div>

						<div className="border-t border-slate-100" />
					</div>
				</div>
			</div>

			{/* Backdrop — intercepts taps outside the drawer to close it without triggering tab seek */}
			{showSheet && (
				<div
					className="md:hidden fixed inset-0 z-20"
					onClick={() => setShowSheet(false)}
				/>
			)}

			{/* ── Unified mobile drawer ────────────────────────────────────────── */}
			<div className="md:hidden fixed bottom-0 left-0 right-0 z-30 rounded-t-2xl bg-white border-t border-slate-300 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden">
				{/* Expandable controls panel — max-height transition reveals/hides content */}
				<div
					className={`bg-white overflow-hidden transition-[max-height] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
						showSheet ? "max-h-[calc(33.333vh-56px)] overflow-y-auto" : "max-h-0"
					}`}
				>
					<div className="flex justify-center pt-2.5 pb-1 shrink-0">
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

						{/* Note Sound volume */}
						<div className="flex flex-col gap-1.5">
							<div className="flex justify-between items-center">
								<span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
									Note Sound
								</span>
								<span className="text-xs tabular-nums text-slate-400">
									{Math.round(noteGain * 100)}%
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={2}
								step={0.01}
								value={noteGain}
								onChange={(e) => {
									setNoteGain(Number(e.target.value));
									navigator.vibrate?.(10);
								}}
								className="w-full accent-denim cursor-pointer"
							/>
						</div>

						<div className="border-t border-slate-100" />

						{/* Accent beat 1 */}
						<div
							className={`flex items-center justify-between transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40 pointer-events-none" : ""
							}`}
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

						{/* Subdivision */}
						<div
							className={`flex flex-col gap-2 transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40 pointer-events-none" : ""
							}`}
						>
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
								Subdivision
							</span>
							<div className="flex gap-1">
								{(
									[
										{ value: "quarter", label: "1/4" },
										{ value: "eighth", label: "1/8" },
										{ value: "sixteenth", label: "1/16" },
									] satisfies { value: MetronomeSubdivision; label: string }[]
								).map(({ value, label }) => (
									<Button
										key={value}
										variant={metronomeSubdivision === value ? "default" : "outline"}
										disabled={!metronomeEnabled}
										onClick={() => setMetronomeSubdivision(value)}
										className="flex-1 h-9 text-xs font-semibold transition-colors duration-150"
										style={
											metronomeSubdivision === value
												? { backgroundColor: "var(--denim)", color: "white" }
												: undefined
										}
									>
										{label}
									</Button>
								))}
							</div>
						</div>

						{/* Metronome volume */}
						<div
							className={`flex flex-col gap-1.5 transition-opacity duration-200 ${
								!metronomeEnabled ? "opacity-40 pointer-events-none" : ""
							}`}
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
								onChange={(e) => {
									setMetronomeGain(Number(e.target.value));
									navigator.vibrate?.(10);
								}}
								className="w-full accent-denim cursor-pointer"
							/>
						</div>

						<div className="border-t border-slate-100" />

						{/* Loop Gap */}
						<div
							className={`flex flex-col gap-2 transition-opacity duration-200 ${
								playOnce ? "opacity-40 pointer-events-none" : ""
							}`}
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
										onClick={() => {
											setLoopGap(gap);
											applyLoopGapChange(gap);
										}}
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
					</div>
				</div>

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
							onClick={() => setShowBpmPopover((v) => !v)}
							className="w-14 flex flex-col items-center leading-none text-center"
						>
							<span className="text-xl font-bold text-denim">{bpm}</span>
							<span className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">
								BPM
							</span>
						</button>
						{/* BPM vertical slider popover */}
						{showBpmPopover && (
							<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl border border-slate-200 shadow-lg px-4 py-4 flex items-center justify-center">
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
					</div>

					{/* Loop / Once segmented control */}
					<div className="relative flex h-8 items-center rounded-full bg-slate-200 p-0.5 shrink-0">
						{/* Sliding pill */}
						<div
							className="absolute inset-0.5 w-[calc(50%-2px)] rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
							style={{
								transform: playOnce ? "translateX(calc(100% + 4px))" : "translateX(0)",
							}}
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

					{/* Metronome toggle */}
					<button
						onClick={() => setMetronomeEnabled(!metronomeEnabled)}
						className={`p-1.5 rounded-full transition-colors duration-150 shrink-0 ${
							metronomeEnabled ? "text-denim" : "text-slate-400"
						}`}
					>
						<Metronome size={20} />
					</button>

					{/* Chevron — toggles the controls panel open/closed */}
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
							onClick={handleStop}
							className={`p-1 text-slate-500 transition-colors duration-150 ${
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
