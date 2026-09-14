"use client";

/**
 * One note at a time from the fretboard page, in either of its two voices:
 * the guitar pluck preset the chord preview already uses (for the neck) and
 * the piano preset (for the root selector's keys).
 *
 * The AudioContext is created on the first press (browsers reject one built
 * before a user gesture). Each voice's samples are fetched once, on the first
 * press of that voice. Unmount stops any note still ringing and closes the
 * context, so a board that goes away leaves no source node or scheduled
 * callback behind (Constraint 4).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
	cancelPianoNotes,
	preloadPianoPreset,
	triggerPianoNote,
} from "@/components/fretboard/pianoSampleLoader";
import {
	cancelStrums,
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

export type NoteVoice = "guitar" | "piano";

export interface NoteSound {
	/**
	 * Sound one MIDI pitch in a voice (guitar by default). Resolves once the
	 * note has been scheduled, or at once if that voice's samples are still
	 * downloading: the press that started the download plays when it lands,
	 * presses in between are dropped rather than fired as a burst.
	 */
	play: (midi: number, voice?: NoteVoice) => Promise<void>;
	/** Sound several pitches at once, low to high with a strum's stagger. Same loading rules. */
	playChord: (midis: readonly number[], voice?: NoteVoice) => Promise<void>;
	/** True while any voice's samples are downloading for a first press. */
	isLoading: boolean;
}

/** Per-note offset inside a chord, the strum engine's own. */
const CHORD_STAGGER_S = 0.01;

const VOICES: Record<
	NoteVoice,
	{
		preload: (ctx: AudioContext) => Promise<void>;
		trigger: (midis: readonly number[], ctx: AudioContext) => void;
	}
> = {
	guitar: {
		preload: preloadFingerpickPresets,
		// The preview already sorts and staggers the strings.
		trigger: (midis, ctx) => triggerChordPreview(midis, ctx, ctx.destination, ctx.currentTime),
	},
	piano: {
		preload: preloadPianoPreset,
		trigger: (midis, ctx) => {
			[...midis]
				.sort((a, b) => a - b)
				.forEach((midi, i) => triggerPianoNote(midi, ctx, ctx.destination, ctx.currentTime + i * CHORD_STAGGER_S));
		},
	},
};

export function useNoteSound(): NoteSound {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloads = useRef(new Map<NoteVoice, Promise<void>>());
	const ready = useRef(new Set<NoteVoice>());
	const [loadingCount, setLoadingCount] = useState(0);

	useEffect(() => {
		const inFlight = preloads.current;
		const done = ready.current;
		return () => {
			cancelStrums();
			cancelPianoNotes();
			ctxRef.current?.close().catch(() => undefined);
			ctxRef.current = null;
			inFlight.clear();
			done.clear();
		};
	}, []);

	const playChord = useCallback(async (midis: readonly number[], voice: NoteVoice = "guitar") => {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		const ctx = ctxRef.current;
		if (!ready.current.has(voice)) {
			if (preloads.current.has(voice)) return;
			const preload = VOICES[voice].preload(ctx);
			preloads.current.set(voice, preload);
			setLoadingCount((n) => n + 1);
			try {
				await preload;
				ready.current.add(voice);
			} catch (err) {
				// A failed download (offline, CDN down) is forgotten so the next
				// press tries again instead of staying silent for the session.
				preloads.current.delete(voice);
				throw err;
			} finally {
				// Skip the state write if the board went away mid-download.
				if (ctxRef.current === ctx) setLoadingCount((n) => n - 1);
			}
		}
		// The board may have unmounted while the samples were downloading.
		if (ctxRef.current !== ctx) return;
		if (ctx.state === "suspended") await ctx.resume();
		VOICES[voice].trigger(midis, ctx);
	}, []);

	const play = useCallback((midi: number, voice: NoteVoice = "guitar") => playChord([midi], voice), [playChord]);

	return { play, playChord, isLoading: loadingCount > 0 };
}
