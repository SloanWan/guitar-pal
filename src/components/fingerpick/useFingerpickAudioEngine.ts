"use client";

import { useState, useRef, useEffect } from "react";

import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	fingerpickPatternToScheduleEvents,
	getTotalPatternDuration,
	computeLoopOffset,
	getProgressAtTime,
	findSlotStartTime,
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

/** Reduced gain for legato technique notes (hammer-on, pull-off, trill). */
const TECHNIQUE_GAIN = 0.5;
/** Gain for tapping notes — slightly softer than a normal pick attack. */
const TAPPING_GAIN = 0.8;
/** Gain for ghost notes (parenthesised/bracketed notes). */
const GHOST_GAIN = 0.3;
/** Accent boost multiplier applied on top of the technique-derived base gain. */
const ACCENT_MULTIPLIER = 1.3;

/** Fraction of slot duration used as gain-decay time constant. */
const DECAY_TC_RATIO = 0.8;

/** Minimum gain-decay time constant (s) — prevents click artefacts at fast tempos. */
const MIN_DECAY_TC_S = 0.03;

/** Source stop margin past note end — lets the envelope tail off cleanly. */
const SOURCE_STOP_BUFFER_S = 0.05;


const METRONOME_TICK_DURATION_S = 0.05;
const METRONOME_ACCENT_FREQ = 1200;
const METRONOME_NORMAL_FREQ = 800;
const METRONOME_ACCENT_GAIN_MULT = 1.5;

// ─── Public types ─────────────────────────────────────────────────────────────

export type MetronomeSubdivision = "quarter" | "eighth" | "sixteenth";

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

// ─── Beat onset helper ────────────────────────────────────────────────────────

/** Quarter-note beat onset times (seconds from pass start) for the given pattern and BPM. */
function computeBeatOnsets(pattern: FingerpickPattern, bpm: number): number[] {
	const secondsPerBeat = 60 / bpm;
	const totalDuration = getTotalPatternDuration(pattern, bpm);
	const onsets: number[] = [];
	for (let t = 0; t < totalDuration - 0.001; t += secondsPerBeat) {
		onsets.push(t);
	}
	return onsets;
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
 * Metronome:
 *  Oscillator-based clicks scheduled at quarter-note beat boundaries, routed
 *  through a dedicated gain node (metronomeGainNodeRef) so volume changes take
 *  effect immediately without re-scheduling.
 *
 * Progress:
 *  getPlaybackProgress() is a synchronous getter — call it from requestAnimationFrame
 *  in the consumer to drive cursor highlighting without causing re-renders here.
 */
export function useFingerpickAudioEngine() {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [playOnce, setPlayOnce] = useState(true);
	const playOnceRef = useRef(true);
	const [metronomeEnabled, setMetronomeEnabled] = useState(false);
	const [metronomeSubdivision, setMetronomeSubdivision] =
		useState<MetronomeSubdivision>("quarter");
	const [metronomeGain, setMetronomeGain] = useState(0.15);
	const [accentEnabled, setAccentEnabled] = useState(true);
	const [noteGain, setNoteGain] = useState(1.0);

	// AudioContext and routing
	const ctxRef = useRef<AudioContext | null>(null);
	const masterGainRef = useRef<GainNode | null>(null);
	/** Shared output node for all metronome oscillators — allows live volume control. */
	const metronomeGainNodeRef = useRef<GainNode | null>(null);

	// Per-string voice map — keyed by string index 0-5
	const perStringVoicesRef = useRef<Map<number, ActiveVoice>>(new Map());

	// Every AudioBufferSourceNode created in the current playback pass.
	// Superset of perStringVoicesRef's sources; contains intermediate (voice-stolen)
	// sources that are pre-scheduled but no longer in the last-voice map.
	const allSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

	/** All scheduled metronome OscillatorNodes — cancelled on pause/stop. */
	const allMetronomeSourcesRef = useRef<Set<OscillatorNode>>(new Set());

	/** Pattern stored at play() time — needed to recompute events on BPM change. */
	const patternRef = useRef<FingerpickPattern | null>(null);

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

	// Metronome / sound state refs (read in scheduler callbacks, never in React render)
	const metronomeEnabledRef = useRef(false);
	const metronomeSubdivisionRef = useRef<MetronomeSubdivision>("quarter");
	const metronomeGainRef = useRef(0.15);
	const accentEnabledRef = useRef(true);
	const noteGainRef = useRef(1.0);
	const beatOnsetsRef = useRef<number[]>([]);
	const secondsPerBeatRef = useRef(0);
	const timeSignatureRef = useRef<[number, number]>([4, 4]);

	// Sync state → refs so scheduler closures always read the latest value.
	useEffect(() => {
		playOnceRef.current = playOnce;
	}, [playOnce]);
	useEffect(() => {
		metronomeEnabledRef.current = metronomeEnabled;
	}, [metronomeEnabled]);
	useEffect(() => {
		metronomeSubdivisionRef.current = metronomeSubdivision;
	}, [metronomeSubdivision]);
	useEffect(() => {
		metronomeGainRef.current = metronomeGain;
	}, [metronomeGain]);
	useEffect(() => {
		accentEnabledRef.current = accentEnabled;
	}, [accentEnabled]);
	useEffect(() => {
		noteGainRef.current = noteGain;
	}, [noteGain]);

	// ─── AudioContext lifecycle ──────────────────────────────────────────────

	function ensureContext(): AudioContext {
		if (!ctxRef.current || ctxRef.current.state === "closed") {
			const ctx = new AudioContext();

			const master = ctx.createGain();
			master.gain.value = NORMAL_GAIN * noteGainRef.current;
			master.connect(ctx.destination);
			masterGainRef.current = master;

			const metronomeNode = ctx.createGain();
			metronomeNode.gain.value = metronomeGainRef.current;
			metronomeNode.connect(ctx.destination);
			metronomeGainNodeRef.current = metronomeNode;

			ctxRef.current = ctx;
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

		// Gain: ghost overrides everything; otherwise technique sets base, accent boosts on top.
		let volume: number;
		if (event.ghostNote) {
			volume = GHOST_GAIN;
		} else if (
			event.technique === "hammer-on" ||
			event.technique === "pull-off" ||
			event.technique === "trill"
		) {
			volume = TECHNIQUE_GAIN;
		} else if (event.technique === "tapping") {
			volume = TAPPING_GAIN;
		} else {
			volume = NORMAL_GAIN;
		}
		if (event.accent) volume *= ACCENT_MULTIPLIER;

		// Staccato shortens the sounding duration to 20% of the slot duration.
		const noteDuration = event.staccato ? event.duration * 0.2 : event.duration;

		const source = ctx.createBufferSource();
		source.buffer = noteData.buffer;

		const effectiveDuration = noteDuration;
		source.playbackRate.value = noteData.playbackRate;

		const gainNode = ctx.createGain();
		gainNode.gain.setValueAtTime(volume, when);
		const decayTc = Math.max(effectiveDuration * DECAY_TC_RATIO, MIN_DECAY_TC_S);
		gainNode.gain.setTargetAtTime(0, when, decayTc);

		const isLegato =
			event.technique === "hammer-on" ||
			event.technique === "pull-off" ||
			event.technique === "trill";

		if (isLegato) {
			const filter = ctx.createBiquadFilter();
			filter.type = "lowpass";
			filter.frequency.value = 2000;
			filter.Q.value = 0.7;
			source.connect(filter).connect(gainNode).connect(target);
		} else {
			source.connect(gainNode).connect(target);
		}
		source.start(when);
		source.stop(when + effectiveDuration + SOURCE_STOP_BUFFER_S);

		allSourcesRef.current.add(source);
		// Grace notes (very short duration) are not registered in perStringVoicesRef so the
		// following note on the same string does not steal and immediately silence them.
		if (event.duration >= 0.1) {
			const voice: ActiveVoice = { gainNode, source };
			perStringVoicesRef.current.set(event.stringIndex, voice);
			source.onended = () => {
				allSourcesRef.current.delete(source);
				if (perStringVoicesRef.current.get(event.stringIndex) === voice) {
					perStringVoicesRef.current.delete(event.stringIndex);
				}
			};
		} else {
			source.onended = () => {
				allSourcesRef.current.delete(source);
			};
		}
	}

	// ─── Metronome scheduling ────────────────────────────────────────────────

	function scheduleTick(ctx: AudioContext, when: number, isAccent: boolean): void {
		const metronomeNode = metronomeGainNodeRef.current;
		if (!metronomeNode) return;

		const osc = ctx.createOscillator();
		// Route through a per-tick gain so accent multiplier is preserved independently
		// of the shared metronomeGainNode (which handles live volume control).
		const accentGain = ctx.createGain();
		accentGain.gain.value = isAccent ? METRONOME_ACCENT_GAIN_MULT : 1.0;

		osc.frequency.value = isAccent ? METRONOME_ACCENT_FREQ : METRONOME_NORMAL_FREQ;
		osc.connect(accentGain).connect(metronomeNode);
		osc.start(when);
		osc.stop(when + METRONOME_TICK_DURATION_S);

		allMetronomeSourcesRef.current.add(osc);
		osc.onended = () => {
			allMetronomeSourcesRef.current.delete(osc);
		};
	}

	/**
	 * Schedule metronome ticks for one pass, skipping ticks before startOffset.
	 * Beat accent follows time-signature grouping: beat index 0, N, 2N, … are accented.
	 * Subdivision density is controlled by metronomeSubdivisionRef:
	 *   "quarter"   — one click per beat
	 *   "eighth"    — beat + halfway point (2 clicks per beat, sub-beat non-accented)
	 *   "sixteenth" — beat + ¼, ½, ¾ of beat (4 clicks per beat, only beat accented)
	 */
	function scheduleMetronomePass(passOffset: number, startOffset: number = 0): void {
		const ctx = ctxRef.current;
		if (!ctx || !metronomeEnabledRef.current) return;

		const beatsPerMeasure = timeSignatureRef.current[0];
		const onsets = beatOnsetsRef.current;
		const subdivision = metronomeSubdivisionRef.current;
		const spb = secondsPerBeatRef.current;
		const totalDuration = patternDurationRef.current;

		for (let i = 0; i < onsets.length; i++) {
			const beatTime = onsets[i];
			const isAccentBeat = accentEnabledRef.current && i % beatsPerMeasure === 0;

			// Beat (quarter-note) tick — always scheduled
			if (beatTime >= startOffset) {
				const when = passOffset + beatTime;
				if (when >= ctx.currentTime) scheduleTick(ctx, when, isAccentBeat);
			}

			// Eighth-note sub-beat (halfway between this beat and the next)
			if (subdivision === "eighth" || subdivision === "sixteenth") {
				const t8 = beatTime + spb / 2;
				if (t8 >= startOffset && t8 < totalDuration - 0.001) {
					const when = passOffset + t8;
					if (when >= ctx.currentTime) scheduleTick(ctx, when, false);
				}
			}

			// Sixteenth-note sub-beats (¼ and ¾ of the beat)
			if (subdivision === "sixteenth") {
				const t16a = beatTime + spb / 4;
				const t16b = beatTime + (spb * 3) / 4;
				if (t16a >= startOffset && t16a < totalDuration - 0.001) {
					const when = passOffset + t16a;
					if (when >= ctx.currentTime) scheduleTick(ctx, when, false);
				}
				if (t16b >= startOffset && t16b < totalDuration - 0.001) {
					const when = passOffset + t16b;
					if (when >= ctx.currentTime) scheduleTick(ctx, when, false);
				}
			}
		}
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
		scheduleMetronomePass(offset, passStartOffset);

		if (loopRef.current) {
			const passEndAbsolute = offset + patternDuration;
			const msUntilNext = Math.max(
				0,
				(passEndAbsolute - SCHEDULE_LOOKAHEAD_S - ctx.currentTime) * 1000,
			);
			scheduleTimerRef.current = setTimeout(() => {
				if (!isPlayingRef.current) return;
				if (playOnceRef.current) {
					// Play-once: let the already-scheduled audio finish (SCHEDULE_LOOKAHEAD_S
					// seconds remain at this point), then set state to stopped.
					endTimerRef.current = setTimeout(() => {
						isPlayingRef.current = false;
						setIsPlaying(false);
					}, (SCHEDULE_LOOKAHEAD_S + SOURCE_STOP_BUFFER_S) * 1000);
					return;
				}
				schedulePassAndQueue(passIndex + 1); // subsequent passes always full
			}, msUntilNext);
		}
	}

	// ─── Cancel helpers ──────────────────────────────────────────────────────

	/**
	 * Cancel ALL pre-scheduled AudioBufferSourceNodes and OscillatorNodes
	 * and clear both tracking collections.
	 */
	function cancelAllSources(): void {
		_shutdownEngine(perStringVoicesRef.current, [], allSourcesRef.current);
		for (const osc of allMetronomeSourcesRef.current) {
			try {
				osc.stop();
			} catch {
				/* already ended */
			}
		}
		allMetronomeSourcesRef.current.clear();
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

	function play(pattern: FingerpickPattern, options: PlayOptions = {}, startOffset: number = 0): void {
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
		patternRef.current = pattern;
		eventsRef.current = fingerpickPatternToScheduleEvents(pattern, bpm);
		patternDurationRef.current = getTotalPatternDuration(pattern, bpm);
		loopRef.current = options.loop ?? false;
		loopGapRef.current = options.loopGapSeconds ?? 0;
		timeSignatureRef.current = pattern.timeSignature;
		beatOnsetsRef.current = computeBeatOnsets(pattern, bpm);
		secondsPerBeatRef.current = 60 / bpm;
		startTimeRef.current = ctx.currentTime - startOffset;
		pausedAtRef.current = null;
		pausedPassIndexRef.current = 0;
		isPlayingRef.current = true;
		setIsPlaying(true);
		setIsPaused(false);

		schedulePassAndQueue(0, startOffset);

		if (!loopRef.current) {
			const doneAfterMs = (patternDurationRef.current - startOffset + SOURCE_STOP_BUFFER_S) * 1000;
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

	/**
	 * Toggle metronome on/off mid-playback.
	 *
	 * Disabling: cancels all pre-scheduled oscillators immediately.
	 * Enabling mid-pass: reschedules remaining beats of the current pass from the
	 * current elapsed position — clicks start at the next upcoming beat, not the
	 * next loop pass.
	 */
	function handleSetMetronomeEnabled(enabled: boolean): void {
		metronomeEnabledRef.current = enabled;
		setMetronomeEnabled(enabled);
		if (!enabled) {
			for (const osc of allMetronomeSourcesRef.current) {
				try {
					osc.stop();
				} catch {
					/* already ended */
				}
			}
			allMetronomeSourcesRef.current.clear();
		} else if (isPlayingRef.current) {
			const ctx = ctxRef.current;
			if (!ctx) return;
			const progress = getPlaybackProgress();
			const passIndex = progress?.passIndex ?? 0;
			const elapsed = progress?.elapsed ?? 0;
			const passOffset =
				startTimeRef.current +
				computeLoopOffset(passIndex, patternDurationRef.current, loopGapRef.current);
			scheduleMetronomePass(passOffset, elapsed);
		}
	}

	/** Update metronome volume — takes effect immediately via the shared gain node. */
	function handleSetMetronomeGain(value: number): void {
		metronomeGainRef.current = value;
		setMetronomeGain(value);
		if (metronomeGainNodeRef.current && ctxRef.current?.state !== "closed") {
			metronomeGainNodeRef.current.gain.value = value;
		}
	}

	/**
	 * Change subdivision density. If playing with metronome on, cancels the
	 * remaining pre-scheduled ticks for the current pass and immediately
	 * reschedules them at the new density — so the change takes effect within
	 * the current bar rather than waiting for the next loop pass.
	 */
	function handleSetMetronomeSubdivision(value: MetronomeSubdivision): void {
		metronomeSubdivisionRef.current = value;
		setMetronomeSubdivision(value);

		if (!isPlayingRef.current || !metronomeEnabledRef.current) return;
		const ctx = ctxRef.current;
		if (!ctx) return;

		// Cancel all pending metronome oscillators, then reschedule the current
		// pass's remaining beats from the current playback position.
		for (const osc of allMetronomeSourcesRef.current) {
			try {
				osc.stop();
			} catch {
				/* already ended */
			}
		}
		allMetronomeSourcesRef.current.clear();

		const progress = getPlaybackProgress();
		const passIndex = progress?.passIndex ?? 0;
		const elapsed = progress?.elapsed ?? 0;
		const passOffset =
			startTimeRef.current +
			computeLoopOffset(passIndex, patternDurationRef.current, loopGapRef.current);
		scheduleMetronomePass(passOffset, elapsed);
	}

	/**
	 * Change playback BPM and reschedule audio seamlessly from the current musical
	 * position.
	 *
	 * - Playing: cancels all pre-scheduled sources (reusing the same allSourcesRef-
	 *   based mechanism from pause), finds the current slot via getProgressAtTime,
	 *   maps it to its new-BPM start time via findSlotStartTime, then restarts
	 *   scheduling from that position — no audible restart or jump.
	 * - Paused: converts the saved pausedAt offset to the equivalent new-BPM time so
	 *   resume() plays from the same musical position at the new tempo.
	 * - Stopped: no-op — the page's bpm state is picked up on the next play() call.
	 */
	function applyBpmChange(newBpm: number): void {
		const pattern = patternRef.current;
		if (!pattern) return;

		const newEvents = fingerpickPatternToScheduleEvents(pattern, newBpm);
		const newPatternDuration = getTotalPatternDuration(pattern, newBpm);
		const newBeatOnsets = computeBeatOnsets(pattern, newBpm);
		secondsPerBeatRef.current = 60 / newBpm;

		if (isPlayingRef.current) {
			const progress = getPlaybackProgress();
			const passIndex = progress?.passIndex ?? 0;

			clearTimers();
			cancelAllSources();

			const newPausedAt = progress
				? findSlotStartTime(newEvents, progress.measureIndex, progress.slotIndex)
				: 0;

			eventsRef.current = newEvents;
			patternDurationRef.current = newPatternDuration;
			beatOnsetsRef.current = newBeatOnsets;

			const ctx = ctxRef.current;
			if (!ctx) return;

			const totalElapsedAtPosition =
				computeLoopOffset(passIndex, newPatternDuration, loopGapRef.current) + newPausedAt;
			startTimeRef.current = ctx.currentTime - totalElapsedAtPosition;

			schedulePassAndQueue(passIndex, newPausedAt);

			if (!loopRef.current) {
				const remainingMs = (newPatternDuration - newPausedAt + SOURCE_STOP_BUFFER_S) * 1000;
				endTimerRef.current = setTimeout(() => {
					isPlayingRef.current = false;
					setIsPlaying(false);
				}, remainingMs);
			}
		} else if (pausedAtRef.current !== null) {
			// Paused: convert the saved elapsed position to new-BPM time.
			const position = getProgressAtTime(eventsRef.current, pausedAtRef.current);
			const newPausedAt = position
				? findSlotStartTime(newEvents, position.measureIndex, position.slotIndex)
				: 0;

			pausedAtRef.current = newPausedAt;
			eventsRef.current = newEvents;
			patternDurationRef.current = newPatternDuration;
			beatOnsetsRef.current = newBeatOnsets;
		}
		// Stopped: no-op — page's bpm state drives the next play() call.
	}

	/**
	 * Change the loop gap mid-playback.
	 *
	 * - Playing + looping: recalibrates startTimeRef so computeLoopOffset() still
	 *   maps the current passIndex/elapsed to ctx.currentTime with the new gap, then
	 *   resets the scheduling timer so the next pass is queued at the right moment.
	 *   No audio sources are cancelled — notes already scheduled for the current pass
	 *   continue unaffected; only the inter-pass spacing changes.
	 * - Paused: updates loopGapRef so resume() picks up the new gap.
	 * - Stopped / not looping: no-op — play() re-reads loopGapSeconds from options.
	 */
	function applyLoopGapChange(newLoopGapSeconds: number): void {
		if (!isPlayingRef.current || !loopRef.current) {
			loopGapRef.current = newLoopGapSeconds;
			return;
		}

		const ctx = ctxRef.current;
		if (!ctx) return;

		// Capture position BEFORE mutating loopGapRef (getPlaybackProgress reads it).
		const progress = getPlaybackProgress();
		const passIndex = progress?.passIndex ?? 0;
		const elapsed = progress?.elapsed ?? 0;

		loopGapRef.current = newLoopGapSeconds;

		// Recalibrate startTimeRef so the new loopGap maps passIndex/elapsed correctly.
		const patternDuration = patternDurationRef.current;
		startTimeRef.current =
			ctx.currentTime -
			computeLoopOffset(passIndex, patternDuration, newLoopGapSeconds) -
			elapsed;

		// Cancel the old scheduling timer (computed with the old gap) and set a new
		// one based on how much time remains in the current pass.
		if (scheduleTimerRef.current !== null) {
			clearTimeout(scheduleTimerRef.current);
		}
		const remainingInPass = patternDuration - elapsed;
		const msUntilNext = Math.max(0, (remainingInPass - SCHEDULE_LOOKAHEAD_S) * 1000);
		scheduleTimerRef.current = setTimeout(() => {
			if (!isPlayingRef.current) return;
			schedulePassAndQueue(passIndex + 1);
		}, msUntilNext);
	}

	/**
	 * Jump playback to the note at the given measure/slot index.
	 *
	 * - Playing: cancels all pre-scheduled sources and reschedules from the new
	 *   position — same seek+reschedule mechanism used by applyBpmChange.
	 * - Paused: updates the saved pause position so resume() plays from the new note.
	 * - Stopped: no-op — the caller handles this via a pending-seek ref + play().
	 */
	function seekToNote(measureIndex: number, slotIndex: number): void {
		if (isPlayingRef.current) {
			const progress = getPlaybackProgress();
			const passIndex = progress?.passIndex ?? 0;

			clearTimers();
			cancelAllSources();

			const ctx = ctxRef.current;
			if (!ctx) return;

			const newTime = findSlotStartTime(eventsRef.current, measureIndex, slotIndex);
			const totalElapsed =
				computeLoopOffset(passIndex, patternDurationRef.current, loopGapRef.current) + newTime;
			startTimeRef.current = ctx.currentTime - totalElapsed;

			schedulePassAndQueue(passIndex, newTime);

			if (!loopRef.current) {
				const remainingMs =
					(patternDurationRef.current - newTime + SOURCE_STOP_BUFFER_S) * 1000;
				endTimerRef.current = setTimeout(() => {
					isPlayingRef.current = false;
					setIsPlaying(false);
				}, remainingMs);
			}
		} else if (pausedAtRef.current !== null) {
			// Paused: update saved position for resume(); reset to pass 0 for a clean seek.
			pausedAtRef.current = findSlotStartTime(eventsRef.current, measureIndex, slotIndex);
			pausedPassIndexRef.current = 0;
		}
	}

	/** Update note volume — takes effect immediately via the master gain node. */
	function handleSetNoteGain(value: number): void {
		noteGainRef.current = value;
		setNoteGain(value);
		if (masterGainRef.current && ctxRef.current?.state !== "closed") {
			masterGainRef.current.gain.value = NORMAL_GAIN * value;
		}
	}

	// ─── Cleanup ─────────────────────────────────────────────────────────────

	useEffect(() => {
		const voices = perStringVoicesRef.current;
		const allSources = allSourcesRef.current;
		const allMetronomeSources = allMetronomeSourcesRef.current;
		return () => {
			isPlayingRef.current = false;
			_shutdownEngine(voices, [scheduleTimerRef.current, endTimerRef.current], allSources);
			for (const osc of allMetronomeSources) {
				try {
					osc.stop();
				} catch {
					/* already ended */
				}
			}
			allMetronomeSources.clear();
			ctxRef.current?.close();
		};
	}, []);

	return {
		isLoaded,
		isPlaying,
		isPaused,
		playOnce,
		setPlayOnce,
		load,
		play,
		pause,
		resume,
		stop,
		getPlaybackProgress,
		applyBpmChange,
		applyLoopGapChange,
		seekToNote,
		metronomeEnabled,
		setMetronomeEnabled: handleSetMetronomeEnabled,
		metronomeSubdivision,
		setMetronomeSubdivision: handleSetMetronomeSubdivision,
		metronomeGain,
		setMetronomeGain: handleSetMetronomeGain,
		accentEnabled,
		setAccentEnabled,
		noteGain,
		setNoteGain: handleSetNoteGain,
	};
}
