"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useNoteSound } from "@/components/fretboard/useNoteSound";
import { preloadStrumPresets, triggerStrum } from "@/components/strum/useGuitarSampleLoader";
import { advanceTuning, isLateNight } from "@/lib/landing/eggs";

/**
 * The landing's easter eggs that are not part of a step: tuning up from the
 * keyboard, a line for the late-night visitor, and the air strum the grid
 * hands its sweeps to. The rules are `lib/landing/eggs.ts`; this is wiring.
 */

/** Typing goes to a field, not to the guitar. */
function typingInField(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
	);
}

/** E A D G B E on the keyboard sounds the open strings one by one; the sixth says so. Renders nothing. */
export function TuningEgg() {
	const { play } = useNoteSound();
	const progressRef = useRef(0);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || typingInField(e.target)) return;
			const step = advanceTuning(progressRef.current, e.key);
			progressRef.current = step.progress;
			if (step.midi !== null) void play(step.midi);
			if (step.done) toast("In tune. Let's play.");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [play]);
	return null;
}

const noSubscribe = () => () => {};

/** One more line under the hero's, only between midnight and five on the visitor's clock. */
export function LateNightLine({ className = "" }: { className?: string }) {
	// The server cannot know the visitor's hour: it renders nothing, the client decides.
	const late = useSyncExternalStore(noSubscribe, () => isLateNight(new Date()), () => false);
	if (!late) return null;
	return <p className={className}>Late-night practice? Your neighbours say hi.</p>;
}

/**
 * A strum on demand, for the air guitar: its own context with the strum
 * presets, so nothing is shared with — or cancelled under — the song player.
 * A context can only sound after the visitor has pressed something, so a
 * sweep before any press is ignored rather than queued.
 */
export function useAirStrum(): (direction: "down" | "up", pitches: readonly number[]) => void {
	const ctxRef = useRef<AudioContext | null>(null);
	const readyRef = useRef<Promise<void> | null>(null);

	useEffect(
		() => () => {
			void ctxRef.current?.close();
			ctxRef.current = null;
			readyRef.current = null;
		},
		[],
	);

	return useCallback((direction, pitches) => {
		const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
		if (activation && !activation.hasBeenActive) return;
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			readyRef.current = preloadStrumPresets(ctxRef.current);
		}
		const ctx = ctxRef.current;
		if (ctx.state === "suspended") void ctx.resume();
		void readyRef.current?.then(() => {
			if (ctxRef.current !== ctx) return;
			triggerStrum(direction, ctx, ctx.destination, ctx.currentTime, 0.4, pitches);
		});
	}, []);
}
