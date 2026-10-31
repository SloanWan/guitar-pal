"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import { indexPattern } from "@/lib/fingerpickIndex";
import { clampBpmToMeter } from "@/lib/strumBars";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { useTempo } from "@/components/fingerpick/useTempo";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";

/**
 * A draft played in the panel beside the book (#233, #404): the fingerpick
 * engine on its own context, the tempo, the staves packed to the panel's
 * width with a playhead over them, and Space to play and pause as on the Tab
 * page. One per draft: the panel is keyed on it, so a switch starts clean,
 * and unmounting stops playback and closes the context (the engine's own).
 */
export function useDraftPlayback(pattern: FingerpickPattern) {
	// Repeats flattened for playback; the staves stay compact.
	const expanded = useMemo(() => expandFingerpickPattern(pattern), [pattern]);
	const engine = useFingerpickAudioEngine();
	const { isPlaying, isPaused, pause, resume, play, stop, getPlaybackProgress, applyBpmChange } = engine;

	const patternBpm = clampBpmToMeter(pattern.bpm, pattern.timeSignature);
	const { bpm, handleBpmChange } = useTempo({
		initialBpm: patternBpm,
		timeSignature: pattern.timeSignature,
		isPlaying,
		pause,
		resume,
		applyBpmChange,
	});

	// The staves are packed to the panel's real width, known once it is on
	// screen. The viewer arrives after this hook's first run (the panel mounts
	// its body late), so it is watched from a state, not a mount-time ref.
	const viewerRef = useRef<HTMLDivElement>(null);
	const [viewerEl, setViewerEl] = useState<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		if (!viewerEl) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(viewerEl);
		return () => observer.disconnect();
	}, [viewerEl]);
	const renderContext = useMemo(() => ({ index: indexPattern(pattern) }), [pattern]);
	const rows = useMemo(
		() => layoutMeasureRows(pattern.measures, width, 0, undefined, renderContext),
		[pattern.measures, width, renderContext],
	);

	const { cursorRef, measureHighlightRef, rowRefs, resetCursor } = usePlaybackCursor({
		tabViewerRef: viewerRef,
		expanded,
		bpm,
		rows,
		isPlaying,
		getPlaybackProgress,
	});

	function playPause() {
		if (isPlaying) pause();
		// forceLetRing, as the Tab page plays: the fuller fingerstyle sustain,
		// with the pattern data untouched.
		else if (isPaused) resume();
		else play({ ...expanded.pattern, bpm }, { loop: true, forceLetRing: true });
	}

	function stopAndRewind() {
		stop();
		resetCursor();
	}

	// Space plays and pauses — not in a field, not behind a dialog. Subscribed
	// once, through a ref, so the listener is never stale.
	const playPauseRef = useRef(playPause);
	useEffect(() => {
		playPauseRef.current = playPause;
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

	return {
		engine,
		bpm,
		patternBpm,
		setBpm: handleBpmChange,
		playPause,
		stop: stopAndRewind,
		rows,
		renderContext,
		viewer: (el: HTMLDivElement | null) => {
			viewerRef.current = el;
			setViewerEl(el);
		},
		cursorRef,
		measureHighlightRef,
		rowRefs,
	};
}
