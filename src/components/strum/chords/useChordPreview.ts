import { useEffect, useRef, useState } from "react";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { chordVoicingToMidi } from "@/lib/chordVoicingToMidi";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
	CHORD_PREVIEW_DURATION_S,
	SOURCE_STOP_BUFFER_S,
} from "@/components/strum/useGuitarSampleLoader";

/**
 * "Hear it": one strum of a shape, on an audio context of its own that is made
 * on the first press and closed with the component.
 */
export function useChordPreview() {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [sounding, setSounding] = useState(false);

	useEffect(
		() => () => {
			if (timerRef.current !== null) clearTimeout(timerRef.current);
			ctxRef.current?.close().catch(() => undefined);
		},
		[],
	);

	async function play(voicing: ChordVoicing) {
		const pitches = chordVoicingToMidi(voicing).map((n) => n.midi);
		if (pitches.length === 0) return;
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			preloadRef.current = preloadFingerpickPresets(ctxRef.current);
		}
		const ctx = ctxRef.current;
		if (ctx.state === "suspended") await ctx.resume();
		await preloadRef.current;
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		setSounding(true);
		triggerChordPreview(pitches, ctx, ctx.destination, ctx.currentTime);
		timerRef.current = setTimeout(() => {
			setSounding(false);
			timerRef.current = null;
		}, (CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000);
	}

	return { play, sounding };
}
