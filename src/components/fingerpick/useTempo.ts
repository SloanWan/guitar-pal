import { useRef, useState } from "react";
import { clampBpmToMeter } from "@/lib/strumBars";
import type { Meter } from "@/lib/strumMeter";

export interface TempoArgs {
	initialBpm: number;
	/** The pattern's meter: BPM counts its beat, and a compound meter has a lower ceiling. */
	timeSignature: Meter;
	isPlaying: boolean;
	pause: () => void;
	resume: () => void;
	/** The engine's reschedule at a new tempo (keeps the musical position). */
	applyBpmChange: (bpm: number) => void;
}

export interface Tempo {
	bpm: number;
	/** A new pattern: show its tempo without rescheduling anything. */
	resetBpm: (bpm: number) => void;
	/** Used by the ±1/±10 buttons, tap tempo and reset — always reschedules immediately. */
	handleBpmChange: (bpm: number) => void;
	/** Slider ticks: display updates at once, rescheduling waits for the drag to end. */
	handleSliderChange: (raw: number) => void;
	handleSliderPointerDown: () => void;
	handleSliderPointerUp: () => void;
	handleTapTempo: () => void;
}

/**
 * The page's tempo: the number shown, and how the slider decouples its drag
 * ticks from rescheduling so a drag never restarts playback mid-gesture.
 */
export function useTempo({
	initialBpm,
	timeSignature,
	isPlaying,
	pause,
	resume,
	applyBpmChange,
}: TempoArgs): Tempo {
	const [bpm, setBpm] = useState<number>(initialBpm);
	// Tracks the latest BPM value during slider drag so onPointerUp reads the
	// correct final value regardless of React batching.
	const dragBpmRef = useRef(initialBpm);
	// True while the user has the slider thumb pressed (drag gesture in progress).
	const isDraggingSliderRef = useRef(false);
	// True if playback was active when the drag started (so we resume on release).
	const wasPlayingRef = useRef(false);
	const tapTimesRef = useRef<number[]>([]);

	function resetBpm(next: number) {
		setBpm(next);
		dragBpmRef.current = next;
	}

	function handleBpmChange(newBpm: number) {
		const clamped = clampBpmToMeter(newBpm, timeSignature);
		setBpm(clamped);
		applyBpmChange(clamped);
	}

	function handleSliderChange(rawValue: number) {
		const clamped = clampBpmToMeter(rawValue, timeSignature);
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

	return {
		bpm,
		resetBpm,
		handleBpmChange,
		handleSliderChange,
		handleSliderPointerDown,
		handleSliderPointerUp,
		handleTapTempo,
	};
}
