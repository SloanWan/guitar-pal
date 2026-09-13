"use client";

/**
 * One note at a time from the fretboard: the pluck preset the chord preview
 * already uses, handed a single pitch.
 *
 * The AudioContext is created on the first press (browsers reject one built
 * before a user gesture) and the presets are fetched once, on that same press.
 * Unmount stops any note still ringing and closes the context, so a board that
 * goes away leaves no source node or scheduled callback behind (Constraint 4).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
	cancelStrums,
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

export interface NoteSound {
	/**
	 * Sound one MIDI pitch. Resolves once the note has been scheduled, or at
	 * once if the samples are still downloading: the press that started the
	 * download plays when it lands, presses in between are dropped rather
	 * than fired as a burst.
	 */
	play: (midi: number) => Promise<void>;
	/** True while the samples for the first press are downloading. */
	isLoading: boolean;
}

export function useNoteSound(): NoteSound {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const readyRef = useRef(false);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		return () => {
			cancelStrums();
			ctxRef.current?.close().catch(() => undefined);
			ctxRef.current = null;
			preloadRef.current = null;
			readyRef.current = false;
		};
	}, []);

	const play = useCallback(async (midi: number) => {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		const ctx = ctxRef.current;
		if (!readyRef.current) {
			if (preloadRef.current) return;
			const preload = preloadFingerpickPresets(ctx);
			preloadRef.current = preload;
			setIsLoading(true);
			try {
				await preload;
				readyRef.current = true;
			} catch (err) {
				// A failed download (offline, CDN down) is forgotten so the next
				// press tries again instead of staying silent for the session.
				preloadRef.current = null;
				throw err;
			} finally {
				// Skip the state write if the board went away mid-download.
				if (ctxRef.current === ctx) setIsLoading(false);
			}
		}
		// The board may have unmounted while the samples were downloading.
		if (ctxRef.current !== ctx) return;
		if (ctx.state === "suspended") await ctx.resume();
		triggerChordPreview([midi], ctx, ctx.destination, ctx.currentTime);
	}, []);

	return { play, isLoading };
}
