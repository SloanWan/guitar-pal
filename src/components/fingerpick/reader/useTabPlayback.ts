import { useEffect, useMemo, useRef, useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import { regionForSelection } from "@/lib/fingerpickLoopRegion";
import { clampBpmToMeter } from "@/lib/strumBars";
import type { TickLevel } from "@/lib/strumMetronome";
import { useFingerpickAudioEngine, type MetronomeSubdivision } from "@/components/fingerpick/useFingerpickAudioEngine";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import { useClickToSeek } from "@/components/fingerpick/useClickToSeek";
import type { MeasureRect } from "@/components/fingerpick/useMeasureGeometry";
import type { SectionRange } from "@/components/fingerpick/sectionSelection";
import type { MeasureRow } from "@/components/fingerpick/fingerpickLayout";

/** What the fingerpick metronome can click: no triplet level. */
export const TAB_TICK_LEVELS: readonly TickLevel[] = ["beat", "division", "subdivision"];

function subdivisionOf(level: TickLevel): MetronomeSubdivision {
	return level === "triplet" ? "division" : level;
}

/** A tab's own tempo, inside its meter's range (a stored or imported one may sit above a compound ceiling). */
export function tabBpm(pattern: FingerpickPattern): number {
	return clampBpmToMeter(pattern.bpm, pattern.timeSignature);
}

interface Args {
	pattern: FingerpickPattern;
	/** The stave rows on screen, and the box the cursor is drawn in. */
	rows: MeasureRow[];
	viewerRef: React.RefObject<HTMLDivElement | null>;
	geometry: readonly MeasureRect[];
	/** The section to loop, in rendered measures, while section mode has one. */
	sectionRange: SectionRange | null;
	/** Section mode: a click on the tab picks a measure instead of seeking. */
	sectionMode: boolean;
	onPickMeasure: (measureIndex: number) => void;
}

/**
 * The engine, fed: the open tab with its repeats played out, the tempo on screen,
 * the loop and its gap, the chosen section, and the cursor over the stave. The
 * play key pauses (the cursor waits where it is); stop goes back to the start, or
 * to the section's first bar.
 */
export function useTabPlayback({ pattern, rows, viewerRef, geometry, sectionRange, sectionMode, onPickMeasure }: Args) {
	const engine = useFingerpickAudioEngine();
	// Repeats flattened into the timeline the engine, the cursor and the seek map share.
	const expanded = useMemo(() => expandFingerpickPattern(pattern), [pattern]);
	// The tempo set, and a slider drag's value until the drag ends.
	const [bpm, setBpmState] = useState(() => tabBpm(pattern));
	const [dragBpm, setDragBpm] = useState<number | null>(null);
	const [loopGap, setLoopGapState] = useState(0);
	// The bar under the playhead, for the pill; the cursor reports it.
	const [measure, setMeasure] = useState(0);
	// The notes' level stays where it was while muted, so un-muting brings back the same mix.
	const [notesOn, setNotesOn] = useState(true);
	const [noteLevel, setNoteLevel] = useState(engine.noteGain);

	const cursor = usePlaybackCursor({
		tabViewerRef: viewerRef,
		expanded,
		bpm,
		rows,
		isPlaying: engine.isPlaying,
		getPlaybackProgress: engine.getPlaybackProgress,
		onMeasure: setMeasure,
	});
	const seek = useClickToSeek({
		viewerRef,
		isPlaying: engine.isPlaying,
		isPaused: engine.isPaused,
		seekToNote: engine.seekToNote,
		toExpandedMeasureIndex: cursor.toExpandedMeasureIndex,
		snapCursorToNote: cursor.snapCursorToNote,
		sectionMode,
		geometry,
		onPickMeasure,
	});

	// Preloaded once, so the first play is instant. `load` is new each render but one call is wanted.
	useEffect(() => {
		void engine.load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The section loops in the engine: its rendered measures mapped onto the expanded
	// timeline (a repeat inside it plays). None, and the whole tab loops. The setter is
	// new each render, so it is held in a ref and the effect follows the selection only.
	const setLoopRegionRef = useRef(engine.setLoopRegion);
	useEffect(() => {
		setLoopRegionRef.current = engine.setLoopRegion;
	});
	useEffect(() => {
		setLoopRegionRef.current(sectionRange ? regionForSelection(expanded.originMeasureIndices, sectionRange) : null);
	}, [sectionRange, expanded]);

	// One place hands the engine a new tempo, once, whatever changed it.
	const appliedBpmRef = useRef(bpm);
	useEffect(() => {
		if (bpm === appliedBpmRef.current) return;
		appliedBpmRef.current = bpm;
		engine.applyBpmChange(bpm);
	}, [bpm, engine]);

	const options = { loop: true, loopGapSeconds: loopGap, forceLetRing: true };

	function startAt(next: FingerpickPattern, startBpm: number, offset = 0) {
		appliedBpmRef.current = startBpm;
		// forceLetRing: every note rings on (ended only by voice stealing), a fuller
		// fingerstyle sustain. A playback mode; the tab itself is untouched.
		engine.play({ ...expandFingerpickPattern(next).pattern, bpm: startBpm }, options, offset);
	}

	function play() {
		const pending = seek.takePendingSeek();
		startAt(pattern, bpm, pending ? cursor.startOffsetFor(pending) : 0);
	}

	function togglePlay() {
		navigator.vibrate?.(10);
		if (engine.isPlaying) engine.pause();
		else if (engine.isPaused) engine.resume();
		else play();
	}

	function stop() {
		engine.stop();
		seek.clearPendingSeek();
		cursor.resetCursor(sectionRange?.startMeasure ?? 0);
	}

	/** Another tab opens: silence, its own tempo, the cursor at its start. */
	function open(next: FingerpickPattern) {
		engine.stop();
		seek.clearPendingSeek();
		setBpmState(tabBpm(next));
		setDragBpm(null);
		cursor.resetCursor();
	}

	/**
	 * The open tab changed under the transport. The engine holds the tab it was
	 * started with, so a running loop restarts on the new one (expanded here: the
	 * memo catches up only on the next render).
	 */
	function restart(next: FingerpickPattern) {
		const wasPlaying = engine.isPlaying;
		engine.stop();
		if (wasPlaying) startAt(next, bpm);
		cursor.resetCursor();
	}

	function setBpm(next: number) {
		setBpmState(next);
		setDragBpm(null);
	}

	function setLoop(next: boolean) {
		engine.setPlayOnce(!next);
	}

	function setLoopGap(seconds: number) {
		setLoopGapState(seconds);
		engine.applyLoopGapChange(seconds);
	}

	return {
		isLoaded: engine.isLoaded,
		isPlaying: engine.isPlaying,
		isPaused: engine.isPaused,
		togglePlay,
		stop,
		open,
		restart,
		bpm: dragBpm ?? bpm,
		setBpm,
		/** A slider drag: shown at once, played when it ends. */
		slideBpm: setDragBpm,
		loop: !engine.playOnce,
		setLoop,
		loopGap,
		setLoopGap,
		tickLevel: engine.metronomeSubdivision as TickLevel,
		setTickLevel: (level: TickLevel) => engine.setMetronomeSubdivision(subdivisionOf(level)),
		click: {
			enabled: engine.metronomeEnabled,
			onEnabledChange: engine.setMetronomeEnabled,
			gain: engine.metronomeGain,
			onGainChange: engine.setMetronomeGain,
			max: 1,
		},
		notes: {
			enabled: notesOn,
			onEnabledChange: (on: boolean) => {
				setNotesOn(on);
				engine.setNoteGain(on ? noteLevel : 0);
			},
			gain: noteLevel,
			onGainChange: (gain: number) => {
				setNoteLevel(gain);
				if (notesOn) engine.setNoteGain(gain);
			},
			max: 2,
		},
		measure,
		cursor,
		handleTabClick: seek.handleTabClick,
	};
}
