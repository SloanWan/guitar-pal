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

// Owns one AudioContext for chord playback and shares it across every diagram that
// wants to sound — the inline voicing gallery and the modal both consume a single
// instance, so a preview never opens a second context or re-downloads presets.
//
// The context is created lazily on first play (browsers reject one built before a user
// gesture) and closed on unmount along with the pending decay timer, so an unmounted
// component leaves no live audio node or scheduled callback behind.
export function useChordPreview(): ChordPreview {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const playingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [isPreloading, setIsPreloading] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);

	useEffect(() => {
		return () => {
			ctxRef.current?.close().catch(() => undefined);
			if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
		};
	}, []);

	const play = useCallback(async (pitches: readonly number[]) => {
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() => {
				setIsPreloading(false);
			});
		}
		if (ctxRef.current.state === "suspended") {
			await ctxRef.current.resume();
		}
		await preloadRef.current;

		if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
		setIsPlaying(true);
		triggerChordPreview(
			pitches,
			ctxRef.current,
			ctxRef.current.destination,
			ctxRef.current.currentTime,
		);
		playingTimerRef.current = setTimeout(
			() => {
				setIsPlaying(false);
				playingTimerRef.current = null;
			},
			(CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000,
		);
	}, []);

	return { isPlaying, isPreloading, play };
}
