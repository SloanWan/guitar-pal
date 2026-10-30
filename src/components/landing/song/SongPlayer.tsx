"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useStrumPlayback } from "@/components/strum/useStrumPlayback";
import { useFingerpickAudioEngine, type PlayOptions } from "@/components/fingerpick/useFingerpickAudioEngine";
import type { RhythmPosition } from "@/components/strum/stage/RhythmGrid";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import { SONG, SONG_PROGRESSION, SONG_RHYTHM, SONG_TAB, songVoicingLookup, tabMeasureBar } from "@/lib/landing/song";

// Picked as the Tab page plays a tab: repeats played out, every note let ring, round and round.
const PICKED = expandFingerpickPattern(SONG_TAB).pattern;
const PICK_OPTIONS: PlayOptions = { loop: true, forceLetRing: true };

export type SongMode = "strum" | "pick";

export interface TabSlot {
	measureIndex: number;
	slotIndex: number;
}

export interface SongPlayer {
	mode: SongMode;
	/** Switches what plays; a song that is playing carries on in the other mode. */
	setMode: (mode: SongMode) => void;
	playing: boolean;
	/** Pressed, samples still on their way. */
	preparing: boolean;
	toggle: () => void;
	/** The song's bar sounding (0–7), or null while stopped. */
	bar: number | null;
	/** Where the strum grid's playhead is, while strumming. */
	rhythmPosition: RhythmPosition | null;
	/** The tab note sounding, while picking. */
	tabSlot: TabSlot | null;
}

const SongPlayerContext = createContext<SongPlayer | null>(null);

export function useSongPlayer(): SongPlayer {
	const player = useContext(SongPlayerContext);
	if (!player) throw new Error("useSongPlayer outside SongPlayerProvider");
	return player;
}

/**
 * One player for the whole landing page: the song plays strummed (the Strum
 * page's engine, fed the song's progression) or picked (the fingerpick
 * engine, fed the preset's first eight measures), and every step on the page
 * reads where it is from here — the chord tiles, the shapes, the neck, the
 * grid and the stave all follow the same bar.
 */
export function SongPlayerProvider({ children }: { children: React.ReactNode }) {
	const [mode, setModeState] = useState<SongMode>("strum");

	const strum = useStrumPlayback({
		rhythm: SONG_RHYTHM,
		progression: SONG_PROGRESSION,
		meter: SONG.meter,
		bpm: SONG.bpm,
		lookupVoicings: songVoicingLookup,
		voicingsKey: "landing",
	});
	const pick = useFingerpickAudioEngine();
	// The engine stops after one pass unless told otherwise; the song loops, as the Tab page's loop does.
	const { setPlayOnce } = pick;
	useEffect(() => setPlayOnce(false), [setPlayOnce]);

	// The fingerpick engine plays only once its samples are in; a press before
	// then waits here and starts when they land.
	const [pickPending, setPickPending] = useState(false);
	const { isLoaded: pickLoaded, play: pickPlay } = pick;
	useEffect(() => {
		if (!pickPending || !pickLoaded) return;
		pickPlay(PICKED, PICK_OPTIONS);
		queueMicrotask(() => setPickPending(false));
	}, [pickPending, pickLoaded, pickPlay]);

	// The stave cursor follows the engine's clock, read once a frame and only
	// handed on when the sounding note changes.
	const [tabSlot, setTabSlot] = useState<TabSlot | null>(null);
	const getProgressRef = useRef(pick.getPlaybackProgress);
	useEffect(() => {
		getProgressRef.current = pick.getPlaybackProgress;
	});
	useEffect(() => {
		if (!pick.isPlaying) {
			queueMicrotask(() => setTabSlot(null));
			return;
		}
		let frame = 0;
		const tick = () => {
			const p = getProgressRef.current();
			setTabSlot((prev) =>
				p && (prev?.measureIndex !== p.measureIndex || prev?.slotIndex !== p.slotIndex)
					? { measureIndex: p.measureIndex, slotIndex: p.slotIndex }
					: prev,
			);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [pick.isPlaying]);

	// Stable handles on both engines for the callbacks and the unmount below.
	const enginesRef = useRef({ strum, pick });
	useEffect(() => {
		enginesRef.current = { strum, pick };
	});

	const startMode = useCallback((m: SongMode) => {
		const { strum: s, pick: p } = enginesRef.current;
		if (m === "strum") {
			s.start();
			return;
		}
		if (p.isLoaded) p.play(PICKED, PICK_OPTIONS);
		else {
			setPickPending(true);
			void p.load();
		}
	}, []);

	const stopAll = useCallback(() => {
		const { strum: s, pick: p } = enginesRef.current;
		s.stop();
		p.stop();
		setPickPending(false);
	}, []);

	// Nothing keeps sounding after the page goes.
	useEffect(() => stopAll, [stopAll]);

	const playing = strum.isPlaying || strum.isPreparing || pick.isPlaying || pickPending;

	const toggle = useCallback(() => {
		if (playing) stopAll();
		else startMode(mode);
	}, [playing, mode, stopAll, startMode]);

	const setMode = useCallback(
		(next: SongMode) => {
			if (next === mode) return;
			setModeState(next);
			if (playing) {
				stopAll();
				startMode(next);
			}
		},
		[mode, playing, stopAll, startMode],
	);

	const bar =
		mode === "strum"
			? strum.isPlaying
				? strum.chordBar
				: null
			: tabSlot
				? tabMeasureBar(tabSlot.measureIndex)
				: null;

	const value = useMemo<SongPlayer>(
		() => ({
			mode,
			setMode,
			playing,
			preparing: strum.isPreparing || pickPending,
			toggle,
			bar,
			rhythmPosition: mode === "strum" ? strum.rhythmPosition : null,
			tabSlot: mode === "pick" ? tabSlot : null,
		}),
		[mode, setMode, playing, strum.isPreparing, pickPending, toggle, bar, strum.rhythmPosition, tabSlot],
	);

	return <SongPlayerContext.Provider value={value}>{children}</SongPlayerContext.Provider>;
}
