"use client";

import { useState, useRef, useEffect } from "react";

import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	fingerpickPatternToScheduleEvents,
	getTotalPatternDuration,
	computeLoopOffset,
	getProgressAtTime,
	stealVoice,
	_shutdownEngine,
	VOICE_STEAL_FADE_TAU,
	VOICE_STEAL_STOP_BUFFER,
	type ScheduleEvent,
	type VoiceHandle,
} from "@/lib/fingerpickScheduler";
import {
	preloadFingerpickPresets,
	getFingerpickNoteData,
	type FingerpickSoundType,
} from "@/components/strum/useGuitarSampleLoader";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Schedule next loop pass this many seconds before the current pass ends. */
const SCHEDULE_LOOKAHEAD_S = 0.3;

/** Base gain for a normal pluck (no technique). */
const NORMAL_GAIN = 0.8;

/** Reduced gain for technique notes (hammer-on, pull-off, slide) — MVP legato sim. */
const TECHNIQUE_GAIN = 0.5;

/** Fraction of slot duration used as gain-decay time constant. */
const DECAY_TC_RATIO = 0.8;

/** Minimum gain-decay time constant (s) — prevents click artefacts at fast tempos. */
const MIN_DECAY_TC_S = 0.03;

/** Source stop margin past note end — lets the envelope tail off cleanly. */
const SOURCE_STOP_BUFFER_S = 0.05;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PlayOptions {
	loop?: boolean;
	/** Gap between loop passes, in seconds (0 = seamless). */
	loopGapSeconds?: number;
}

export interface FingerpickPlaybackProgress {
	measureIndex: number;
	slotIndex: number;
	/** Which loop repetition (0-based). */
	passIndex: number;
	/** Elapsed seconds within the current pass. */
	elapsed: number;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface ActiveVoice extends VoiceHandle {
	gainNode: GainNode;
	source: AudioBufferSourceNode;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Self-contained audio engine for fingerpick pattern playback.
 *
 * Lifecycle:
 *  1. Mount the consumer component.
 *  2. Call load() once to preload presets (await it or check isLoaded).
 *  3. Call play(pattern, options) on user action — creates AudioContext lazily.
 *  4. Call stop() to halt playback at any time.
 *  5. Unmount: cleanup runs automatically via useEffect return.
 *
 * Per-string voice stealing:
 *  Each of the 6 strings is an independent monophonic voice. A new note on
 *  string N fades the previous voice on N (5 ms τ) and starts the new note
 *  atomically via Web Audio API scheduling. Voices on other strings are unaffected.
 *
 * Progress:
 *  getPlaybackProgress() is a synchronous getter — call it from requestAnimationFrame
 *  in the consumer to drive cursor highlighting without causing re-renders here.
 */
export function useFingerpickAudioEngine() {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);

	// AudioContext and routing
	const ctxRef = useRef<AudioContext | null>(null);
	const masterGainRef = useRef<GainNode | null>(null);

	// Per-string voice map — keyed by string index 0-5
	const perStringVoicesRef = useRef<Map<number, ActiveVoice>>(new Map());

	// Playback state (all refs — never read during React render)
	const isPlayingRef = useRef(false);
	const startTimeRef = useRef(0);
	const eventsRef = useRef<ScheduleEvent[]>([]);
	const patternDurationRef = useRef(0);
	const loopRef = useRef(false);
	const loopGapRef = useRef(0);
	const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ─── AudioContext lifecycle ──────────────────────────────────────────────

	function ensureContext(): AudioContext {
		if (!ctxRef.current || ctxRef.current.state === "closed") {
			const ctx = new AudioContext();
			const master = ctx.createGain();
			master.gain.value = 0.8;
			master.connect(ctx.destination);
			ctxRef.current = ctx;
			masterGainRef.current = master;
		}
		return ctxRef.current;
	}

	// ─── Preset loading ──────────────────────────────────────────────────────

	async function load(): Promise<void> {
		const ctx = ensureContext();
		await preloadFingerpickPresets(ctx);
		setIsLoaded(true);
	}

	// ─── Note scheduling ─────────────────────────────────────────────────────

	function scheduleNote(
		ctx: AudioContext,
		target: AudioNode,
		event: ScheduleEvent,
		when: number,
	): void {
		const soundType: FingerpickSoundType = event.muted ? "muted" : "pluck";
		let noteData: { buffer: AudioBuffer; playbackRate: number };
		try {
			noteData = getFingerpickNoteData(soundType, event.midi);
		} catch {
			return;
		}

		// Steal (fade + stop) any ringing voice on this string.
		stealVoice(perStringVoicesRef.current, event.stringIndex, when);

		const source = ctx.createBufferSource();
		source.buffer = noteData.buffer;
		source.playbackRate.value = noteData.playbackRate;

		const gainNode = ctx.createGain();
		const volume = event.technique !== null ? TECHNIQUE_GAIN : NORMAL_GAIN;
		gainNode.gain.setValueAtTime(volume, when);

		const decayTc = Math.max(event.duration * DECAY_TC_RATIO, MIN_DECAY_TC_S);
		gainNode.gain.setTargetAtTime(0, when, decayTc);

		source.connect(gainNode).connect(target);
		source.start(when);
		source.stop(when + event.duration + SOURCE_STOP_BUFFER_S);

		const voice: ActiveVoice = { gainNode, source };
		perStringVoicesRef.current.set(event.stringIndex, voice);

		source.onended = () => {
			if (perStringVoicesRef.current.get(event.stringIndex) === voice) {
				perStringVoicesRef.current.delete(event.stringIndex);
			}
		};
	}

	function schedulePass(passIndex: number, offset: number): void {
		const ctx = ctxRef.current;
		const target = masterGainRef.current;
		if (!ctx || !target) return;

		for (const event of eventsRef.current) {
			const when = offset + event.time;
			if (when < ctx.currentTime) continue;
			scheduleNote(ctx, target, event, when);
		}
	}

	// Schedule pass `passIndex` and, if looping, queue the next pass.
	function schedulePassAndQueue(passIndex: number): void {
		const ctx = ctxRef.current;
		if (!ctx || !isPlayingRef.current) return;

		const patternDuration = patternDurationRef.current;
		const loopGap = loopGapRef.current;
		const offset =
			startTimeRef.current + computeLoopOffset(passIndex, patternDuration, loopGap);

		schedulePass(passIndex, offset);

		if (loopRef.current) {
			const passEndAbsolute = offset + patternDuration;
			const msUntilNext = Math.max(
				0,
				(passEndAbsolute - SCHEDULE_LOOKAHEAD_S - ctx.currentTime) * 1000,
			);
			scheduleTimerRef.current = setTimeout(() => {
				if (!isPlayingRef.current) return;
				schedulePassAndQueue(passIndex + 1);
			}, msUntilNext);
		}
	}

	// ─── Public API ──────────────────────────────────────────────────────────

	function play(pattern: FingerpickPattern, options: PlayOptions = {}): void {
		if (!isLoaded) return;
		if (isPlayingRef.current) stop();

		const ctx = ensureContext();
		if (ctx.state === "suspended") {
			void ctx.resume();
		}

		const bpm = pattern.bpm;
		eventsRef.current = fingerpickPatternToScheduleEvents(pattern, bpm);
		patternDurationRef.current = getTotalPatternDuration(pattern, bpm);
		loopRef.current = options.loop ?? false;
		loopGapRef.current = options.loopGapSeconds ?? 0;
		startTimeRef.current = ctx.currentTime;
		isPlayingRef.current = true;
		setIsPlaying(true);

		schedulePassAndQueue(0);

		if (!loopRef.current) {
			// Mark playback done slightly after the last note's stop margin.
			const doneAfterMs = (patternDurationRef.current + SOURCE_STOP_BUFFER_S) * 1000;
			endTimerRef.current = setTimeout(() => {
				isPlayingRef.current = false;
				setIsPlaying(false);
			}, doneAfterMs);
		}
	}

	function stop(): void {
		isPlayingRef.current = false;

		if (scheduleTimerRef.current !== null) {
			clearTimeout(scheduleTimerRef.current);
			scheduleTimerRef.current = null;
		}
		if (endTimerRef.current !== null) {
			clearTimeout(endTimerRef.current);
			endTimerRef.current = null;
		}

		// Fade out ringing voices (gentle stop avoids hard clicks).
		const ctx = ctxRef.current;
		const now = ctx?.currentTime ?? 0;
		for (const voice of perStringVoicesRef.current.values()) {
			try {
				voice.gainNode.gain.setTargetAtTime(0, now, VOICE_STEAL_FADE_TAU);
				voice.source.stop(now + VOICE_STEAL_STOP_BUFFER);
			} catch {
				/* already ended */
			}
		}
		perStringVoicesRef.current.clear();

		setIsPlaying(false);
	}

	/**
	 * Query current playback position without causing a re-render.
	 * Call from requestAnimationFrame to drive cursor highlighting.
	 * Returns null when not playing.
	 */
	function getPlaybackProgress(): FingerpickPlaybackProgress | null {
		if (!isPlayingRef.current || !ctxRef.current) return null;

		const patternDuration = patternDurationRef.current;
		const loopGap = loopGapRef.current;
		const totalElapsed = ctxRef.current.currentTime - startTimeRef.current;
		const passDuration = patternDuration + loopGap;
		const passIndex = passDuration > 0 ? Math.floor(totalElapsed / passDuration) : 0;
		const elapsed = totalElapsed - passIndex * passDuration;

		const position = getProgressAtTime(eventsRef.current, elapsed);
		if (!position) return null;

		return { ...position, passIndex, elapsed };
	}

	// ─── Cleanup ─────────────────────────────────────────────────────────────

	useEffect(() => {
		// Capture the stable Map reference (identity never changes; contents mutate).
		const voices = perStringVoicesRef.current;
		return () => {
			isPlayingRef.current = false;
			_shutdownEngine(voices, [scheduleTimerRef.current, endTimerRef.current]);
			ctxRef.current?.close();
		};
	}, []);

	return { isLoaded, isPlaying, load, play, stop, getPlaybackProgress };
}
