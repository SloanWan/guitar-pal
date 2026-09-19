"use client";

/**
 * Plays a sequence of steps in time, and says which one is sounding.
 *
 * A step is one or more pitches sounded together: a scale run is a step per
 * note, a chord progression a step per bar. The steps are scheduled on the
 * AudioContext's clock a pass at a time, so the sound is sample-accurate; a
 * parallel `setTimeout` per step moves the playhead, because the DOM has no
 * way to be woken by the audio clock. The two can drift by a frame, which
 * nobody can see, and never by more, because both are computed from the same
 * start time rather than from each other.
 *
 * A looping sequence schedules its next pass from the absolute time the
 * current one ends, a little before it does, so passes neither overlap nor
 * gap however long it runs.
 *
 * Deliberately not `useAudioEngine`: that schedules a repeating bar of strum
 * cells with a lookahead window, on a context of its own that the page's
 * faders cannot reach. Everything here plays through the page's bus.
 *
 * Constraint 4: every timer is cleared and every note cancelled on stop and
 * on unmount.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { cancelPianoNotes, triggerPianoNote } from "@/components/fretboard/pianoSampleLoader";
import type { NoteVoice } from "@/components/fretboard/useNoteSound";
import { cancelStrums, triggerChordPreview } from "@/components/strum/useGuitarSampleLoader";
import type { SequenceStep } from "@/lib/fretboard/sequence";

/** Which instrument a sequence is heard on. Both shows the same notes twice over. */
export type RunVoice = NoteVoice | "both";

export const RUN_VOICES: readonly RunVoice[] = ["guitar", "piano", "both"];

/** Scheduled a little ahead, so the first step is not already late. */
const LEAD_IN_S = 0.12;

export interface PlayOptions {
	/** Start again from the first step when the last has sounded, until stopped. */
	loop?: boolean;
}

export interface SequencePlayer {
	/** True from the moment a sequence starts until its last step has sounded, or until stopped. */
	isPlaying: boolean;
	/** Index of the step sounding now, or -1 between sequences. */
	currentIndex: number;
	/** Schedule a sequence. Replaces whatever was playing. */
	play: (steps: readonly SequenceStep[], spacingSeconds: number, voice: RunVoice, options?: PlayOptions) => void;
	stop: () => void;
}

export interface SequencePlayerOptions {
	/** The context and gain nodes to play through; null until the first press. */
	audio: () => { ctx: AudioContext; target: (voice: NoteVoice) => AudioNode } | null;
	/** Called as each step sounds, so the board and the keyboard can light up. */
	onStep?: (step: SequenceStep, index: number) => void;
}

export function useSequencePlayer({ audio, onStep }: SequencePlayerOptions): SequencePlayer {
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(-1);
	// Read by the timers, which outlive the render that made them.
	const onStepRef = useRef(onStep);
	useEffect(() => {
		onStepRef.current = onStep;
	}, [onStep]);

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
		(steps: readonly SequenceStep[], spacingSeconds: number, voice: RunVoice, options: PlayOptions = {}) => {
			clearTimers();
			cancelStrums();
			cancelPianoNotes();
			const ready = audio();
			if (!ready || steps.length === 0) {
				setIsPlaying(false);
				setCurrentIndex(-1);
				return;
			}
			const { ctx, target } = ready;
			const voices: NoteVoice[] = voice === "both" ? ["guitar", "piano"] : [voice];
			const passSeconds = steps.length * spacingSeconds;
			// A timer forgets itself once it fires, so a loop that runs for an
			// hour holds only the timers still to come.
			const after = (when: number, fn: () => void) => {
				const id = setTimeout(
					() => {
						timers.current = timers.current.filter((t) => t !== id);
						fn();
					},
					Math.max(0, (when - ctx.currentTime) * 1000),
				);
				timers.current.push(id);
			};

			// One pass: every step's sound on the audio clock, its playhead on
			// the wall clock, both from `start`, so they cannot drift apart
			// however long the sequence is.
			const schedulePass = (start: number) => {
				steps.forEach((step, i) => {
					const when = start + i * spacingSeconds;
					for (const v of voices) {
						if (v === "piano") for (const midi of step.midis) triggerPianoNote(midi, ctx, target("piano"), when);
						else triggerChordPreview(step.midis, ctx, target("guitar"), when);
					}
					after(when, () => {
						setCurrentIndex(i);
						onStepRef.current?.(step, i);
					});
				});
				const end = start + passSeconds;
				if (options.loop) {
					// The next pass is placed just before this one runs out, from
					// the absolute time it ends, so the seam is neither late nor early.
					after(end - LEAD_IN_S, () => schedulePass(end));
				} else {
					after(end, () => {
						setIsPlaying(false);
						setCurrentIndex(-1);
					});
				}
			};

			schedulePass(ctx.currentTime + LEAD_IN_S);
			setIsPlaying(true);
		},
		[audio, clearTimers],
	);

	return { isPlaying, currentIndex, play, stop };
}
