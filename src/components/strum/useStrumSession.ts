import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
	DEFAULT_STRUM_BPM,
	LAST_STRUM_PATTERN_KEY,
	PRESET_STRUM_PATTERNS,
	type Beat,
	type ChordProgression,
	type StrumPattern,
} from "@/lib/strumPatterns";
import { clampBpmToMeter, normalizeBpm, patternBpm, patternMeter, uniquePatternName } from "@/lib/strumBars";
import { DEFAULT_METER } from "@/lib/strumMeter";
import { alignToRhythm, patternRhythm, rhythmOfBars, withRhythm } from "@/lib/strumRhythm";
import {
	nextOrderIndex,
	normalizeCapo,
	progressionBarsFromTokens,
	progressionsForPattern,
	type ChordToken,
} from "@/lib/strumProgressions";
import {
	HANDOFF_EVENT,
	takeHandoff,
	type AttachHandoff,
	type ChordsHandoff,
	type DeleteHandoff,
	type RenameHandoff,
	type StrumHandoff,
} from "@/lib/assistant/handoff";
import type { SharedStrum } from "@/lib/sharedItems";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import { useRecordVisit } from "@/hooks/useRecordVisit";
import type { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import type { useChordProgressions } from "@/components/strum/useChordProgressions";

/**
 * Chords waiting for a pattern (the Chords board's handoff). `chosen` is false
 * until the player picks one: the pattern open underneath is only where the
 * page was, not an answer.
 */
export interface PendingChords {
	bars: ChordProgression["bars"];
	capo: number | null;
	chosen: boolean;
}

/** The id the waiting chords play under before they are saved. */
export const PENDING_PROGRESSION_ID = "pending";

/** Device-local memory of which pattern and which progression were open. */
export const LAST_PATTERN_KEY = LAST_STRUM_PATTERN_KEY;
export const OPEN_PROGRESSION_KEY = "strumOpenProgression";

interface Args {
	/** A shared snapshot: nothing is restored, saved or written back. */
	shared?: SharedStrum;
	user: User | null;
	library: ReturnType<typeof useStrumPatterns>;
	sequences: ReturnType<typeof useChordProgressions>;
	/** Stops the transport; called before anything that changes what plays. */
	stop: () => void;
}

/**
 * What the Strum page has open and every change to it: which pattern, which of
 * its progressions, at what tempo — restored on arrival, remembered on change —
 * and the writes that go through the library hooks (saving a rhythm, adding a
 * sequence, the assistant's handoffs, deleting).
 */
export function useStrumSession({ shared, user, library, sequences, stop }: Args) {
	const isShared = shared !== undefined;
	const sharedOpen = shared?.progressions[shared.openIndex] ?? null;
	const { customPatterns, patternsLoading } = library;
	const { progressions, progressionsLoading, handleSaveProgression } = sequences;

	// Null until the device-local choice has been read: showing a preset first and
	// swapping it out a tick later reads as a glitch, so the stage waits instead.
	const [selectedPattern, setSelectedPattern] = useState<StrumPattern | null>(shared?.pattern ?? null);
	const [patternRestored, setPatternRestored] = useState(isShared);
	const [openProgressionId, setOpenProgressionId] = useState<string | null>(sharedOpen?.id ?? null);
	const [progressionRestored, setProgressionRestored] = useState(isShared);
	const [pending, setPending] = useState<PendingChords | null>(null);
	const meter = selectedPattern ? patternMeter(selectedPattern) : DEFAULT_METER;
	const [bpm, setBpmRaw] = useState(() =>
		shared
			? clampBpmToMeter(
					sharedOpen?.bpm !== undefined ? normalizeBpm(sharedOpen.bpm) : patternBpm(shared.pattern),
					patternMeter(shared.pattern),
				)
			: patternBpm(PRESET_STRUM_PATTERNS[0]),
	);
	const setBpm = (value: number) => setBpmRaw(clampBpmToMeter(value, meter));

	const allPatterns = [...PRESET_STRUM_PATTERNS, ...customPatterns];
	const owned = selectedPattern !== null && customPatterns.some((p) => p.id === selectedPattern.id);

	const patternProgressions = useMemo(
		() =>
			shared
				? shared.progressions
				: selectedPattern
					? progressionsForPattern(progressions, selectedPattern.id)
					: [],
		[progressions, selectedPattern, shared],
	);
	const openProgression = patternProgressions.find((p) => p.id === openProgressionId) ?? null;
	/** The waiting chords on the chosen pattern's rhythm, to hear before they are saved. */
	const pendingProgression = useMemo<ChordProgression | null>(
		() =>
			pending?.chosen && selectedPattern
				? {
						id: PENDING_PROGRESSION_ID,
						patternId: selectedPattern.id,
						bars: alignToRhythm(pending.bars, patternRhythm(selectedPattern)),
						orderIndex: 0,
						...(pending.capo === null ? {} : { capo: normalizeCapo(pending.capo) }),
					}
				: null,
		[pending, selectedPattern],
	);

	/** The tempo something opens at: the progression's own, else the pattern's. */
	function bpmFor(progression: ChordProgression | null, pattern: StrumPattern | null = selectedPattern): number {
		const patternMeterNow = pattern ? patternMeter(pattern) : DEFAULT_METER;
		const raw =
			progression?.bpm !== undefined
				? normalizeBpm(progression.bpm)
				: pattern
					? patternBpm(pattern)
					: DEFAULT_STRUM_BPM;
		return clampBpmToMeter(raw, patternMeterNow);
	}
	const defaultBpm = bpmFor(openProgression);

	// The progression to reopen, read on mount before anything is written back.
	const savedProgressionIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (isShared) return;
		savedProgressionIdRef.current = localStorage.getItem(OPEN_PROGRESSION_KEY);
	}, [isShared]);

	function openPattern(pattern: StrumPattern, progressionId: string | null = null) {
		setSelectedPattern(pattern);
		setOpenProgressionId(progressionId);
		const progression = progressionId ? progressions.find((p) => p.id === progressionId) ?? null : null;
		setBpmRaw(bpmFor(progression, pattern));
		setPatternRestored(true);
	}

	/**
	 * Save a proposal the assistant handed over, and open it. The assistant owns
	 * no write path of its own: the pattern and any progression go through the
	 * same hooks the page uses.
	 */
	function applyHandoff(handoff: StrumHandoff) {
		if (handoff.kind === "attach") return applyAttachHandoff(handoff);
		if (handoff.kind === "chords") return applyChordsHandoff(handoff);
		if (handoff.kind === "rename") return applyRenameHandoff(handoff);
		if (handoff.kind === "delete") return applyDeleteHandoff(handoff);

		const pattern = withRhythm(
			{
				id: crypto.randomUUID(),
				// Confirmed already; a name clash takes a number rather than a step back.
				name: uniquePatternName(handoff.name, allPatterns),
				beats: [],
				...(handoff.bpm === null ? {} : { bpm: handoff.bpm }),
			},
			rhythmOfBars(handoff.bars),
		);
		library.handleSaveCustomPattern(pattern);
		const progression: ChordProgression | null =
			handoff.chords.length > 0
				? {
						id: crypto.randomUUID(),
						patternId: pattern.id,
						bars: alignToRhythm(handoff.bars, patternRhythm(pattern)),
						orderIndex: nextOrderIndex([]),
						...(handoff.capo === null ? {} : { capo: normalizeCapo(handoff.capo) }),
					}
				: null;
		if (progression) handleSaveProgression(progression);
		queueMicrotask(() => {
			stop();
			setSelectedPattern(pattern);
			setOpenProgressionId(progression?.id ?? null);
			setBpmRaw(clampBpmToMeter(patternBpm(pattern), patternMeter(pattern)));
			setPatternRestored(true);
		});
	}

	/** A progression the assistant assembled, put onto a pattern that already exists. */
	function applyAttachHandoff(handoff: AttachHandoff) {
		const pattern = allPatterns.find((p) => p.id === handoff.patternId);
		if (!pattern) {
			toast(`"${handoff.patternName}" is no longer in your patterns — nothing was saved.`);
			return;
		}
		const progression: ChordProgression = {
			id: crypto.randomUUID(),
			patternId: pattern.id,
			bars: alignToRhythm(handoff.bars, patternRhythm(pattern)),
			orderIndex: nextOrderIndex(progressionsForPattern(progressions, pattern.id)),
			...(handoff.capo === null ? {} : { capo: normalizeCapo(handoff.capo) }),
		};
		handleSaveProgression(progression);
		queueMicrotask(() => {
			stop();
			setSelectedPattern(pattern);
			setOpenProgressionId(progression.id);
			setBpmRaw(bpmFor(progression, pattern));
			setPatternRestored(true);
			localStorage.setItem(LAST_PATTERN_KEY, pattern.id);
		});
	}

	/**
	 * Chords that still need a pattern: nothing is saved, the page asks. What was
	 * open stays open underneath (or the last pattern, on arrival), so cancelling
	 * returns to it.
	 */
	function applyChordsHandoff(handoff: ChordsHandoff) {
		stop();
		setPending({ bars: handoff.bars, capo: handoff.capo, chosen: false });
		if (!patternRestoredRef.current || selectedPattern === null) queueMicrotask(() => openPattern(restoredPattern()));
	}

	/** The pattern the waiting chords go on: opened, so its rhythm shows and plays under them. */
	function choosePendingPattern(pattern: StrumPattern) {
		selectPattern(pattern);
		setPending((p) => (p ? { ...p, chosen: true } : p));
	}

	/** A pattern written for the waiting chords, saved and chosen. */
	function createPendingPattern(pattern: StrumPattern) {
		library.handleSaveCustomPattern(pattern);
		choosePendingPattern(pattern);
	}

	/** The waiting chords, saved as a new progression on the chosen pattern, and opened. */
	function confirmPending() {
		if (!pendingProgression || !selectedPattern) return;
		const progression: ChordProgression = {
			...pendingProgression,
			id: crypto.randomUUID(),
			orderIndex: nextOrderIndex(progressionsForPattern(progressions, selectedPattern.id)),
		};
		handleSaveProgression(progression);
		setPending(null);
		openProgressionById(progression.id);
	}

	function cancelPending() {
		stop();
		setPending(null);
	}

	/** Rename one of the player's own patterns; a preset never reaches here. */
	function applyRenameHandoff(handoff: RenameHandoff) {
		const pattern = customPatterns.find((p) => p.id === handoff.patternId);
		if (!pattern) {
			toast(`"${handoff.patternName}" is no longer in your patterns — nothing was changed.`);
			return;
		}
		const name = uniquePatternName(handoff.newName, allPatterns.filter((p) => p.id !== pattern.id));
		const renamed = { ...pattern, name };
		library.handleEditCustomPattern(renamed);
		if (selectedPattern?.id === pattern.id) setSelectedPattern(renamed);
		toast(`Renamed to "${name}".`);
	}

	/** Delete one of the player's own patterns, progressions and all. */
	function applyDeleteHandoff(handoff: DeleteHandoff) {
		const pattern = customPatterns.find((p) => p.id === handoff.patternId);
		if (!pattern) {
			toast(`"${handoff.patternName}" is no longer in your patterns — nothing was deleted.`);
			return;
		}
		removePattern(pattern.id);
		toast(`Deleted "${pattern.name}".`);
	}

	// The assistant lives in the header, so a proposal is usually confirmed with
	// this page already on screen. Subscribe once, always call the current closure.
	const applyHandoffRef = useRef(applyHandoff);
	useEffect(() => {
		applyHandoffRef.current = applyHandoff;
	});
	useEffect(() => {
		// A share page is not where a confirmed proposal lands.
		if (isShared) return;
		function handleHandoff() {
			const handoff = takeHandoff();
			if (handoff) applyHandoffRef.current(handoff);
		}
		window.addEventListener(HANDOFF_EVENT, handleHandoff);
		return () => window.removeEventListener(HANDOFF_EVENT, handleHandoff);
	}, [isShared]);

	/** The pattern the page opens on: a `?pattern=` deep link, else the last one opened here. */
	function restoredPattern(): StrumPattern {
		const queryId = new URLSearchParams(window.location.search).get("pattern");
		const savedId = queryId ?? localStorage.getItem(LAST_PATTERN_KEY);
		return (savedId ? allPatterns.find((p) => p.id === savedId) : undefined) ?? PRESET_STRUM_PATTERNS[0];
	}

	// Restore the opening pattern once the player's own have loaded. A handoff
	// wins, then a `?pattern=` deep link, then the last one opened here.
	const patternRestoredRef = useRef(isShared);
	useEffect(() => {
		if (patternRestoredRef.current || patternsLoading) return;
		patternRestoredRef.current = true;
		const handoff = takeHandoff();
		if (handoff) {
			applyHandoff(handoff);
			return;
		}
		const next = restoredPattern();
		queueMicrotask(() => openPattern(next));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- runs until the player's patterns arrive, then the ref stops it
	}, [patternsLoading, customPatterns]);

	// A pattern deleted elsewhere (another tab, the assistant) falls back to the first preset.
	useEffect(() => {
		if (isShared || patternsLoading || !selectedPattern) return;
		if (allPatterns.some((p) => p.id === selectedPattern.id)) return;
		stop();
		queueMicrotask(() => openPattern(PRESET_STRUM_PATTERNS[0]));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- checks when the library changes, not on every selection
	}, [customPatterns, patternsLoading, isShared]);

	// Reopen the saved progression once the list — and its pattern — have loaded.
	useEffect(() => {
		if (progressionRestored || progressionsLoading || !patternRestored) return;
		const savedId = savedProgressionIdRef.current;
		const found = savedId ? patternProgressions.find((p) => p.id === savedId) : undefined;
		queueMicrotask(() => {
			if (found) {
				setOpenProgressionId(found.id);
				setBpmRaw(bpmFor(found));
			}
			setProgressionRestored(true);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- bpmFor is a new function every render, over state already listed
	}, [progressionRestored, progressionsLoading, patternRestored, patternProgressions]);

	useEffect(() => {
		if (isShared || !progressionRestored) return;
		if (openProgressionId) localStorage.setItem(OPEN_PROGRESSION_KEY, openProgressionId);
		else localStorage.removeItem(OPEN_PROGRESSION_KEY);
	}, [isShared, progressionRestored, openProgressionId]);

	// Opened, picked or restored, counts toward Home's "Most opened"; a share is someone else's.
	useRecordVisit(user, "strum", !isShared && patternRestored && selectedPattern ? selectedPattern.id : null);

	function selectPattern(pattern: StrumPattern) {
		stop();
		openPattern(pattern);
		localStorage.setItem(LAST_PATTERN_KEY, pattern.id);
		// Mirrored to the account so /home can surface it cross-device.
		saveLastPattern(createClient(), user, "strum", pattern.id).catch(console.error);
	}

	function openProgressionById(id: string | null) {
		stop();
		setOpenProgressionId(id);
		setBpmRaw(bpmFor(patternProgressions.find((p) => p.id === id) ?? null));
	}

	/** Save a progression of the open pattern, its bars written with the pattern's rhythm. */
	function saveProgression(progression: ChordProgression) {
		const pattern = allPatterns.find((p) => p.id === progression.patternId) ?? selectedPattern;
		handleSaveProgression(
			pattern ? { ...progression, bars: alignToRhythm(progression.bars, patternRhythm(pattern)) } : progression,
		);
	}

	/** A typed chord line becomes a progression of the open pattern, and opens. */
	function addProgression(tokens: ChordToken[], name?: string): ChordProgression | null {
		if (!selectedPattern) return null;
		const progression: ChordProgression = {
			id: crypto.randomUUID(),
			patternId: selectedPattern.id,
			bars: progressionBarsFromTokens(patternRhythm(selectedPattern), tokens),
			orderIndex: nextOrderIndex(patternProgressions),
			...(name?.trim() ? { name: name.trim() } : {}),
		};
		handleSaveProgression(progression);
		openProgressionById(progression.id);
		return progression;
	}

	/** A copy of a progression under a new id, put after the others and opened. */
	function saveProgressionAsNew(progression: ChordProgression) {
		const name = progression.name?.trim();
		const copy: ChordProgression = {
			...progression,
			id: crypto.randomUUID(),
			name: name ? `${name} (2)` : "",
			orderIndex: nextOrderIndex(patternProgressions),
		};
		saveProgression(copy);
		openProgressionById(copy.id);
	}

	/**
	 * Write a changed pattern back, and carry its rhythm into the sequences over
	 * it so what they store reads the way they play.
	 */
	function savePattern(pattern: StrumPattern) {
		library.handleEditCustomPattern(pattern);
		const rhythm = patternRhythm(pattern);
		for (const progression of progressionsForPattern(progressions, pattern.id)) {
			const aligned = alignToRhythm(progression.bars, rhythm);
			if (aligned !== progression.bars) handleSaveProgression({ ...progression, bars: aligned });
		}
		if (selectedPattern?.id === pattern.id) {
			setSelectedPattern(pattern);
			setBpmRaw(bpmFor(openProgression, pattern));
		}
	}

	/** A new pattern of the player's own, opened as picking it from the library would. */
	function createPattern(pattern: StrumPattern) {
		library.handleSaveCustomPattern(pattern);
		selectPattern(pattern);
	}

	/** The edited rhythm over the open pattern — the player's own, never a preset. */
	function saveRhythm(rhythm: Beat[][]) {
		if (!selectedPattern || !owned) return;
		savePattern(withRhythm(selectedPattern, rhythm));
	}

	/** The edited rhythm as a pattern of its own, named after the one it came from. */
	function saveRhythmAsNew(rhythm: Beat[][]) {
		if (!selectedPattern) return;
		const { createdAt: _createdAt, ...rest } = selectedPattern;
		void _createdAt;
		const copy = withRhythm(
			{ ...rest, id: crypto.randomUUID(), name: uniquePatternName(selectedPattern.name, allPatterns) },
			rhythm,
		);
		createPattern(copy);
		toast(`Saved as "${copy.name}".`);
	}

	/** Deleting a pattern takes the progressions written over it with it. */
	function removePattern(patternId: string) {
		library.handleDeleteCustomPattern(patternId);
		sequences.handleDeletePatternProgressions(patternId);
		if (selectedPattern?.id === patternId) {
			stop();
			openPattern(PRESET_STRUM_PATTERNS[0]);
			localStorage.setItem(LAST_PATTERN_KEY, PRESET_STRUM_PATTERNS[0].id);
		}
	}

	function removeProgression(progression: ChordProgression) {
		sequences.handleDeleteProgression(progression.id);
		if (openProgressionId === progression.id) {
			stop();
			setOpenProgressionId(null);
			setBpmRaw(bpmFor(null));
		}
	}

	/** Make the tempo on screen the one the open progression, or the pattern, opens at. */
	function saveDefaultTempo() {
		if (openProgression) saveProgression({ ...openProgression, bpm });
		else if (selectedPattern && owned) savePattern({ ...selectedPattern, bpm });
	}

	return {
		selectedPattern,
		patternRestored,
		owned,
		meter,
		allPatterns,
		patternProgressions,
		openProgression,
		openProgressionId,
		progressionsReady: progressionRestored && !progressionsLoading,
		bpm,
		setBpm,
		defaultBpm,
		canSaveTempo: !isShared && (openProgression !== null || owned),
		selectPattern,
		openProgressionById,
		saveProgression,
		saveProgressionAsNew,
		addProgression,
		savePattern,
		createPattern,
		saveRhythm,
		saveRhythmAsNew,
		removePattern,
		removeProgression,
		saveDefaultTempo,
		pending,
		pendingProgression,
		choosePendingPattern,
		createPendingPattern,
		confirmPending,
		cancelPending,
	};
}

export type StrumSession = ReturnType<typeof useStrumSession>;
