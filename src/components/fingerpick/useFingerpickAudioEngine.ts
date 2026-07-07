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
 *  4. Call pause() to freeze playback with position saved; call resume() to continue.
 *  5. Call stop() to halt and reset position entirely.
 *  6. Unmount: cleanup runs automatically via useEffect return.
 *
 * Per-string voice stealing:
 *  Each of the 6 strings is an independent monophonic voice. A new note on
 *  string N fades the previous voice on N (5 ms τ) and starts the new note
 *  atomically via Web Audio API scheduling. Voices on other strings are unaffected.
 *
 * Pre-scheduled source tracking:
 *  All events for a pass are handed to the Web Audio scheduler synchronously at
 *  play/resume time. Only the LAST scheduled source per string lives in
 *  perStringVoicesRef; intermediate sources (voice-stolen by later notes) are
 *  tracked separately in allSourcesRef so that pause/stop can cancel ALL of them
 *  immediately, not just the last-per-string subset.
 *
 * Progress:
 *  getPlaybackProgress() is a synchronous getter — call it from requestAnimationFrame
 *  in the consumer to drive cursor highlighting without causing re-renders here.
 */
export function useFingerpickAudioEngine() {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isPaused, setIsPaused] = useState(false);

	// AudioContext and routing
	const ctxRef = useRef<AudioContext | null>(null);
	const masterGainRef = useRef<GainNode | null>(null);

	// Per-string voice map — keyed by string index 0-5
	const perStringVoicesRef = useRef<Map<number, ActiveVoice>>(new Map());

	// Every AudioBufferSourceNode created in the current playback pass.
	// Superset of perStringVoicesRef's sources; contains intermediate (voice-stolen)
	// sources that are pre-scheduled but no longer in the last-voice map.
	const allSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

	// Playback state (all refs — never read during React render)
	const isPlayingRef = useRef(false);
	const startTimeRef = useRef(0);
	const eventsRef = useRef<ScheduleEvent[]>([]);
	const patternDurationRef = useRef(0);
	const loopRef = useRef(false);
	const loopGapRef = useRef(0);
	const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Pause-position tracking
	const pausedAtRef = useRef<number | null>(null); // elapsed seconds within pass
	const pausedPassIndexRef = useRef<number>(0);

	// ─── AudioContext lifecycle ──────────────────────────────────────────────

	function ensureContext(): AudioContext {
		if (!ctxRef.current || ctxRef.current.state === "closed") {
			const ctx = new AudioContext();
			const master = ctx.createGain();
			master.gain.value = NORMAL_GAIN;
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

		// Track in BOTH maps: voices (last-per-string, for voice stealing) and
		// allSources (every source, so stop/pause can cancel all of them).
		allSourcesRef.current.add(source);
		const voice: ActiveVoice = { gainNode, source };
		perStringVoicesRef.current.set(event.stringIndex, voice);

		source.onended = () => {
			allSourcesRef.current.delete(source);
			if (perStringVoicesRef.current.get(event.stringIndex) === voice) {
				perStringVoicesRef.current.delete(event.stringIndex);
			}
		};
	}

	/**
	 * Schedule events for a pass starting at `offset` (absolute AudioContext time
	 * for this pass's t=0), skipping events with time < `startOffset` (for resume).
	 */
	function schedulePass(offset: number, startOffset: number = 0): void {
		const ctx = ctxRef.current;
		const target = masterGainRef.current;
		if (!ctx || !target) return;

		for (const event of eventsRef.current) {
			if (event.time < startOffset) continue;
			const when = offset + event.time;
			if (when < ctx.currentTime) continue;
			scheduleNote(ctx, target, event, when);
		}
	}

	/**
	 * Schedule pass `passIndex` from `passStartOffset` seconds into the pass, then
	 * queue subsequent passes if looping. Resume passes passStartOffset=0 (full pass).
	 */
	function schedulePassAndQueue(passIndex: number, passStartOffset: number = 0): void {
		const ctx = ctxRef.current;
		if (!ctx || !isPlayingRef.current) return;

		const patternDuration = patternDurationRef.current;
		const loopGap = loopGapRef.current;
		const offset = startTimeRef.current + computeLoopOffset(passIndex, patternDuration, loopGap);

		schedulePass(offset, passStartOffset);

		if (loopRef.current) {
			const passEndAbsolute = offset + patternDuration;
			const msUntilNext = Math.max(
				0,
				(passEndAbsolute - SCHEDULE_LOOKAHEAD_S - ctx.currentTime) * 1000,
			);
			scheduleTimerRef.current = setTimeout(() => {
				if (!isPlayingRef.current) return;
				schedulePassAndQueue(passIndex + 1); // subsequent passes always full
			}, msUntilNext);
		}
	}

	// ─── Stop all pre-scheduled audio ────────────────────────────────────────

	/**
	 * Cancel ALL pre-scheduled AudioBufferSourceNodes (not just the last per string)
	 * and clear both tracking collections. This is what actually silences the audio
	 * immediately regardless of how many events were handed to the Web Audio scheduler.
	 */
	function cancelAllSources(): void {
		_shutdownEngine(perStringVoicesRef.current, [], allSourcesRef.current);
	}

	function clearTimers(): void {
		if (scheduleTimerRef.current !== null) {
			clearTimeout(scheduleTimerRef.current);
			scheduleTimerRef.current = null;
		}
		if (endTimerRef.current !== null) {
			clearTimeout(endTimerRef.current);
			endTimerRef.current = null;
		}
	}

	// ─── Public API ──────────────────────────────────────────────────────────

	function play(pattern: FingerpickPattern, options: PlayOptions = {}): void {
		if (!isLoaded) return;
		if (isPlayingRef.current || isPaused) {
			// Clear any existing playback/pause before starting fresh.
			clearTimers();
			cancelAllSources();
		}

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
		pausedAtRef.current = null;
		pausedPassIndexRef.current = 0;
		isPlayingRef.current = true;
		setIsPlaying(true);
		setIsPaused(false);

		schedulePassAndQueue(0);

		if (!loopRef.current) {
			const doneAfterMs = (patternDurationRef.current + SOURCE_STOP_BUFFER_S) * 1000;
			endTimerRef.current = setTimeout(() => {
				isPlayingRef.current = false;
				setIsPlaying(false);
			}, doneAfterMs);
		}
	}

	/**
	 * Freeze playback at the current position. Cancels all pre-scheduled audio
	 * immediately (including intermediate voice-stolen sources), saves elapsed
	 * position so resume() can restart from this exact point.
	 */
	function pause(): void {
		if (!isPlayingRef.current) return;

		// Capture position before stopping (uses ctx.currentTime which is accurate).
		const progress = getPlaybackProgress();
		if (progress) {
			pausedAtRef.current = progress.elapsed;
			pausedPassIndexRef.current = progress.passIndex;
		}

		clearTimers();
		cancelAllSources();

		isPlayingRef.current = false;
		setIsPlaying(false);
		setIsPaused(true);
	}

	/**
	 * Resume from the position saved by the last pause() call.
	 * Adjusts startTimeRef so getPlaybackProgress() and computeLoopOffset stay
	 * consistent with the full playback timeline.
	 */
	function resume(): void {
		if (!isLoaded || pausedAtRef.current === null) return;
		if (isPlayingRef.current) return;

		const ctx = ensureContext();
		if (ctx.state === "suspended") {
			void ctx.resume();
		}

		const pausedAt = pausedAtRef.current;
		const pausedPassIndex = pausedPassIndexRef.current;
		const patternDuration = patternDurationRef.current;
		const loopGap = loopGapRef.current;

		// Align startTimeRef so computeLoopOffset(passIndex) produces the correct
		// absolute AudioContext time for this pass's t=0.
		// totalElapsedAtPause = passes_completed × (duration + gap) + position_in_pass
		const totalElapsedAtPause =
			computeLoopOffset(pausedPassIndex, patternDuration, loopGap) + pausedAt;
		startTimeRef.current = ctx.currentTime - totalElapsedAtPause;

		pausedAtRef.current = null;
		pausedPassIndexRef.current = 0;
		isPlayingRef.current = true;
		setIsPlaying(true);
		setIsPaused(false);

		// Schedule the remaining events of the paused pass (startOffset skips already-played),
		// then hand off to the normal loop machinery for any subsequent passes.
		schedulePassAndQueue(pausedPassIndex, pausedAt);

		if (!loopRef.current) {
			const remainingMs = (patternDuration - pausedAt + SOURCE_STOP_BUFFER_S) * 1000;
			endTimerRef.current = setTimeout(() => {
				isPlayingRef.current = false;
				setIsPlaying(false);
			}, remainingMs);
		}
	}

	/** Halt playback and discard the saved pause position (next play starts fresh). */
	function stop(): void {
		clearTimers();
		cancelAllSources();
		pausedAtRef.current = null;
		pausedPassIndexRef.current = 0;
		isPlayingRef.current = false;
		setIsPlaying(false);
		setIsPaused(false);
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
		const voices = perStringVoicesRef.current;
		const allSources = allSourcesRef.current;
		return () => {
			isPlayingRef.current = false;
			_shutdownEngine(voices, [scheduleTimerRef.current, endTimerRef.current], allSources);
			ctxRef.current?.close();
		};
	}, []);

	return { isLoaded, isPlaying, isPaused, load, play, pause, resume, stop, getPlaybackProgress };
}
