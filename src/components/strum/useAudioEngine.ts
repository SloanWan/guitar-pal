import { Beat, StepValue, TickMode } from "@/lib/strumPatterns";

import { useRef, useEffect, useState } from "react";

const STRUM_PARAMS: Partial<Record<StepValue, { freq: number; gain: number }>> = {
	D:  { freq: 800,  gain: 2.5 },
	D3: { freq: 800,  gain: 2.5 },
	U:  { freq: 1800, gain: 1.2 },
	U3: { freq: 1800, gain: 1.2 },
	X:  { freq: 400,  gain: 2.8 },
};

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

	useEffect(() => { bpmRef.current = bpm; }, [bpm]);
	useEffect(() => { tickModeRef.current = tickMode; }, [tickMode]);
	useEffect(() => { strumEnabledRef.current = strumEnabled; }, [strumEnabled]);
	useEffect(() => { strumGainRef.current = strumGain; }, [strumGain]);
	useEffect(() => { metronomeEnabledRef.current = metronomeEnabled; }, [metronomeEnabled]);
	useEffect(() => { metronomeGainRef.current = metronomeGain; }, [metronomeGain]);
	useEffect(() => { accentEnabledRef.current = accentEnabled; }, [accentEnabled]);

	function start() {
		if (!audioCtxRef.current) {
			audioCtxRef.current = new AudioContext();
		}
		nextCellTimeRef.current = audioCtxRef.current.currentTime;
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

	function playStrum(time: number, type: StepValue): void {
		if (!strumEnabledRef.current) return;
		const params = STRUM_PARAMS[type];
		if (!params) return; // "", "DG", "UG" → silent

		const ctx = audioCtxRef.current!;

		const bufferSize = Math.floor(ctx.sampleRate * 0.2);
		const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			data[i] = Math.random() * 2 - 1;
		}

		const source = ctx.createBufferSource();
		source.buffer = buffer;

		const filter = ctx.createBiquadFilter();
		filter.type = "bandpass";
		filter.frequency.value = params.freq;

		const gain = ctx.createGain();
		gain.gain.value = params.gain * strumGainRef.current;
		gain.gain.setTargetAtTime(0, time, 0.03);

		source.connect(filter).connect(gain).connect(ctx.destination);
		source.start(time);
		source.stop(time + 0.25);
	}

	function scheduler() {
		const ctx = audioCtxRef.current!;
		const secondsPerBeat = 60 / bpmRef.current;

		while (nextCellTimeRef.current < ctx.currentTime + 0.1) {
			const beat = beats[currBeatIdxref.current];
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
			playStrum(nextCellTimeRef.current, beatType);

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
		nextPlatEmptyCellRef.current = false;
		setCurrBeat(0);
		setCurrCell(0);
		setIsPlaying(false);
	}

	return {
		isPlaying,
		currBeat,
		currCell,
		start,
		stop,
		strumEnabled,
		setStrumEnabled,
		strumGain,
		setStrumGain,
		metronomeEnabled,
		setMetronomeEnabled,
		metronomeGain,
		setMetronomeGain,
		accentEnabled,
		setAccentEnabled,
	};
}
