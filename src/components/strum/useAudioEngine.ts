"use client";

import { Beat, StepValue, TickMode } from "@/lib/strumPatterns";

import { useRef, useEffect, useState } from "react";
import {
	preloadStrumPresets,
	triggerStrum,
	cancelStrums,
	SOURCE_STOP_BUFFER_S,
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

export function useAudioEngine(beats: Beat[], bpm: number, tickMode: TickMode) {
	const audioCtxRef = useRef<AudioContext | null>(null);
	const schedulerRef = useRef<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currBeat, setCurrBeat] = useState(0);
	const [currCell, setCurrCell] = useState(0);

	const [strumEnabled, setStrumEnabled] = useState(true);
	const [strumGain, setStrumGain] = useState(1.0);
	const [metronomeEnabled, setMetronomeEnabled] = useState(true);
	const [metronomeGain, setMetronomeGain] = useState(0.15);
	const [accentEnabled, setAccentEnabled] = useState(true);
	const [playOnce, setPlayOnce] = useState(false);

	const isPlayingRef = useRef(false);
	const beatsRef = useRef(beats);

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

	// Active source nodes tracked for cleanup on stop() and unmount.
	const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

	useEffect(() => {
		isPlayingRef.current = isPlaying;
	}, [isPlaying]);
	useEffect(() => {
		beatsRef.current = beats;
	}, [beats]);
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

	function playStrum(time: number, type: StepValue, secondsPerCell: number): void {
		if (!strumEnabledRef.current) return;

		const soundType = STEP_TO_SOUND[type];
		if (!soundType) return;

		const ctx = audioCtxRef.current!;
		const gainNode = ctx.createGain();
		gainNode.gain.value = strumGainRef.current;
		gainNode.connect(ctx.destination);
		triggerStrum(soundType, ctx, gainNode, time, secondsPerCell);
	}

	function scheduler() {
		const ctx = audioCtxRef.current!;
		const secondsPerBeat = 60 / bpmRef.current;

		while (nextCellTimeRef.current < ctx.currentTime + 0.1) {
			const beat = beatsRef.current[currBeatIdxref.current];
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
				const isAccent =
					accentEnabledRef.current &&
					currBeatIdxref.current === 0 &&
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
			playStrum(nextCellTimeRef.current, beatType, secondsPerCell);

			setCurrBeat(currBeatIdxref.current);
			setCurrCell(currCellIdxRef.current);

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
				currBeatIdxref.current = (currBeatIdxref.current + 1) % beatsRef.current.length;
				if (playOnceRef.current && currBeatIdxref.current === 0) {
					// Do not call stop() here: it would invoke cancelStrums() synchronously,
					// killing the just-scheduled last-note sources before they play.
					// Instead, defer cancelStrums() until the last note has finished decaying.
					// Re-using schedulerRef means a manual stop() click still cancels this via
					// its existing window.clearTimeout(schedulerRef.current) call.
					const delaySec =
						Math.max(0, nextCellTimeRef.current - ctx.currentTime) +
						secondsPerCell +
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
