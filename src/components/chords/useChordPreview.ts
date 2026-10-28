"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
	CHORD_PREVIEW_DURATION_S,
	SOURCE_STOP_BUFFER_S,
} from "@/components/strum/useGuitarSampleLoader";

export interface ChordPreview {
	/** True from the moment a preview starts until its notes have decayed. */
	readonly isPlaying: boolean;
	/** True while the sample presets for the first playback are still downloading. */
	readonly isPreloading: boolean;
	play: (pitches: readonly number[]) => Promise<void>;
}

/**
 * One strum of a chord, on an audio context made on the first play (browsers
 * refuse one made before a gesture) and closed, with its decay timer, on unmount.
 * One instance per surface, so every diagram on it shares the context and presets.
 */
export function useChordPreview(): ChordPreview {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [isPreloading, setIsPreloading] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);

	useEffect(
		() => () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			ctxRef.current?.close().catch(() => undefined);
		},
		[],
	);

	const play = useCallback(async (pitches: readonly number[]) => {
		if (pitches.length === 0) return;
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() => setIsPreloading(false));
		}
		const ctx = ctxRef.current;
		if (ctx.state === "suspended") await ctx.resume();
		await preloadRef.current;

		if (timerRef.current !== null) clearTimeout(timerRef.current);
		setIsPlaying(true);
		triggerChordPreview(pitches, ctx, ctx.destination, ctx.currentTime);
		timerRef.current = setTimeout(
			() => {
				setIsPlaying(false);
				timerRef.current = null;
			},
			(CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000,
		);
	}, []);

	return { isPlaying, isPreloading, play };
}
