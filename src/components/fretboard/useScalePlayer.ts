"use client";

/**
 * Plays a list of notes in time, and says which one is sounding.
 *
 * The notes are scheduled on the AudioContext's clock all at once, so the
 * sound is sample-accurate; a parallel `setTimeout` per note moves the
 * playhead, because the DOM has no way to be woken by the audio clock. The
 * two can drift by a frame, which nobody can see, and never by more, because
 * both are computed from the same start time rather than from each other.
 *
 * Deliberately not `useAudioEngine`: that schedules a repeating bar of strum
 * cells with a lookahead window, and a scale run is a finite list played once.
 * Borrowing it would mean bending a loop into a one-shot.
 *
 * Constraint 4: every timer is cleared and every note cancelled on stop and
 * on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { cancelPianoNotes, triggerPianoNote } from "@/components/fretboard/pianoSampleLoader";
import type { NoteVoice } from "@/components/fretboard/useNoteSound";
import { cancelStrums, triggerChordPreview } from "@/components/strum/useGuitarSampleLoader";
import type { SlotNote } from "@/lib/fretboard/positions";

/** Which instrument a run is heard on. Both shows the same notes twice over. */
export type RunVoice = NoteVoice | "both";

export const RUN_VOICES: readonly RunVoice[] = ["guitar", "piano", "both"];

/** Scheduled a little ahead, so the first note is not already late. */
const LEAD_IN_S = 0.12;

export interface ScalePlayer {
	/** True from the moment a run starts until its last note has sounded. */
	isPlaying: boolean;
	/** Index of the note sounding now, or -1 between runs. */
	currentIndex: number;
	/** Schedule a run. Replaces whatever was playing. */
	play: (notes: readonly SlotNote[], spacingSeconds: number, voice: RunVoice) => void;
	stop: () => void;
}

export interface ScalePlayerOptions {
	/** The context and gain nodes to play through; null until the first press. */
	audio: () => { ctx: AudioContext; target: (voice: NoteVoice) => AudioNode } | null;
	/** Called as each note sounds, so the board and the keyboard can light up. */
	onNote?: (note: SlotNote, index: number) => void;
}

export function useScalePlayer({ audio, onNote }: ScalePlayerOptions): ScalePlayer {
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(-1);
	// Read by the timers, which outlive the render that made them.
	const onNoteRef = useRef(onNote);
	useEffect(() => {
		onNoteRef.current = onNote;
	}, [onNote]);

	const clearTimers = useCallback(() => {
		for (const t of timers.current) clearTimeout(t);
		timers.current = [];
	}, []);

	const stop = useCallback(() => {
		clearTimers();
		cancelStrums();
		cancelPianoNotes();
		setIsPlaying(false);
		setCurrentIndex(-1);
	}, [clearTimers]);

	useEffect(() => stop, [stop]);

	const play = useCallback(
		(notes: readonly SlotNote[], spacingSeconds: number, voice: RunVoice) => {
			clearTimers();
			cancelStrums();
			cancelPianoNotes();
			const ready = audio();
			if (!ready || notes.length === 0) {
				setIsPlaying(false);
				setCurrentIndex(-1);
				return;
			}
			const { ctx, target } = ready;
			const start = ctx.currentTime + LEAD_IN_S;
			const voices: NoteVoice[] = voice === "both" ? ["guitar", "piano"] : [voice];

			notes.forEach((note, i) => {
				const when = start + i * spacingSeconds;
				for (const v of voices) {
					if (v === "piano") triggerPianoNote(note.midi, ctx, target("piano"), when);
					else triggerChordPreview([note.midi], ctx, target("guitar"), when);
				}
				// The playhead runs off the wall clock; both come from `start`,
				// so they cannot drift apart however long the run is.
				timers.current.push(
					setTimeout(
						() => {
							setCurrentIndex(i);
							onNoteRef.current?.(note, i);
						},
						(when - ctx.currentTime) * 1000,
					),
				);
			});

			const endMs = (start - ctx.currentTime + notes.length * spacingSeconds) * 1000;
			timers.current.push(
				setTimeout(() => {
					setIsPlaying(false);
					setCurrentIndex(-1);
				}, endMs),
			);
			setIsPlaying(true);
		},
		[audio, clearTimers],
	);

	return { isPlaying, currentIndex, play, stop };
}
