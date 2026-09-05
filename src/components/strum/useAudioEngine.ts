"use client";

import { Bar, Beat, StepValue, TickMode } from "@/lib/strumPatterns";

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

/** Per-bar MIDI pitches, indexed by bar. A one-element array is a single-bar pattern. */
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
	tickMode: TickMode,
	barPitches?: BarPitches,
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
	const [accentEnabled, setAccentEnabled] = useState(true);
	const [playOnce, setPlayOnce] = useState(false);

	const isPlayingRef = useRef(false);
	const flatBarsRef = useRef(_flattenBars(bars));

	const currBeatIdxref = useRef(0);
	const currCellIdxRef = useRef(0);
	const nextCellTimeRef = useRef(0);
	const bpmRef = useRef(bpm);
	const tickModeRef = useRef(tickMode);
	const nextPlatEmptyCellRef = useRef(false);
	const strumEnabledRef = useRef(strumEnabled);
	const strumGainRef = useRef(strumGain);
	const metronomeEnabledRef = useRef(metronomeEnabled);
	const metronomeGainRef = useRef(metronomeGain);
	const accentEnabledRef = useRef(accentEnabled);
	const playOnceRef = useRef(playOnce);
	const barPitchesRef = useRef(barPitches);

	// Active source nodes tracked for cleanup on stop() and unmount.
	const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

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
		tickModeRef.current = tickMode;
	}, [tickMode]);
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
		accentEnabledRef.current = accentEnabled;
	}, [accentEnabled]);
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
			for (const source of activeSourcesRef.current) {
				try {
					source.stop();
				} catch {
					// node may have already ended naturally
				}
			}
			activeSourcesRef.current = [];
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

		nextCellTimeRef.current = ctx.currentTime;
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

		const ctx = audioCtxRef.current!;
		const gainNode = ctx.createGain();
		gainNode.gain.value = strumGainRef.current;
		gainNode.connect(ctx.destination);
		triggerStrum(
			soundType,
			ctx,
			gainNode,
			time,
			secondsPerCell,
			_pitchesForBar(barPitchesRef.current, barIndex),
		);
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

		while (nextCellTimeRef.current < ctx.currentTime + 0.1) {
			const beat = flat.beats[currBeatIdxref.current];
			const barIndex = flat.barIndexOfBeat[currBeatIdxref.current];
			const secondsPerCell =
				beat.length === 2 && tickModeRef.current === "sixteenth"
					? secondsPerBeat / 4
					: secondsPerBeat / beat.length;

			const shouldNotTick =
				(tickModeRef.current === "quarter" && currCellIdxRef.current != 0) ||
				(tickModeRef.current === "eighth" &&
					beat.length === 4 &&
					(currCellIdxRef.current === 1 || currCellIdxRef.current === 3));

			if (!shouldNotTick) {
				// Accent lands on the first beat of every bar. For a single-bar
				// pattern that is beat 0, exactly as before.
				const isAccent =
					accentEnabledRef.current &&
					flat.barHeadFlags[currBeatIdxref.current] &&
					currCellIdxRef.current === 0;
				playTick(nextCellTimeRef.current, isAccent);
			}

			// For 2-cell beats in sixteenth mode, alternate between real cells and
			// empty subdivisions — skip strumming on the empty subdivisions.
			const isEmptySubdivision =
				tickModeRef.current === "sixteenth" &&
				beat.length === 2 &&
				nextPlatEmptyCellRef.current;
			const beatType: StepValue = isEmptySubdivision ? "" : beat[currCellIdxRef.current];
			playStrum(nextCellTimeRef.current, beatType, secondsPerCell, barIndex);

			setCurrBeat(currBeatIdxref.current);
			setCurrCell(currCellIdxRef.current);
			setCurrBar(barIndex);

			if (tickModeRef.current === "sixteenth" && beat.length === 2) {
				if (!nextPlatEmptyCellRef.current) {
					nextPlatEmptyCellRef.current = true;
				} else {
					nextPlatEmptyCellRef.current = false;
					currCellIdxRef.current += 1;
				}
			} else {
				currCellIdxRef.current += 1;
			}

			if (currCellIdxRef.current >= beat.length) {
				currCellIdxRef.current = 0;
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
						Math.max(0, nextCellTimeRef.current - ctx.currentTime) +
						STRUM_RING_SECONDS +
						SOURCE_STOP_BUFFER_S;
					schedulerRef.current = window.setTimeout(() => {
						cancelStrums();
						schedulerRef.current = null;
					}, delaySec * 1000);
					currBeatIdxref.current = 0;
					currCellIdxRef.current = 0;
					nextPlatEmptyCellRef.current = false;
					setCurrBeat(0);
					setCurrCell(0);
					setCurrBar(0);
					setIsPlaying(false);
					return;
				}
			}

			nextCellTimeRef.current += secondsPerCell;
		}

		schedulerRef.current = window.setTimeout(scheduler, 25);
	}

	function stop() {
		if (schedulerRef.current) {
			window.clearTimeout(schedulerRef.current as number);
		}
		for (const source of activeSourcesRef.current) {
			try {
				source.stop();
			} catch {
				// node may have already ended naturally
			}
		}
		activeSourcesRef.current = [];
		cancelStrums();
		currBeatIdxref.current = 0;
		currCellIdxRef.current = 0;
		nextPlatEmptyCellRef.current = false;
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
		accentEnabled,
		setAccentEnabled,
		playOnce,
		setPlayOnce,
	};
}
