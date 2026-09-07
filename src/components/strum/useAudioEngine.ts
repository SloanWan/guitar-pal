"use client";

import { Bar, Beat, StepValue } from "@/lib/strumPatterns";
import { DEFAULT_METER, type Meter } from "@/lib/strumMeter";
import { beatSteps, ticksPerBeat, type TickLevel } from "@/lib/strumMetronome";

import { useRef, useEffect, useState } from "react";
import {
	preloadStrumPresets,
	triggerStrum,
	cancelStrums,
	SOURCE_STOP_BUFFER_S,
	STRUM_RING_SECONDS,
	type StrumSoundType,
} from "./useGuitarSampleLoader";

// Maps strum step values to the corresponding sample type.
// DG, UG, and "" are intentionally absent — they produce no strum sound.
const STEP_TO_SOUND: Partial<Record<StepValue, StrumSoundType>> = {
	D: "down",
	D3: "down",
	U: "up",
	U3: "up",
	X: "muted",
};

/**
 * Resolves a StepValue and a buffer map to a concrete AudioBuffer (or null).
 * Returns null if the step is silent (DG, UG, ""), or if the sample has not
 * yet finished loading. Exported for unit testing only.
 */
export function _resolveStrumBuffer(
	step: StepValue,
	buffers: Partial<Record<StrumSoundType, AudioBuffer>>,
): AudioBuffer | null {
	const soundType = STEP_TO_SOUND[step];
	if (!soundType) return null;
	return buffers[soundType] ?? null;
}

/**
 * Per-bar MIDI pitches, indexed by bar. A one-element array is a single-bar
 * pattern. Three cases per bar, produced by `resolveBarChords`: the chord's
 * pitches, `null` for a chordless bar (the sample loader's default voicing), and
 * an empty array for a bar that sounds nothing — a chord the library does not
 * have, kept as a name. A silent bar still keeps its metronome ticks.
 */
export type BarPitches = readonly (readonly number[] | null)[];

export interface FlatBars {
	/** Every bar's beats concatenated — what the scheduler steps through. */
	beats: Beat[];
	/** barIndexOfBeat[i] = the bar flat beat i belongs to. */
	barIndexOfBeat: number[];
	/** barHeadFlags[i] = true when flat beat i is the first beat of its bar. */
	barHeadFlags: boolean[];
}

/**
 * Flatten Bar[] into the scheduler's beat sequence plus the bar lookup tables
 * it needs. Bar boundaries come from the bars themselves — never a hardcoded
 * beats-per-bar. Empty bars contribute nothing. Exported for unit testing only.
 */
export function _flattenBars(bars: Bar[]): FlatBars {
	const flat: FlatBars = { beats: [], barIndexOfBeat: [], barHeadFlags: [] };
	bars.forEach((bar, barIndex) => {
		bar.beats.forEach((beat, beatIndex) => {
			flat.beats.push(beat);
			flat.barIndexOfBeat.push(barIndex);
			flat.barHeadFlags.push(beatIndex === 0);
		});
	});
	return flat;
}

/**
 * Pitches for the bar currently sounding. Undefined (not null) is the "use the
 * sample loader's default voicing" signal triggerStrum expects.
 * Exported for unit testing only.
 */
export function _pitchesForBar(
	barPitches: BarPitches | undefined,
	barIndex: number,
): readonly number[] | undefined {
	return barPitches?.[barIndex] ?? undefined;
}

export function useAudioEngine(
	bars: Bar[],
	bpm: number,
	tickLevel: TickLevel,
	barPitches?: BarPitches,
	meter: Meter = DEFAULT_METER,
) {
	const audioCtxRef = useRef<AudioContext | null>(null);
	const schedulerRef = useRef<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currBeat, setCurrBeat] = useState(0);
	const [currCell, setCurrCell] = useState(0);
	const [currBar, setCurrBar] = useState(0);

	const [strumEnabled, setStrumEnabled] = useState(true);
	const [strumGain, setStrumGain] = useState(1.0);
	const [metronomeEnabled, setMetronomeEnabled] = useState(true);
	const [metronomeGain, setMetronomeGain] = useState(0.15);
	const [playOnce, setPlayOnce] = useState(false);

	const isPlayingRef = useRef(false);
	const flatBarsRef = useRef(_flattenBars(bars));

	const currBeatIdxref = useRef(0);
	const currCellIdxRef = useRef(0);
	// Position inside the beat's merged strum/metronome grid — not a cell index.
	// A step may strike a cell, sound the metronome, or both.
	const currStepIdxRef = useRef(0);
	const nextStepTimeRef = useRef(0);
	const bpmRef = useRef(bpm);
	const tickLevelRef = useRef(tickLevel);
	const meterRef = useRef(meter);
	const strumEnabledRef = useRef(strumEnabled);
	const strumGainRef = useRef(strumGain);
	const metronomeEnabledRef = useRef(metronomeEnabled);
	const metronomeGainRef = useRef(metronomeGain);
	const playOnceRef = useRef(playOnce);
	const barPitchesRef = useRef(barPitches);

	// Active source nodes tracked for cleanup on stop() and unmount.
	// Metronome oscillators that have been scheduled but may not have sounded yet.
	// Strum voices are cancelled by cancelStrums(); ticks had no cancellation path
	// at all until this list, so stopping mid-beat left the already-scheduled
	// clicks to fire into the silence.
	const activeTicksRef = useRef<OscillatorNode[]>([]);

	useEffect(() => {
		isPlayingRef.current = isPlaying;
	}, [isPlaying]);
	useEffect(() => {
		flatBarsRef.current = _flattenBars(bars);
	}, [bars]);
	useEffect(() => {
		bpmRef.current = bpm;
	}, [bpm]);
	useEffect(() => {
		tickLevelRef.current = tickLevel;
	}, [tickLevel]);
	useEffect(() => {
		meterRef.current = meter;
	}, [meter]);
	useEffect(() => {
		strumEnabledRef.current = strumEnabled;
	}, [strumEnabled]);
	useEffect(() => {
		strumGainRef.current = strumGain;
	}, [strumGain]);
	useEffect(() => {
		metronomeEnabledRef.current = metronomeEnabled;
	}, [metronomeEnabled]);
	useEffect(() => {
		metronomeGainRef.current = metronomeGain;
	}, [metronomeGain]);
	useEffect(() => {
		playOnceRef.current = playOnce;
	}, [playOnce]);
	useEffect(() => {
		barPitchesRef.current = barPitches;
	}, [barPitches]);

	// Cancel in-flight audio on unmount to prevent dangling source nodes.
	useEffect(() => {
		return () => {
			if (schedulerRef.current !== null) {
				window.clearTimeout(schedulerRef.current);
			}
			for (const osc of activeTicksRef.current) {
				try {
					osc.stop();
				} catch {
					// node may have already ended naturally
				}
			}
			activeTicksRef.current = [];
			cancelStrums();
			if (audioCtxRef.current) {
				try {
					audioCtxRef.current.close();
				} catch {
					// already closed
				}
				audioCtxRef.current = null;
			}
		};
	}, []);

	function start() {
		// Cancel any deferred cancelStrums scheduled by a previous play-once pass.
		if (schedulerRef.current !== null) {
			window.clearTimeout(schedulerRef.current);
			schedulerRef.current = null;
		}
		if (audioCtxRef.current) {
			try {
				audioCtxRef.current.close();
			} catch {
				// already closed
			}
		}
		audioCtxRef.current = new AudioContext();
		const ctx = audioCtxRef.current;

		preloadStrumPresets(ctx).catch((err: unknown) => {
			console.error("[useAudioEngine] Failed to preload strum presets:", err);
		});

		nextStepTimeRef.current = ctx.currentTime;
		setIsPlaying(true);
		scheduler();
	}

	function playTick(time: number, isAccent: boolean) {
		if (!metronomeEnabledRef.current) return;
		const ctx = audioCtxRef.current!;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.connect(gain).connect(ctx.destination);

		osc.frequency.value = isAccent ? 1200 : 800;
		gain.gain.value = isAccent ? metronomeGainRef.current * 1.5 : metronomeGainRef.current;

		osc.start(time);
		osc.stop(time + 0.05);

		// Tracked so stop() can silence a click that is scheduled but has not
		// sounded; dropped again on ended so a long session cannot accumulate
		// thousands of finished nodes.
		activeTicksRef.current.push(osc);
		osc.onended = () => {
			osc.disconnect();
			gain.disconnect();
			const i = activeTicksRef.current.indexOf(osc);
			if (i !== -1) activeTicksRef.current.splice(i, 1);
		};
	}

	function playStrum(
		time: number,
		type: StepValue,
		secondsPerCell: number,
		barIndex: number,
	): void {
		if (!strumEnabledRef.current) return;

		const soundType = STEP_TO_SOUND[type];
		if (!soundType) return;

		const pitches = _pitchesForBar(barPitchesRef.current, barIndex);
		// An empty pitch table is a bar holding a chord we have nothing for: it
		// keeps its place in the loop and sounds nothing. Undefined is the other
		// thing entirely — no chord picked, play the default voicing.
		if (pitches?.length === 0) return;

		const ctx = audioCtxRef.current!;
		const gainNode = ctx.createGain();
		gainNode.gain.value = strumGainRef.current;
		gainNode.connect(ctx.destination);
		triggerStrum(soundType, ctx, gainNode, time, secondsPerCell, pitches);
	}

	function scheduler() {
		const ctx = audioCtxRef.current!;
		const secondsPerBeat = 60 / bpmRef.current;
		const flat = flatBarsRef.current;

		// A pattern with no beats at all has nothing to schedule; bail out rather
		// than spinning the reschedule timer forever.
		if (flat.beats.length === 0) {
			setIsPlaying(false);
			return;
		}

		while (nextStepTimeRef.current < ctx.currentTime + 0.1) {
			const beat = flat.beats[currBeatIdxref.current];
			const barIndex = flat.barIndexOfBeat[currBeatIdxref.current];

			// The strum grid and the metronome are independent: how finely the
			// player drew this beat says nothing about how often they want to hear
			// a click. `beatSteps` merges the two onto their least common multiple,
			// which is what the old `beat.length === 2 && sixteenth` phantom-cell
			// branch was doing by hand for one case out of many.
			const steps = beatSteps(beat.length, ticksPerBeat(meterRef.current, tickLevelRef.current));
			const step = steps[currStepIdxRef.current] ?? steps[0];
			const secondsPerStep = secondsPerBeat / steps.length;
			// A struck cell rings until the next cell, never until the next step —
			// the metronome setting must not change how long a strum sounds.
			const secondsPerCell = secondsPerBeat / beat.length;

			if (step.tick) {
				// Every bar's first click is accented — a bar line the player can
				// hear. Not optional: a metronome that does not mark the downbeat
				// is only half a metronome.
				const isAccent =
					flat.barHeadFlags[currBeatIdxref.current] && currStepIdxRef.current === 0;
				playTick(nextStepTimeRef.current, isAccent);
			}

			if (step.cellIndex !== null) {
				playStrum(nextStepTimeRef.current, beat[step.cellIndex], secondsPerCell, barIndex);
				// The cursor follows struck cells only, so it holds its place
				// through the clicks that fall between them.
				currCellIdxRef.current = step.cellIndex;
				setCurrCell(step.cellIndex);
			}

			setCurrBeat(currBeatIdxref.current);
			setCurrBar(barIndex);

			currStepIdxRef.current += 1;
			if (currStepIdxRef.current >= steps.length) {
				currStepIdxRef.current = 0;
				currBeatIdxref.current = (currBeatIdxref.current + 1) % flat.beats.length;
				if (playOnceRef.current && currBeatIdxref.current === 0) {
					// Do not call stop() here: it would invoke cancelStrums() synchronously,
					// killing the just-scheduled last-note sources before they play.
					// Instead, defer cancelStrums() until the last note has finished decaying.
					// Re-using schedulerRef means a manual stop() click still cancels this via
					// its existing window.clearTimeout(schedulerRef.current) call.
					// The last strum lets ring past the final cell, so the wait is the
					// ring length, not one cell — otherwise play-once clips its own
					// closing chord.
					const delaySec =
						Math.max(0, nextStepTimeRef.current - ctx.currentTime) +
						STRUM_RING_SECONDS +
						SOURCE_STOP_BUFFER_S;
					schedulerRef.current = window.setTimeout(() => {
						cancelStrums();
						schedulerRef.current = null;
					}, delaySec * 1000);
					currBeatIdxref.current = 0;
					currCellIdxRef.current = 0;
					setCurrBeat(0);
					setCurrCell(0);
					setCurrBar(0);
					setIsPlaying(false);
					return;
				}
			}

			nextStepTimeRef.current += secondsPerStep;
		}

		schedulerRef.current = window.setTimeout(scheduler, 25);
	}

	function stop() {
		if (schedulerRef.current) {
			window.clearTimeout(schedulerRef.current as number);
		}
		for (const osc of activeTicksRef.current) {
			try {
				osc.stop();
			} catch {
				// node may have already ended naturally
			}
		}
		activeTicksRef.current = [];
		cancelStrums();
		currBeatIdxref.current = 0;
		currCellIdxRef.current = 0;
		currStepIdxRef.current = 0;
		setCurrBeat(0);
		setCurrCell(0);
		setCurrBar(0);
		setIsPlaying(false);
	}

	function handleSetStrumEnabled(value: boolean) {
		strumEnabledRef.current = value;
		setStrumEnabled(value);
		if (isPlayingRef.current) {
			stop();
			start();
		}
	}

	function handleSetMetronomeEnabled(value: boolean) {
		metronomeEnabledRef.current = value;
		setMetronomeEnabled(value);
		if (isPlayingRef.current) {
			stop();
			start();
		}
	}

	return {
		isPlaying,
		currBeat,
		currCell,
		currBar,
		start,
		stop,
		strumEnabled,
		setStrumEnabled: handleSetStrumEnabled,
		strumGain,
		setStrumGain,
		metronomeEnabled,
		setMetronomeEnabled: handleSetMetronomeEnabled,
		metronomeGain,
		setMetronomeGain,
		playOnce,
		setPlayOnce,
	};
}
