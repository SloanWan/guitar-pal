"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
	CHORD_PREVIEW_DURATION_S,
	SOURCE_STOP_BUFFER_S,
} from "@/components/strum/useGuitarSampleLoader";

/** Seconds between the strings of an arpeggio. */
export const ARPEGGIO_GAP_S = 0.32;

export interface ChordPreview {
	/** True from the moment a preview starts until its notes have decayed. */
	readonly isPlaying: boolean;
	/** How the sounding preview was played, null when none is. */
	readonly playing: "strum" | "arpeggio" | null;
	/** Counts plays as their notes are scheduled, so a drawing can start its plucks with the sound. */
	readonly run: number;
	/** True while the sample presets for the first playback are still downloading. */
	readonly isPreloading: boolean;
	/** Makes the audio context and loads the samples, so a timed run of plays starts on time. */
	prepare: () => Promise<void>;
	play: (pitches: readonly number[]) => Promise<void>;
	/** The notes one at a time, in the order given (low string first), each left to ring. */
	arpeggiate: (pitches: readonly number[]) => Promise<void>;
}

/**
 * One strum of a chord, or its notes one by one, on an audio context made on the first play (browsers
 * refuse one made before a gesture) and closed, with its decay timer, on unmount.
 * One instance per surface, so every diagram on it shares the context and presets.
 */
export function useChordPreview(): ChordPreview {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [isPreloading, setIsPreloading] = useState(false);
	const [playing, setPlaying] = useState<"strum" | "arpeggio" | null>(null);
	const [run, setRun] = useState(0);

	useEffect(
		() => () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			ctxRef.current?.close().catch(() => undefined);
		},
		[],
	);

	const ready = useCallback(async (): Promise<AudioContext> => {
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() => setIsPreloading(false));
		}
		const ctx = ctxRef.current;
		if (ctx.state === "suspended") await ctx.resume();
		await preloadRef.current;
		return ctx;
	}, []);

	const prepare = useCallback(async () => {
		await ready();
	}, [ready]);

	const sound = useCallback(
		async (pitches: readonly number[], how: "strum" | "arpeggio") => {
			if (pitches.length === 0) return;
			const ctx = await ready();

			if (timerRef.current !== null) clearTimeout(timerRef.current);
			setPlaying(how);
			const at = ctx.currentTime;
			if (how === "strum") triggerChordPreview(pitches, ctx, ctx.destination, at);
			else pitches.forEach((pitch, i) => triggerChordPreview([pitch], ctx, ctx.destination, at + i * ARPEGGIO_GAP_S));
			setRun((n) => n + 1);
			const spread = how === "arpeggio" ? (pitches.length - 1) * ARPEGGIO_GAP_S : 0;
			timerRef.current = setTimeout(
				() => {
					setPlaying(null);
					timerRef.current = null;
				},
				(spread + CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000,
			);
		},
		[ready],
	);
	const play = useCallback((pitches: readonly number[]) => sound(pitches, "strum"), [sound]);
	const arpeggiate = useCallback((pitches: readonly number[]) => sound(pitches, "arpeggio"), [sound]);

	return { isPlaying: playing !== null, playing, run, isPreloading, prepare, play, arpeggiate };
}
