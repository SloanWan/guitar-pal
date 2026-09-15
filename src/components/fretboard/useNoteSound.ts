"use client";

/**
 * One note at a time from the fretboard page, in either of its two voices:
 * the guitar pluck preset the chord preview already uses (for the neck) and
 * the piano preset (for the root selector's keys).
 *
 * The AudioContext is created on the first press (browsers reject one built
 * before a user gesture). Each voice's samples are fetched once, on the first
 * press of that voice. Unmount stops any note still ringing and closes the
 * context, so a board that goes away leaves no source node or scheduled
 * callback behind (Constraint 4).
 *
 * Each voice plays through its own gain node, so the two instruments can be
 * balanced against each other: the preset levels are whatever the samples
 * happen to be, and a player learning chords may want the neck loud and the
 * keyboard quiet. Both triggers already take a destination, so the levels are
 * a concern of this hook alone — neither sample loader changes.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
	cancelPianoNotes,
	preloadPianoPreset,
	triggerPianoNote,
} from "@/components/fretboard/pianoSampleLoader";
import {
	cancelStrums,
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

export type NoteVoice = "guitar" | "piano";

export interface NoteSound {
	/**
	 * Sound one MIDI pitch in a voice (guitar by default). Resolves once the
	 * note has been scheduled, or at once if that voice's samples are still
	 * downloading: the press that started the download plays when it lands,
	 * presses in between are dropped rather than fired as a burst.
	 */
	play: (midi: number, voice?: NoteVoice) => Promise<void>;
	/** Sound several pitches at once, low to high with a strum's stagger. Same loading rules. */
	playChord: (midis: readonly number[], voice?: NoteVoice) => Promise<void>;
	/** True while any voice's samples are downloading for a first press. */
	isLoading: boolean;
	/** Each voice's level, 0…1. */
	volumes: Readonly<Record<NoteVoice, number>>;
	/** Set one voice's level. Ramped, so a slider drag does not click. */
	setVolume: (voice: NoteVoice, level: number) => void;
	/**
	 * Make a voice ready and hand back what a scheduler needs: the context and
	 * the node to play into. Unlike `play`, this waits for a download already
	 * in flight rather than dropping the request, because a run is deliberate.
	 * Null when the board went away mid-download.
	 */
	prepare: (voice: NoteVoice) => Promise<AudioBus | null>;
	/** The bus as it stands, without preparing anything; null before the first press. */
	bus: () => AudioBus | null;
}

/** What a scheduler needs to place notes itself. */
export interface AudioBus {
	ctx: AudioContext;
	/** The gain node a voice plays into, so its fader applies. */
	target: (voice: NoteVoice) => AudioNode;
}

/** Device-local memory of the two levels. */
export const VOLUME_STORAGE_KEY = "fretboardVolume";
export const DEFAULT_VOLUME = 0.8;
/** Long enough that a drag glides, short enough to feel immediate. */
const VOLUME_RAMP_S = 0.02;

/** Per-note offset inside a chord, the strum engine's own. */
const CHORD_STAGGER_S = 0.01;

const VOICES: Record<
	NoteVoice,
	{
		preload: (ctx: AudioContext) => Promise<void>;
		trigger: (midis: readonly number[], ctx: AudioContext, target: AudioNode) => void;
	}
> = {
	guitar: {
		preload: preloadFingerpickPresets,
		// The preview already sorts and staggers the strings.
		trigger: (midis, ctx, target) => triggerChordPreview(midis, ctx, target, ctx.currentTime),
	},
	piano: {
		preload: preloadPianoPreset,
		trigger: (midis, ctx, target) => {
			[...midis]
				.sort((a, b) => a - b)
				.forEach((midi, i) => triggerPianoNote(midi, ctx, target, ctx.currentTime + i * CHORD_STAGGER_S));
		},
	},
};

function readStoredVolumes(): Record<NoteVoice, number> | null {
	try {
		const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const level = (v: NoteVoice): number => {
			const n = (parsed as Record<string, unknown>)[v];
			return typeof n === "number" && n >= 0 && n <= 1 ? n : DEFAULT_VOLUME;
		};
		return { guitar: level("guitar"), piano: level("piano") };
	} catch {
		return null;
	}
}

export function useNoteSound(): NoteSound {
	const ctxRef = useRef<AudioContext | null>(null);
	const preloads = useRef(new Map<NoteVoice, Promise<void>>());
	const ready = useRef(new Set<NoteVoice>());
	const gains = useRef(new Map<NoteVoice, GainNode>());
	const [loadingCount, setLoadingCount] = useState(0);
	// Default first so the server and the first client render agree; the
	// stored levels are applied after mount, like the SOUND rocker's.
	const [volumes, setVolumes] = useState<Record<NoteVoice, number>>({
		guitar: DEFAULT_VOLUME,
		piano: DEFAULT_VOLUME,
	});
	// Mirrored for the audio path, which runs outside render.
	const volumesRef = useRef(volumes);
	useEffect(() => {
		volumesRef.current = volumes;
	}, [volumes]);

	useEffect(() => {
		const stored = readStoredVolumes();
		if (stored) queueMicrotask(() => setVolumes(stored));
	}, []);

	useEffect(() => {
		const inFlight = preloads.current;
		const done = ready.current;
		const nodes = gains.current;
		return () => {
			cancelStrums();
			cancelPianoNotes();
			for (const node of nodes.values()) node.disconnect();
			nodes.clear();
			ctxRef.current?.close().catch(() => undefined);
			ctxRef.current = null;
			inFlight.clear();
			done.clear();
		};
	}, []);

	/** This voice's gain node, made on first use and held at the current level. */
	const gainFor = useCallback((voice: NoteVoice, ctx: AudioContext): GainNode => {
		const existing = gains.current.get(voice);
		if (existing) return existing;
		const node = ctx.createGain();
		node.gain.value = volumesRef.current[voice];
		node.connect(ctx.destination);
		gains.current.set(voice, node);
		return node;
	}, []);

	const setVolume = useCallback((voice: NoteVoice, level: number) => {
		const clamped = Math.min(1, Math.max(0, level));
		setVolumes((prev) => ({ ...prev, [voice]: clamped }));
		const ctx = ctxRef.current;
		const node = gains.current.get(voice);
		// Ramp rather than assign, or a drag steps through audible clicks.
		if (ctx && node) node.gain.setTargetAtTime(clamped, ctx.currentTime, VOLUME_RAMP_S);
		try {
			localStorage.setItem(
				VOLUME_STORAGE_KEY,
				JSON.stringify({ ...volumesRef.current, [voice]: clamped }),
			);
		} catch {
			// A browser refusing storage is no reason to refuse the change.
		}
	}, []);

	/**
	 * The context, with this voice's samples ready. Null when the caller should
	 * give up: the board unmounted, or (unless `wait`) a download is already
	 * running and this press would only queue up behind it.
	 */
	const ensureVoice = useCallback(async (voice: NoteVoice, wait = false): Promise<AudioContext | null> => {
		if (!ctxRef.current) ctxRef.current = new AudioContext();
		const ctx = ctxRef.current;
		if (!ready.current.has(voice)) {
			const running = preloads.current.get(voice);
			if (running) {
				if (!wait) return null;
				await running;
			} else {
				const preload = VOICES[voice].preload(ctx);
				preloads.current.set(voice, preload);
				setLoadingCount((n) => n + 1);
				try {
					await preload;
					ready.current.add(voice);
				} catch (err) {
					// A failed download (offline, CDN down) is forgotten so the next
					// press tries again instead of staying silent for the session.
					preloads.current.delete(voice);
					throw err;
				} finally {
					// Skip the state write if the board went away mid-download.
					if (ctxRef.current === ctx) setLoadingCount((n) => n - 1);
				}
			}
		}
		// The board may have unmounted while the samples were downloading.
		if (ctxRef.current !== ctx) return null;
		if (ctx.state === "suspended") await ctx.resume();
		return ctx;
	}, []);

	const bus = useCallback((): AudioBus | null => {
		const ctx = ctxRef.current;
		return ctx ? { ctx, target: (voice) => gainFor(voice, ctx) } : null;
	}, [gainFor]);

	const prepare = useCallback(
		async (voice: NoteVoice): Promise<AudioBus | null> => {
			const ctx = await ensureVoice(voice, true);
			return ctx ? { ctx, target: (v) => gainFor(v, ctx) } : null;
		},
		[ensureVoice, gainFor],
	);

	const playChord = useCallback(
		async (midis: readonly number[], voice: NoteVoice = "guitar") => {
			const ctx = await ensureVoice(voice);
			if (!ctx) return;
			VOICES[voice].trigger(midis, ctx, gainFor(voice, ctx));
		},
		[ensureVoice, gainFor],
	);

	const play = useCallback((midi: number, voice: NoteVoice = "guitar") => playChord([midi], voice), [playChord]);

	return { play, playChord, isLoading: loadingCount > 0, volumes, setVolume, prepare, bus };
}
