import { Beat } from "@/lib/strumPatterns";

import { useRef, useEffect, useState } from "react";
import { TickMode, StepValue } from "@/lib/strumPatterns";

export function useAudioEngine(beats: Beat[], bpm: number, tickMode: TickMode) {
	const audioCtxRef = useRef<AudioContext | null>(null);
	const schedulerRef = useRef<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currBeat, setCurrBeat] = useState(0);
	const [currCell, setCurrCell] = useState(0);

	const currBeatIdxref = useRef(0);
	const currCellIdxRef = useRef(0);
	const nextCellTimeRef = useRef(0);
	const bpmRef = useRef(bpm);
	const tickModeRef = useRef(tickMode);

	useEffect(() => {
		bpmRef.current = bpm;
	}, [bpm]);
	useEffect(() => {
		tickModeRef.current = tickMode;
	}, [tickMode]);

	function start() {
		if (!audioCtxRef.current) {
			audioCtxRef.current = new AudioContext();
		}
		nextCellTimeRef.current = audioCtxRef.current.currentTime;
		setIsPlaying(true);
		scheduler();
	}

	function playTick(time: number, stepValue: StepValue) {
		const ctx = audioCtxRef.current!;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.connect(gain).connect(ctx.destination);

		osc.frequency.value = 800;
		gain.gain.value = 0.3;

		osc.start(time);
		osc.stop(time + 0.05);
	}

	function scheduler() {
		const ctx = audioCtxRef.current!;
		const secondsPerBeat = 60 / bpmRef.current;

		while (nextCellTimeRef.current < ctx.currentTime + 0.1) {
			const beat = beats[currBeatIdxref.current];
			const cellValue = beat[currCellIdxRef.current];
			// const paddedLength = beat.length === 3 ? 3 : 4;
			const secondsPerCell = secondsPerBeat / beat.length;

			const shouldNotTick =
				(tickModeRef.current === "quarter" && currCellIdxRef.current != 0) ||
				(tickModeRef.current === "eighth" &&
					beat.length === 4 &&
					(currCellIdxRef.current === 1 || currCellIdxRef.current === 3));

			if (!shouldNotTick) {
				playTick(nextCellTimeRef.current, cellValue);
			}
			setCurrBeat(currBeatIdxref.current);
			setCurrCell(currCellIdxRef.current);

			currCellIdxRef.current += 1;
			if (currCellIdxRef.current >= beat.length) {
				currCellIdxRef.current = 0;
				currBeatIdxref.current = (currBeatIdxref.current + 1) % beats.length;
			}

			nextCellTimeRef.current += secondsPerCell;
		}

		schedulerRef.current = window.setTimeout(scheduler, 25);
	}

	function stop() {
		if (schedulerRef.current) {
			window.clearTimeout(schedulerRef.current as number);
		}
		currBeatIdxref.current = 0;
		currCellIdxRef.current = 0;
		setCurrBeat(0);
		setCurrCell(0);
		setIsPlaying(false);
	}

	return { isPlaying, currBeat, currCell, start, stop };
}
