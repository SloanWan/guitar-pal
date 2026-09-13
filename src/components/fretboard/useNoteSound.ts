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
import { useCallback, useEffect, useRef } from "react";

import {
	cancelStrums,
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

export interface NoteSound {
	/** Sound one MIDI pitch. Resolves once the note has been scheduled. */
	play: (midi: number) => Promise<void>;
}

export function useNoteSound(): NoteSound {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		return () => {
			cancelStrums();
			ctxRef.current?.close().catch(() => undefined);
			ctxRef.current = null;
			preloadRef.current = null;
		};
	}, []);

	const play = useCallback(async (midi: number) => {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		const ctx = ctxRef.current;
		if (!preloadRef.current) {
			const preload = preloadFingerpickPresets(ctx);
			preloadRef.current = preload;
			// A failed download (offline, CDN down) is forgotten so the next
			// press tries again instead of staying silent for the session.
			preload.catch(() => {
				if (preloadRef.current === preload) preloadRef.current = null;
			});
		}
		if (ctx.state === "suspended") await ctx.resume();
		await preloadRef.current;
		// The board may have unmounted while the samples were downloading.
		if (ctxRef.current !== ctx) return;
		triggerChordPreview([midi], ctx, ctx.destination, ctx.currentTime);
	}, []);

	return { play };
}
