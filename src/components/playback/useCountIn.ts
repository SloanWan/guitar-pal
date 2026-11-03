"use client";

import { useEffect, useRef, useState } from "react";
import { useStoredState, type StoredCodec } from "@/components/useStoredState";
import {
	COUNT_IN_KEY,
	DEFAULT_COUNT_IN,
	countInCues,
	countInSeconds,
	formatCountIn,
	readCountIn,
	type CountInSetting,
} from "@/lib/countIn";

const SETTING_CODEC: StoredCodec<CountInSetting> = { parse: readCountIn, format: formatCountIn };

/** The cue's two voices: a soft tick, and the brighter last three. */
const CUE = { freq: 880, accentFreq: 1320, peak: 0.12, accentPeak: 0.26, length: 0.07, accentLength: 0.14 } as const;

/** One cue on `ctx` at `when`, gone by itself once it has sounded. */
function playCue(ctx: AudioContext, when: number, accent: boolean): OscillatorNode {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.frequency.value = accent ? CUE.accentFreq : CUE.freq;
	const length = accent ? CUE.accentLength : CUE.length;
	gain.gain.setValueAtTime(0.0001, when);
	gain.gain.exponentialRampToValueAtTime(accent ? CUE.accentPeak : CUE.peak, when + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
	osc.connect(gain).connect(ctx.destination);
	osc.start(when);
	osc.stop(when + length + 0.02);
	osc.onended = () => gain.disconnect();
	return osc;
}

export interface CountIn {
	setting: CountInSetting;
	onSetting: (next: CountInSetting) => void;
	/** Seconds left of a wait under way; null when nothing is counting in. */
	remaining: number | null;
	/**
	 * A start from the play key: at once with the count-in off, else after the wait,
	 * with `prime` run first so the engine's audio is woken inside the press — a
	 * browser lets audio begin only from a gesture, and the wait is longer than one
	 * stays honoured.
	 */
	begin: (prime: () => void) => void;
	/** Stops a wait under way; the start never comes. */
	cancel: () => void;
}

/**
 * The wait before the first pass, shared by the players: the setting (per viewer,
 * one for every page), the seconds left, and a cue each second on a context of its
 * own, made on the first press. `go` is the page's own start, read when the wait
 * ends — so a tempo changed during the wait is the tempo that plays.
 */
export function useCountIn(go: () => void): CountIn {
	const [setting, setSetting] = useStoredState(COUNT_IN_KEY, DEFAULT_COUNT_IN, SETTING_CODEC);
	const [remaining, setRemaining] = useState<number | null>(null);
	const goRef = useRef(go);
	useEffect(() => {
		goRef.current = go;
	});
	const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
	const cuesRef = useRef<OscillatorNode[]>([]);
	const ctxRef = useRef<AudioContext | null>(null);

	function clear() {
		for (const t of timersRef.current) clearTimeout(t);
		timersRef.current = [];
		for (const osc of cuesRef.current) {
			try {
				osc.stop();
			} catch {
				// already ended
			}
		}
		cuesRef.current = [];
	}

	// Nothing outlives the page: no timer, no cue, no context.
	useEffect(
		() => () => {
			clear();
			void ctxRef.current?.close().catch(() => {});
			ctxRef.current = null;
		},
		[],
	);

	function begin(prime: () => void) {
		clear();
		const seconds = countInSeconds(setting);
		if (seconds === 0) {
			setRemaining(null);
			goRef.current();
			return;
		}
		prime();
		if (setting.cue) {
			if (!ctxRef.current || ctxRef.current.state === "closed") ctxRef.current = new AudioContext();
			const ctx = ctxRef.current;
			if (ctx.state === "suspended") void ctx.resume();
			const t0 = ctx.currentTime + 0.02;
			cuesRef.current = countInCues(seconds).map((cue) => playCue(ctx, t0 + cue.at, cue.accent));
		}
		setRemaining(seconds);
		for (let i = 1; i < seconds; i++) {
			timersRef.current.push(setTimeout(() => setRemaining(seconds - i), i * 1000));
		}
		timersRef.current.push(
			setTimeout(() => {
				timersRef.current = [];
				cuesRef.current = [];
				setRemaining(null);
				goRef.current();
			}, seconds * 1000),
		);
	}

	function cancel() {
		clear();
		setRemaining(null);
	}

	return { setting, onSetting: setSetting, remaining, begin, cancel };
}
