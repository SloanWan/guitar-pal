"use client";

import { useEffect, useRef, useState } from "react";
import type { Bar } from "@/lib/strumPatterns";
import { resolveBarChords, transposeBarPitches } from "@/lib/strumBars";
import { barLocalBeatIndex } from "@/lib/strumBarEdit";
import { loadVoicings } from "@/lib/chordVoicingCache";
import type { Meter } from "@/lib/strumMeter";
import { claimAudition } from "@/lib/assistant/audition";
import { STRUM_PITCHES } from "@/components/strum/useGuitarSampleLoader";
import { useAudioEngine, type BarPitches } from "@/components/strum/useAudioEngine";
import type { RhythmPosition } from "@/components/strum/stage/RhythmGrid";

interface Args {
	bars: Bar[];
	bpm: number;
	capo: number;
	meter: Meter;
	/** How many bars the drawn rhythm has, for the playhead on it. */
	rhythmBars: number;
}

/**
 * A card's bars, played once on the strum page's own engine — no metronome,
 * the chords resolved behind the capo. Hearing one card silences any other.
 */
export function useStrumAudition({ bars, bpm, capo, meter, rhythmBars }: Args) {
	const chordKey = JSON.stringify(bars.map(({ chord, unknownChord }) => ({ chord, unknownChord })));
	const [barPitches, setBarPitches] = useState<BarPitches | null>(null);
	useEffect(() => {
		let cancelled = false;
		resolveBarChords(JSON.parse(chordKey) as Bar[], (ref) => loadVoicings(ref.root, ref.suffix))
			.then((pitches) => {
				if (!cancelled) setBarPitches(transposeBarPitches(pitches, capo, STRUM_PITCHES));
			})
			.catch((err: unknown) => console.error("[assistant] chord resolution failed:", err));
		return () => {
			cancelled = true;
		};
	}, [chordKey, capo]);

	const engine = useAudioEngine(bars, bpm, "beat", barPitches ?? undefined, meter);
	// Once: the setters are new every render, and the metronome setter restarts playback.
	const setupRef = useRef(engine);
	useEffect(() => {
		setupRef.current.setPlayOnce(true);
		setupRef.current.setMetronomeEnabled(false);
	}, []);

	const { isPlaying, isPreparing, currBar, currBeat, currCell, start, stop } = engine;
	const sounding = isPlaying || isPreparing;
	const releaseRef = useRef<(() => void) | null>(null);
	useEffect(() => {
		if (sounding) return;
		releaseRef.current?.();
		releaseRef.current = null;
	}, [sounding]);
	useEffect(() => () => releaseRef.current?.(), []);

	function toggle() {
		if (sounding) return stop();
		releaseRef.current = claimAudition(stop);
		start();
	}

	const position: RhythmPosition | null = isPlaying
		? { bar: currBar % Math.max(1, rhythmBars), beat: barLocalBeatIndex(bars, currBeat), cell: currCell }
		: null;

	return {
		/** False until the chords are resolved, so nothing plays the default shape in their place. */
		ready: barPitches !== null,
		isPlaying,
		isPreparing,
		/** The bar sounding, null while stopped. */
		bar: isPlaying ? currBar : null,
		position,
		toggle,
	};
}
