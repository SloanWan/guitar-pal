import { useEffect, useMemo, useState } from "react";
import type { Bar, Beat, ChordProgression } from "@/lib/strumPatterns";
import { barPlaceholder, resolveBarChords, transposeBarPitches, type VoicingLookup } from "@/lib/strumBars";
import { progressionPlayback } from "@/lib/strumRhythm";
import { progressionCapo } from "@/lib/strumProgressions";
import { barLocalBeatIndex } from "@/lib/strumBarEdit";
import { isCompound, type Meter } from "@/lib/strumMeter";
import { ticksPerBeat, type TickLevel } from "@/lib/strumMetronome";
import { STRUM_PITCHES } from "@/components/strum/useGuitarSampleLoader";
import { useAudioEngine, type BarPitches } from "@/components/strum/useAudioEngine";
import type { RhythmPosition } from "@/components/strum/stage/RhythmGrid";

interface Args {
	rhythm: Beat[][];
	/** The open sequence, or null for the rhythm alone. */
	progression: ChordProgression | null;
	meter: Meter;
	bpm: number;
	lookupVoicings: VoicingLookup;
	/** Changes when one of the player's own shapes is written or edited. */
	voicingsKey: string;
}

/**
 * The engine, fed: the sequence laid over the rhythm, its chords resolved to
 * pitches (behind any capo), and where the playhead is in each of the two.
 */
export function useStrumPlayback({ rhythm, progression, meter, bpm, lookupVoicings, voicingsKey }: Args) {
	const playKey = JSON.stringify(progressionPlayback(rhythm, progression));
	const playBars = useMemo(() => JSON.parse(playKey) as Bar[], [playKey]);
	const capo = progressionCapo(progression);

	// Pitches only care about the chords, so a rhythm edit does not re-resolve them.
	const chordKey = JSON.stringify(playBars.map(({ chord, unknownChord }) => ({ chord, unknownChord })));
	const [barPitches, setBarPitches] = useState<BarPitches>([]);
	useEffect(() => {
		const bars = JSON.parse(chordKey) as Bar[];
		// Silent bars are silent before the lookups settle too, or a placeholder
		// would sound the default voicing for the first loop after loading.
		queueMicrotask(() => setBarPitches(bars.map((bar) => (barPlaceholder(bar) ? [] : null))));
		let cancelled = false;
		resolveBarChords(bars, lookupVoicings)
			.then((pitches) => {
				if (!cancelled) setBarPitches(transposeBarPitches(pitches, capo, STRUM_PITCHES));
			})
			.catch((err: unknown) => console.error("[strum] chord resolution failed:", err));
		return () => {
			cancelled = true;
		};
	}, [chordKey, capo, lookupVoicings, voicingsKey]);

	const [tickChoice, setTickLevel] = useState<TickLevel>("beat");
	// A compound beat already divides in three; its triplet is its division.
	const tickLevel: TickLevel = tickChoice === "triplet" && isCompound(meter) ? "division" : tickChoice;

	const engine = useAudioEngine(playBars, bpm, tickLevel, barPitches, meter);
	const { isPlaying, currBar, currBeat, currCell } = engine;

	const beat = barLocalBeatIndex(playBars, currBeat);
	const rhythmPosition: RhythmPosition | null = isPlaying
		? { bar: currBar % Math.max(1, rhythm.length), beat, cell: currCell }
		: null;
	/** The sequence's bar sounding (or about to): the first one while stopped. */
	const chordBar = progression && progression.bars.length > 0 ? (isPlaying ? currBar % progression.bars.length : 0) : null;
	const ticks = ticksPerBeat(meter, tickLevel);
	const cells = playBars[currBar]?.beats[beat]?.length ?? 1;
	const pulse = isPlaying ? beat * ticks + Math.floor((currCell * ticks) / Math.max(1, cells)) : null;

	return {
		...engine,
		playBars,
		tickLevel,
		setTickLevel,
		ticksPerBeat: ticks,
		rhythmPosition,
		chordBar,
		pulse,
	};
}
