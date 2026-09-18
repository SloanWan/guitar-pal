"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FingerpickPattern } from "@/lib/fingerpickTypes";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import FingerpickPatternLibrary from "@/components/fingerpick/FingerpickPatternLibrary";
import FingerpickEditModal from "@/components/fingerpick/FingerpickEditModal";
import {
	HANDOFF_EVENT,
	takeHandoff,
	type FingerpickAnyHandoff,
	type FingerpickHandoff,
} from "@/lib/strumAssistant/handoff";
import { applySet, applyTabEdit } from "@/lib/tabAssistant/editIntent";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase";
import { saveLastPattern } from "@/lib/lastPattern";
import { saveUserFingerpickPattern } from "@/lib/fingerpickPatternSync";
import { uniquePatternName } from "@/lib/uniquePatternName";
import type { SharedFingerpick } from "@/lib/sharedItems";
import SharedPatternPanel from "@/components/fingerpick/SharedPatternPanel";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import { useAutoScroll } from "@/components/fingerpick/useAutoScroll";
import { useHideOnScroll } from "@/components/fingerpick/useHideOnScroll";
import { useClickToSeek } from "@/components/fingerpick/useClickToSeek";
import { useMeasureGeometry } from "@/components/fingerpick/useMeasureGeometry";
import {
	EMPTY_SELECTION,
	highlightedRange,
	pickMeasure,
	sectionBands,
	sectionHint,
	type SectionSelection,
} from "@/components/fingerpick/sectionSelection";
import { useTempo } from "@/components/fingerpick/useTempo";
import FingerpickDesktopPanel from "@/components/fingerpick/FingerpickDesktopPanel";
import FingerpickMobileDrawer from "@/components/fingerpick/FingerpickMobileDrawer";
import type { PlaybackControlProps } from "@/components/fingerpick/playbackControlProps";
import {
	chordFretHints,
	chordRegionEnd,
	effectiveChords,
	heldButUnplucked,
	offShapeStrings,
	patternCapo,
	patternHasChords,
	setPatternCapo,
	type FretHint,
} from "@/lib/fingerpickChords";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import { clampBpmToMeter, selectRefVoicing } from "@/lib/strumBars";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { chordVoicingToVexChords } from "@/lib/chordVoicingToVexChords";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";
import { vexChordDefToSVGProps } from "@/components/chords/ChordDiagram";
import ChordShapeStrip, { CHORD_STRIP_ASPECT } from "@/components/fingerpick/ChordShapeStrip";
import ChordViewToggle from "@/components/strum/ChordViewToggle";
import type { ChordLabel } from "@/lib/fingerpickToVexFlow";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import { regionForSelection } from "@/lib/fingerpickLoopRegion";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import {
	SquareMenu,
	Loader2,
	ChevronsDown,
	Brackets,
} from "lucide-react";
import Fader from "@/components/ui/Fader";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import Rocker from "@/components/ui/Rocker";
import {
	CHORD_SHAPE_WIDTH_DEFAULT,
	CHORD_SHAPE_WIDTH_MAX,
	CHORD_SHAPE_WIDTH_MIN,
	SCROLL_SPEED_DEFAULT,
	SCROLL_SPEED_MAX,
	SCROLL_SPEED_MIN,
	readLastPatternId,
	useFingerpickPrefs,
	writeLastPatternId,
} from "@/components/fingerpick/useFingerpickPrefs";
import {
	type LoopGapSeconds,
} from "@/components/fingerpick/playbackConstants";

/**
 * The fingerpick player and editor. On /fingerpick it opens the player's
 * library; given `shared`, it opens that snapshot instead (the /p/[id] route):
 * the library and every save path are hidden, the snapshot is what plays,
 * and the one way to change it is to import it — a copy into the viewer's
 * own library, the way a pattern of their own is saved.
 */
export default function FingerpickWorkspace({ shared }: { shared?: SharedFingerpick }) {
	const router = useRouter();
	const { user, loading } = useUser();
	const {
		patterns,
		customPatterns,
		selectedPattern: librarySelection,
		setSelectedPattern: setLibrarySelection,
		favouriteIds,
		toggleFavourite,
		saveCustomPattern,
		deleteCustomPattern,
		isLoading,
	} = useFingerpickPatterns(user, loading);
	// A shared snapshot is the pattern on screen, and session-only changes to
	// it (the capo badge) land here, never in the library's selection.
	const isShared = shared !== undefined;
	const [sharedPattern, setSharedPattern] = useState(shared?.pattern);
	const selectedPattern = sharedPattern ?? librarySelection;
	function setSelectedPattern(p: FingerpickPattern) {
		if (shared) setSharedPattern(p);
		else setLibrarySelection(p);
	}

	const [showLibrary, setShowLibrary] = useState(false);
	// The scrolling tab viewer; the overlays, auto-scroll and click-to-seek all work inside it.
	const tabViewerRef = useRef<HTMLDivElement>(null);
	// Repeats flattened into a linear playback timeline (the rendered staves stay compact).
	// Memoized on selectedPattern ONLY — expansion is bpm-independent (bpm is applied when
	// events are built from expanded.pattern), and a single memoized object keeps the audio
	// engine, the cursor event mirror, and the origin-index map all on one consistent
	// expansion. See src/lib/fingerpickRepeats.ts.
	const expanded = useMemo(() => expandFingerpickPattern(selectedPattern), [selectedPattern]);
	const [loopGap, setLoopGap] = useState<LoopGapSeconds>(0);
	function handleLoopGapChange(gap: LoopGapSeconds) {
		setLoopGap(gap);
		applyLoopGapChange(gap);
	}
	// Remembered view settings: chord line view and shape size, off-shape
	// colouring, auto-scroll speed.
	const {
		chordView,
		setChordView,
		chordShapeWidth,
		setChordShapeWidth,
		offShapeOn,
		setOffShapeOn,
		scrollSpeed,
		setScrollSpeed,
	} = useFingerpickPrefs();
	// Auto-scroll: the tab creeps upward at a set speed for reading along without
	// a hand free. Off by default; the speed is remembered.
	const {
		contentRef: rowsContainerRef,
		setAutoScroll,
		tabOverflows,
		autoScrollActive,
	} = useAutoScroll({ viewerRef: tabViewerRef, scrollSpeed, patternId: selectedPattern.id });
	// Section mode: pick the first and last measure of the stretch to practise.
	// The selection lives in rendered measure indices; leaving the mode drops it.
	const [sectionMode, setSectionMode] = useState(false);
	const [section, setSection] = useState<SectionSelection>(EMPTY_SELECTION);
	const geometry = useMeasureGeometry({ viewerRef: tabViewerRef, contentRef: rowsContainerRef });
	function toggleSectionMode() {
		setSectionMode((on) => !on);
		setSection(EMPTY_SELECTION);
	}
	// Escape leaves section mode; held in a ref so the key listener below is
	// subscribed once, like the spacebar's.
	const leaveSectionModeRef = useRef(() => {});
	useEffect(() => {
		leaveSectionModeRef.current = () => {
			if (!sectionMode) return;
			setSectionMode(false);
			setSection(EMPTY_SELECTION);
		};
	});
	const hasChords = patternHasChords(selectedPattern.measures);
	const showChordDiagrams = hasChords && chordView === "diagram";
	const chordShapeSize = useMemo(
		() => ({
			width: chordShapeWidth,
			height: Math.round(chordShapeWidth * CHORD_STRIP_ASPECT),
		}),
		[chordShapeWidth],
	);
	// Shapes for the chord line's diagram view: the player's own voicings, and
	// the library's for every chord the pattern names, through the shared cache.
	const { voicings: userVoicings } = useUserChordVoicings(
		showChordDiagrams ? user : null,
		loading || !showChordDiagrams,
	);
	const chordRefs = useMemo(
		() =>
			showChordDiagrams
				? selectedPattern.measures.flatMap((m) =>
						m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : [])),
					)
				: [],
		[selectedPattern.measures, showChordDiagrams],
	);
	const voicingsFor = useChordVoicings(chordRefs, userVoicings);
	// What each string plays in the shape under every slot, for the off-shape
	// colouring. Recomputed only when the pattern or a shape lookup changes —
	// never per frame — and it is six comparisons per slot.
	const showOffShape = showChordDiagrams && offShapeOn;
	const offShapeBySlot = useMemo<readonly number[][][]>(() => {
		if (!showOffShape) return [];
		const chords = effectiveChords(selectedPattern.measures);
		return selectedPattern.measures.map((measure, mi) =>
			measure.slots.map((slot, si) => {
				const ref = chords[mi][si];
				let hints: FretHint[] | null = null;
				if (ref) {
					const state = voicingsFor(ref);
					const voicing = state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
					hints = voicing ? chordFretHints(voicing) : null;
				}
				return offShapeStrings(slot, hints);
			}),
		);
	}, [selectedPattern.measures, showOffShape, voicingsFor]);
	const offShapeAt = useCallback(
		(measureIndex: number, slotIndex: number): readonly number[] =>
			offShapeBySlot[measureIndex]?.[slotIndex] ?? [],
		[offShapeBySlot],
	);
	// The shape over a chord symbol. Strings the shape holds but nothing in the
	// chord's stretch of that measure plucks are drawn faintly, so the fingers
	// that only complete the chord read differently from the ones that sound.
	const chordDiagram = useCallback(
		(label: ChordLabel & { measureIndex: number }) => {
			const state = voicingsFor(label.chord);
			if (state.status !== "ready") return null;
			const voicing = selectRefVoicing(label.chord, state.voicings);
			const measure = selectedPattern.measures[label.measureIndex];
			if (!voicing || !measure) return null;
			const unplucked = heldButUnplucked(
				measure.slots,
				label.slotIndex,
				chordRegionEnd(measure, label.slotIndex),
				voicing,
			);
			const { frets, startFret, barreFret } = vexChordDefToSVGProps(
				chordVoicingToVexChords(voicing),
			);
			return (
				<ChordShapeStrip
					frets={frets}
					startFret={startFret}
					barreFret={barreFret}
					// The strip's strings are indexed low E first; the pattern's the other way.
					dimmedStrings={[...unplucked].reverse()}
					width={chordShapeWidth}
				/>
			);
		},
		[voicingsFor, selectedPattern.measures, chordShapeWidth],
	);
	// Pixel width of the tab viewer container; 0 until the ResizeObserver fires on mount.
	const [containerWidth, setContainerWidth] = useState(0);
	// One-shot guard for restoring the last-viewed pattern from localStorage. Set
	// true once restore runs or the user picks a pattern, whichever comes first.
	// State (not a ref) so the tab viewer can show a loading placeholder until the
	// saved pattern is resolved, instead of flashing the default preset.
	const [patternRestored, setPatternRestored] = useState(shared !== undefined);

	const {
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
		metronomeEnabled,
		setMetronomeEnabled,
		metronomeSubdivision,
		setMetronomeSubdivision,
		metronomeGain,
		setMetronomeGain,
		noteGain,
		setNoteGain,
		applyBpmChange,
		applyLoopGapChange,
		seekToNote,
		setLoopRegion,
	} = useFingerpickAudioEngine();
	// The pattern's own tempo, inside its meter's range (a stored or imported
	// tempo may sit above a compound meter's ceiling).
	const patternBpm = clampBpmToMeter(selectedPattern.bpm, selectedPattern.timeSignature);
	const {
		bpm,
		resetBpm,
		handleBpmChange,
		handleSliderChange,
		handleSliderPointerDown,
		handleSliderPointerUp,
		handleTapTempo,
	} = useTempo({
		initialBpm: patternBpm,
		timeSignature: selectedPattern.timeSignature,
		isPlaying,
		pause,
		resume,
		applyBpmChange,
	});
	// The chosen section loops in the engine: its rendered measures mapped onto
	// the expanded timeline (a repeat inside the section plays). No section, or
	// section mode off, and the whole pattern loops again. The engine's setter
	// is held in a ref — it is recreated every render — so the effect follows
	// only the selection.
	const sectionRange = sectionMode ? section.range : null;
	const setLoopRegionRef = useRef(setLoopRegion);
	useEffect(() => {
		setLoopRegionRef.current = setLoopRegion;
	});
	useEffect(() => {
		setLoopRegionRef.current(
			sectionRange ? regionForSelection(expanded.originMeasureIndices, sectionRange) : null,
		);
	}, [sectionRange, expanded]);
	// Where Stop puts the playhead: the section's first measure while one is chosen.
	const restartMeasure = sectionRange?.startMeasure ?? 0;

	// ── Cursor / scroll ─────────────────────────────────────────────────────
	// Greedy row layout driven by content width; guard: render nothing until the
	// ResizeObserver fires with the real container width on mount.
	const rows = useMemo(
		() =>
			layoutMeasureRows(
				selectedPattern.measures,
				containerWidth,
				showChordDiagrams ? chordShapeSize.width : 0,
			),
		[selectedPattern.measures, containerWidth, showChordDiagrams, chordShapeSize.width],
	);

	const {
		cursorRef,
		measureHighlightRef,
		rowRefs,
		isAutoScrollingRef,
		resetCursor,
		snapCursorToNote,
		startOffsetFor,
		toExpandedMeasureIndex,
	} = usePlaybackCursor({ tabViewerRef, expanded, bpm, rows, isPlaying, getPlaybackProgress });
	const { controlsVisible, restoreControls } = useHideOnScroll({
		viewerRef: tabViewerRef,
		isAutoScrollingRef,
	});
	const { handleTabClick, takePendingSeek, clearPendingSeek } = useClickToSeek({
		viewerRef: tabViewerRef,
		isPlaying,
		isPaused,
		seekToNote,
		toExpandedMeasureIndex,
		snapCursorToNote,
		onInteract: restoreControls,
		sectionMode,
		geometry,
		onPickMeasure: (measureIndex) => setSection((s) => pickMeasure(s, measureIndex)),
	});

	// Preload presets on mount so the first Play is instant.
	// load() is stable in intent but re-created each render; the empty-dep array
	// is intentional — we only want one preload call per page mount.
	useEffect(() => {
		void load();
		document.body.classList.add("fingerpick-page");
		return () => document.body.classList.remove("fingerpick-page");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// A tab made elsewhere — by the assistant, or an import — and handed to this
	// page to open in its editor. Nothing is saved on arrival: the player checks
	// it in the editor and saves it the way a hand-drawn pattern is saved. The
	// assistant lives in the topbar, so the handoff usually lands with this page
	// already on screen; the announcement covers that, the mount read the rest.
	const [handoff, setHandoff] = useState<FingerpickHandoff | null>(null);

	/**
	 * What the assistant does to a pattern the player has — bars added or
	 * rewritten, chords marked, a new name, a new tempo or meter, or deleted —
	 * through the same saves the editor and the library use, so playback and
	 * the list pick the change up. A preset is never changed: an edit to one
	 * is saved as a new pattern of their own, and a rename or delete of one
	 * never reaches here (the assistant refused it).
	 */
	function applyEdit(edit: Exclude<FingerpickAnyHandoff, FingerpickHandoff>) {
		const target = patterns.find((p) => p.id === edit.patternId);
		if (!target) {
			toast(`"${edit.patternName}" is no longer in your patterns — nothing was changed.`);
			return;
		}
		const isPreset = !customPatterns.some((p) => p.id === target.id);

		if (edit.kind === "fingerpick-delete") {
			if (isPreset) return;
			deleteCustomPattern(target.id);
			toast(`Deleted "${target.name}".`);
			return;
		}
		if (edit.kind === "fingerpick-rename") {
			if (isPreset) return;
			// The save keeps names unique, so the name it settled on is the one said.
			const renamed = handleSaveCustom({ ...target, name: edit.newName });
			toast(`Renamed "${target.name}" to "${renamed.name}".`);
			return;
		}
		if (edit.kind === "fingerpick-set") {
			const { next: changed } = applySet(target, edit.bpm, edit.timeSignature);
			const next = isPreset
				? { ...changed, id: crypto.randomUUID(), name: `${target.name} (mine)`, createdAt: undefined }
				: changed;
			const saved = handleSaveCustom(next);
			// Reopened even when it is the pattern on screen: the tempo fader and
			// the meter badge read the selection, and both may have changed.
			if (!isPreset) handleSelectPattern(saved);
			const parts = [
				...(edit.timeSignature ? [`${edit.timeSignature[0]}/${edit.timeSignature[1]}`] : []),
				...(edit.bpm !== null ? [`${next.bpm} BPM`] : []),
			].join(" at ");
			toast(isPreset ? `Saved "${next.name}" at ${parts} — the shipped pattern stays as it was.` : `Set "${target.name}" to ${parts}.`);
			return;
		}

		const edited = applyTabEdit(target, edit.op, edit.barIndex, edit.measures, edit.replaceCount);
		const next = isPreset
			? { ...edited, id: crypto.randomUUID(), name: `${target.name} (mine)`, createdAt: undefined }
			: edited;
		handleSaveCustom(next);
		// A new pattern is opened by the save itself; an edited one is opened
		// here, so the change is what is on screen.
		if (!isPreset && next.id !== selectedPattern.id) handleSelectPattern(next);
		const bars = `${edit.measures.length} bar${edit.measures.length === 1 ? "" : "s"}`;
		const first = (edit.barIndex ?? 0) + 1;
		const where = edit.replaceCount > 1 ? `bars ${first}–${first + edit.replaceCount - 1}` : `bar ${first}`;
		toast(
			edit.op === "append"
				? isPreset
					? `Saved "${next.name}" with ${bars} added — the shipped pattern stays as it was.`
					: `Added ${bars} to "${target.name}".`
				: isPreset
					? `Saved "${next.name}" with ${where} rewritten — the shipped pattern stays as it was.`
					: `Rewrote ${where} of "${target.name}".`,
		);
	}

	// The handoff listener is subscribed once and always calls the current
	// closure — the same ref idiom the strum page uses. An edit that lands
	// before the library has loaded waits in the ref for it.
	const applyEditRef = useRef(applyEdit);
	const pendingEditRef = useRef<Exclude<FingerpickAnyHandoff, FingerpickHandoff> | null>(null);
	const isLoadingRef = useRef(isLoading);
	useEffect(() => {
		applyEditRef.current = applyEdit;
		isLoadingRef.current = isLoading;
	});
	useEffect(() => {
		if (isLoading || !pendingEditRef.current) return;
		const edit = pendingEditRef.current;
		pendingEditRef.current = null;
		applyEditRef.current(edit);
	}, [isLoading]);

	useEffect(() => {
		// A share page is not where a handed-over tab lands: leave the stash for
		// the player's own page to take.
		if (isShared) return;
		function handleHandoff() {
			const next = takeHandoff("fingerpick");
			if (!next) return;
			if (next.kind !== "fingerpick") {
				if (isLoadingRef.current) pendingEditRef.current = next;
				else applyEditRef.current(next);
				return;
			}
			// Whatever id the stash carried, this is a new pattern of the player's:
			// a fresh id keeps it from overwriting one they already have.
			setHandoff({ ...next, pattern: { ...next.pattern, id: crypto.randomUUID() } });
		}
		handleHandoff();
		window.addEventListener(HANDOFF_EVENT, handleHandoff);
		return () => window.removeEventListener(HANDOFF_EVENT, handleHandoff);
	}, [isShared]);

	// Track the tab viewer's pixel width so the greedy layout can pack measures.
	useEffect(() => {
		const container = tabViewerRef.current;
		if (!container) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setContainerWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	function handleSelectPattern(p: FingerpickPattern) {
		// An explicit choice also ends the one-shot restore window: it must not be
		// overridden by the saved id once async pattern loading finishes.
		setPatternRestored(true);
		stop();
		setSelectedPattern(p);
		resetBpm(clampBpmToMeter(p.bpm, p.timeSignature));
		resetCursor();
		setSection(EMPTY_SELECTION);
		// Below lg the library is a slide-in over the tab: picking a pattern is
		// what it was opened for, so it goes away and shows the pick. At lg it is
		// static and this is a no-op.
		setShowLibrary(false);
		// Mirror the choice to the account so /home can surface it cross-device.
		if (!shared) saveLastPattern(createClient(), user, "fingerpick", p.id).catch(console.error);
	}

	// Saving an edit to the currently-selected pattern: the audio engine snapshots
	// the pattern into a ref at play() time, so a running loop would keep playing the
	// pre-edit notes. Reset the engine here so the change is heard without a manual
	// page refresh — restart from the top if it was playing, otherwise just clear any
	// stale scheduled/paused audio so the next play() rebuilds from the saved edit.
	function handleSaveCustom(pattern: FingerpickPattern): FingerpickPattern {
		const isCurrent = pattern.id === selectedPattern.id;
		const wasPlaying = isCurrent && isPlaying;
		const saved = saveCustomPattern(pattern);
		// A pattern just created is what the player wants to see: open it the way
		// a pick from the library would (tempo, cursor and section reset with it).
		if (saved.isNew) {
			handleSelectPattern(saved.pattern);
			return saved.pattern;
		}
		if (!isCurrent) return saved.pattern;
		stop();
		if (wasPlaying) {
			// Expand the just-saved pattern so playback picks up any repeat edits immediately
			// (the memoized `expanded` recomputes only after selectedPattern re-renders).
			const savedExpanded = expandFingerpickPattern(pattern);
			play(
				{ ...savedExpanded.pattern, bpm },
				{ loop: true, loopGapSeconds: loopGap, forceLetRing: true },
			);
		}
		resetCursor();
		return saved.pattern;
	}

	// Whether the pattern on screen is one of the player's own (and so saved on
	// edit) rather than a preset.
	const isCustomPattern = customPatterns.some((p) => p.id === selectedPattern.id);

	// Capo from the header badge. A custom pattern is saved with it (through the
	// same path the editor saves by, so playback and the library pick it up); a
	// preset cannot be, so the change lives on the selected pattern for this
	// session — the badge's tooltip says so.
	function handleCapoChange(fret: number) {
		const next = setPatternCapo(selectedPattern, fret);
		if (isCustomPattern) handleSaveCustom(next);
		else {
			stop();
			setSelectedPattern(next);
			resetCursor();
		}
	}

	function handlePlay() {
		const pending = takePendingSeek();
		const startOffset = pending ? startOffsetFor(pending) : 0;
		// forceLetRing: every note rings at the long letRingDecayTc τ (terminated only
		// by voice stealing) — a fuller, more natural fingerstyle sustain. This is a
		// playback mode, so the pattern data is left untouched; letRing changes only
		// the audio envelope, not timing/positions, so scheduleEventsRef stays valid.
		play(
			{ ...expanded.pattern, bpm },
			{ loop: true, loopGapSeconds: loopGap, forceLetRing: true },
			startOffset,
		);
	}

	function handleStop() {
		stop();
		clearPendingSeek();
		resetCursor(restartMeasure);
	}

	function handlePlayPause() {
		if (isPlaying) {
			pause();
		} else if (isPaused) {
			resume();
		} else {
			handlePlay();
		}
	}

	// Restore the last-viewed pattern once patterns finish loading (custom patterns
	// arrive async, so wait for isLoading to clear before resolving the saved id).
	// Routed through handleSelectPattern so BPM/cursor state sync like a normal pick.
	// Marking patternRestored true here also hides the loading placeholder.
	useEffect(() => {
		if (shared || patternRestored || isLoading) return;
		const savedId = readLastPatternId();
		const match =
			savedId && savedId !== selectedPattern.id
				? patterns.find((p) => p.id === savedId)
				: undefined;
		// One-shot sync from persisted (external) storage after async load — the
		// extra render is intentional and bounded to a single restore.
		/* eslint-disable react-hooks/set-state-in-effect */
		if (match) handleSelectPattern(match); // also flips patternRestored true
		else setPatternRestored(true);
		/* eslint-enable react-hooks/set-state-in-effect */
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, patternRestored]);

	// Persist the current pattern so a refresh reopens it. Gated on the restore
	// flag so the initial default doesn't clobber the saved id before restore runs.
	useEffect(() => {
		if (!patternRestored || shared) return;
		writeLastPatternId(selectedPattern.id);
	}, [selectedPattern.id, patternRestored, shared]);

	// Import: the snapshot as it is on screen (a capo set here comes along)
	// becomes a pattern of the viewer's own — through the same save a
	// hand-drawn one gets, to the browser for a guest and the account for a
	// signed-in player — and the player's page opens on it. The write is
	// awaited before leaving so the page finds the row when it loads.
	const [importing, setImporting] = useState(false);
	async function handleImport() {
		if (!shared || isLoading || importing) return;
		setImporting(true);
		try {
			const name = uniquePatternName(selectedPattern.name, patterns.map((p) => p.name));
			const pattern: FingerpickPattern = {
				...selectedPattern,
				id: crypto.randomUUID(),
				name,
				createdAt: new Date().toISOString(),
			};
			const supabase = createClient();
			await saveUserFingerpickPattern(supabase, user, pattern);
			await saveLastPattern(supabase, user, "fingerpick", pattern.id);
			stop();
			if (user) {
				toast(`Saved "${name}" to your patterns.`);
			} else {
				toast(`Saved "${name}" to this browser.`, {
					description: "Sign in to keep it on your account.",
					action: { label: "Sign in", onClick: () => router.push("/auth?redirect=/fingerpick") },
				});
			}
			router.push(`/fingerpick?pattern=${pattern.id}`);
		} catch (e) {
			console.error(e);
			toast.error("Couldn't save the pattern — try again.");
			setImporting(false);
		}
	}

	// Spacebar toggles play/pause, anywhere on the page — but not in a form field
	// and not behind an open dialog (see shouldRunPageShortcut).
	//
	// Held through a ref, and subscribed exactly once: the toggle reads the
	// pattern, the samples' load state and the tempo, and a dependency list that
	// misses one of them leaves the key acting on a state the page has already
	// left behind.
	const playPauseRef = useRef(handlePlayPause);
	useEffect(() => {
		playPauseRef.current = handlePlayPause;
	});
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!shouldRunPageShortcut(e)) return;
			if (e.key === "Escape") {
				leaveSectionModeRef.current();
				return;
			}
			if (e.code !== "Space") return;
			e.preventDefault();
			playPauseRef.current();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	// Everything the two control surfaces show, once.
	const controls: PlaybackControlProps = {
		transport: {
			isLoaded,
			isPlaying,
			isPaused,
			playOnce,
			setPlayOnce,
			loopGap,
			onLoopGapChange: handleLoopGapChange,
			onPlayPause: handlePlayPause,
			onStop: handleStop,
		},
		tempo: {
			bpm,
			timeSignature: selectedPattern.timeSignature,
			defaultBpm: patternBpm,
			onBpmChange: handleBpmChange,
			onSliderChange: handleSliderChange,
			onSliderPointerDown: handleSliderPointerDown,
			onSliderPointerUp: handleSliderPointerUp,
			onTapTempo: handleTapTempo,
		},
		metronome: {
			enabled: metronomeEnabled,
			setEnabled: setMetronomeEnabled,
			gain: metronomeGain,
			setGain: setMetronomeGain,
			subdivision: metronomeSubdivision,
			setSubdivision: setMetronomeSubdivision,
			timeSignature: selectedPattern.timeSignature,
		},
		noteSound: { gain: noteGain, setGain: setNoteGain },
	};

	return (
		<>
			<div className="md:h-[calc(100vh-3.5rem)] flex flex-col md:flex-row md:overflow-hidden bg-workspace">
				{/* Left sidebar — lg: static; below lg: slide-in overlay. A shared
				    snapshot has no library: the sidebar says what this is and
				    offers the import, and below lg that lives in a strip over the
				    tab instead of behind a toggle. */}
				{shared ? (
					<div className="hidden lg:flex w-72 h-full border-r border-line bg-sidebar flex-col shrink-0">
						<SharedPatternPanel
							variant="sidebar"
							pattern={selectedPattern}
							user={user}
							loading={loading}
							importing={importing}
							onImport={handleImport}
						/>
					</div>
				) : (
					<div
						className={`fixed inset-y-0 left-0 z-40 w-72 h-full border-r border-line bg-sidebar flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:relative lg:inset-auto lg:z-auto lg:translate-x-0 ${
							showLibrary ? "translate-x-0" : "-translate-x-full"
						}`}
					>
						<FingerpickPatternLibrary
							patterns={patterns}
							customPatterns={customPatterns}
							selectedPattern={selectedPattern}
							setSelectedPattern={handleSelectPattern}
							favouriteIds={favouriteIds}
							toggleFavourite={toggleFavourite}
							onSaveCustom={handleSaveCustom}
							onDeleteCustom={deleteCustomPattern}
							onClose={() => setShowLibrary(false)}
							user={user}
							isLoading={isLoading}
						/>
					</div>
				)}

				{/* Backdrop — tap outside to close library on mobile/tablet */}
				{showLibrary && (
					<div
						className="fixed inset-0 z-30 bg-(--backdrop) lg:hidden"
						onClick={() => setShowLibrary(false)}
					/>
				)}

				{/* Centre — TAB viewer
			    md: fixed-height column → inner wrapper fills it (flex-1 + min-h-0)
			    → title is shrink-0 → measures scroll vertically inside min-h-0 container.
			    Mobile: no height constraint, page scroll handles overflow naturally. */}
				<div className="md:flex-1 flex flex-col px-4 md:px-8 py-6 md:py-8 md:overflow-hidden">
					<div className="relative w-full max-w-4xl mx-auto flex flex-col min-h-0 md:flex-1">
						{/* Loading overlay while patterns are fetched and the last-viewed one is
						    restored — kept as an overlay (not a conditional) so the tab viewer
						    stays mounted and its ResizeObserver can measure width underneath. */}
						{!patternRestored && (
							<div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-workspace">
								<Loader2 className="h-6 w-6 animate-spin text-denim" />
								<span className="text-xs text-tab-meta uppercase tracking-wider">
									Loading pattern…
								</span>
							</div>
						)}
						{shared && (
							<div className="mb-4 shrink-0 lg:hidden">
								<SharedPatternPanel
									variant="strip"
									pattern={selectedPattern}
									user={user}
									loading={loading}
									importing={importing}
									onImport={handleImport}
								/>
							</div>
						)}
						{/* Fixed-height header: every row is as tall as its tallest possible
						    occupant (the fader), so controls appearing and disappearing —
						    the speed fader, the Size fader, the Off-shape switch — never move
						    the tab beneath. */}
						<div className="mb-4 shrink-0">
							<div className="flex h-9 items-center gap-3">
								<h1 className="truncate text-lg font-semibold text-tab-title">
									{selectedPattern.name}
								</h1>
								{/* Auto-scroll: creep the tab upward at a set speed. The speed
								    fader is only there while it is running. */}
								<button
									type="button"
									onClick={() => setAutoScroll((on) => !on)}
									disabled={!tabOverflows}
									aria-pressed={autoScrollActive}
									aria-label={autoScrollActive ? "Stop auto-scroll" : "Start auto-scroll"}
									title={
										!tabOverflows
											? "The whole tab is in view — nothing to scroll"
											: autoScrollActive
												? "Stop auto-scroll"
												: "Auto-scroll the tab"
									}
									className={`flex h-7 w-7 items-center justify-center border transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
										autoScrollActive
											? "border-denim bg-denim text-on-denim"
											: "border-line-strong text-ink-dim hover:border-denim hover:text-denim disabled:hover:border-line-strong disabled:hover:text-ink-dim"
									}`}
								>
									<ChevronsDown size={14} className={autoScrollActive ? "animate-bounce" : ""} />
								</button>
								{/* Section mode: pick the first and last measure to practise. The
								    hint beside the button says which click comes next. */}
								<button
									type="button"
									onClick={toggleSectionMode}
									aria-pressed={sectionMode}
									aria-label={sectionMode ? "Leave section mode" : "Select a section"}
									title={sectionMode ? "Leave section mode (Esc)" : "Select a section to practise"}
									className={`flex h-7 w-7 shrink-0 items-center justify-center border transition-colors ${
										sectionMode
											? "border-denim bg-denim text-on-denim"
											: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
									}`}
								>
									<Brackets size={14} />
								</button>
								{sectionMode && (
									<span className="fp-reveal min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
										{sectionHint(section)}
									</span>
								)}
								{autoScrollActive && (
									<div className="fp-reveal flex items-center gap-2">
										<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
											Speed
										</span>
										<div className="w-24 sm:w-28">
											<Fader
												min={SCROLL_SPEED_MIN}
												max={SCROLL_SPEED_MAX}
												step={2}
												value={scrollSpeed}
												onValue={setScrollSpeed}
												ticks={[
													0,
													((SCROLL_SPEED_DEFAULT - SCROLL_SPEED_MIN) /
														(SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)) *
														100,
													100,
												]}
												tickValues={[SCROLL_SPEED_MIN, SCROLL_SPEED_DEFAULT, SCROLL_SPEED_MAX]}
												scale={[]}
												ariaLabel="Auto-scroll speed"
											/>
										</div>
									</div>
								)}
							</div>
							{/* Meta line, with the chord-line controls beside it — or under it
							    on a phone, where the row has no room for both. */}
							<div className="flex flex-col sm:h-9 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
							<div className="flex h-6 items-center gap-2 text-xs text-tab-meta uppercase tracking-wider sm:h-9">
								<span>
									{beatUnitGlyph(selectedPattern.timeSignature)} = {bpm} &middot;{" "}
									{selectedPattern.timeSignature[0]}/{selectedPattern.timeSignature[1]}
								</span>
								{/* The TAB is written behind the capo; this says how much higher
								    it sounds, and is where to change it — a select styled as the
								    badge. "No capo" is said too, so a player about to play along
								    never has to wonder whether the badge is just missing. A preset
								    keeps the change for this session only; a custom pattern saves it. */}
								<select
									value={patternCapo(selectedPattern)}
									onChange={(e) => handleCapoChange(Number(e.target.value))}
									aria-label="Capo fret"
									title={
										isCustomPattern
											? "Capo — the TAB is written behind it; playback sounds this much higher"
											: "Capo — the TAB is written behind it; a preset keeps this for the session only"
									}
									className={`cursor-pointer appearance-none border px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal focus:outline-none focus-visible:border-denim ${
										patternCapo(selectedPattern) > 0
											? "border-denim-border bg-denim-tint text-denim"
											: "border-line bg-transparent text-ink-faint hover:text-ink-dim"
									}`}
								>
									<option value={0}>No capo</option>
									{Array.from({ length: STRUM_CAPO_MAX }, (_, i) => i + 1).map((fret) => (
										<option key={fret} value={fret}>
											Capo {fret}
										</option>
									))}
								</select>
							</div>
							{/* Chord line view, at the row's other end — only a question for a
							    pattern that names chords. The size slider appears with the
							    shapes it sizes. */}
							<div className="flex h-9 shrink-0 flex-row-reverse items-center gap-3 self-start sm:flex-row sm:self-auto">
								{hasChords && chordView === "diagram" && (
										<div className="fp-reveal fp-reveal-2 flex flex-row-reverse items-center gap-3 sm:flex-row">
											<div className="flex items-center gap-2">
											<Rocker
												checked={offShapeOn}
												onChange={setOffShapeOn}
												ariaLabel="Colour fret numbers outside the chord shape"
											/>
											<span
												className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim"
												title="Colour the fret numbers that are not part of the chord shape in effect"
											>
												Off-shape
											</span>
											</div>
											<span aria-hidden className="h-4 w-px bg-line-strong" />
										</div>
									)}
								{hasChords && chordView === "diagram" && (
										<div className="fp-reveal flex flex-row-reverse items-center gap-3 sm:flex-row">
											<div className="flex items-center gap-2">
											<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
												Size
											</span>
											{/* The same fader as the transport's, so the header reads as
											    one set of controls. No scale row: the range is a feel, not
											    a number anyone needs to read off. */}
											<div className="w-20 sm:w-28">
												<Fader
													min={CHORD_SHAPE_WIDTH_MIN}
													max={CHORD_SHAPE_WIDTH_MAX}
													step={4}
													value={chordShapeWidth}
													onValue={setChordShapeWidth}
													ticks={[
														0,
														((CHORD_SHAPE_WIDTH_DEFAULT - CHORD_SHAPE_WIDTH_MIN) /
															(CHORD_SHAPE_WIDTH_MAX - CHORD_SHAPE_WIDTH_MIN)) *
															100,
														100,
													]}
													tickValues={[
														CHORD_SHAPE_WIDTH_MIN,
														CHORD_SHAPE_WIDTH_DEFAULT,
														CHORD_SHAPE_WIDTH_MAX,
													]}
													scale={[]}
													ariaLabel="Chord shape size"
												/>
											</div>
											</div>
											<span aria-hidden className="h-4 w-px bg-line-strong" />
										</div>
									)}
								{hasChords && (
									<ChordViewToggle value={chordView} onChange={setChordView} />
								)}
							</div>
							</div>
						</div>

						{/* min-h-0 lets Flexbox shrink this child so overflow-y-auto scrolls.
					    Each TabStaveRow is a full-width row of measures rendered into one
					    VexFlow context; the row count and width are driven by the viewport.
					    position:relative anchors the cursor overlay div. */}
						<div
							ref={tabViewerRef}
							data-tab-viewer
							className="relative min-h-0 min-w-0 overflow-hidden overflow-y-auto cursor-pointer"
							onClick={handleTabClick}
						>
							{/* Section selection — one band per row across the chosen measures,
							    under the playing highlight and the playhead; the section's first
							    and last measure carry a denim edge. */}
							{sectionMode &&
								(() => {
									const range = highlightedRange(section);
									if (!range) return null;
									return sectionBands(geometry, range).map((band) => (
										<div
											key={band.rowIndex}
											aria-hidden="true"
											data-section-row={band.rowIndex}
											className="absolute z-10 pointer-events-none"
											style={{
												left: band.left,
												top: band.top,
												width: band.width,
												height: band.height,
												backgroundColor: "var(--denim-tint)",
												borderLeft: band.startsSection ? "1px solid var(--denim)" : undefined,
												borderRight: band.endsSection ? "1px solid var(--denim)" : undefined,
											}}
										/>
									));
								})()}
							{/* Measure highlight — updated only on measure transitions. Stacked
							    ABOVE the rows (z-10): it is translucent, so the look is the same,
							    but the opaque patches VexFlow paints behind fret numbers no
							    longer show through it as pale squares. */}
							<div
								ref={measureHighlightRef}
								aria-hidden="true"
								className="absolute z-10 pointer-events-none"
								style={{
									display: "none",
									backgroundColor: "var(--measure-hl)",
								}}
							/>
							{/* Playhead line — stacked above the rows (z-10, after the highlight
						    in DOM order so it paints over it), so it crosses the fret numbers
						    rather than being cut by them; translateX updated every RAF frame. */}
							<div
								ref={cursorRef}
								aria-hidden="true"
								className="absolute z-10 pointer-events-none"
								style={{
									display: "none",
									width: 2,
									left: 0,
									backgroundColor: "var(--denim-accent)",
									boxShadow: "var(--glow-playhead)",
								}}
							>
								{/* Downward-pointing triangle cap centred on the 2px line. */}
								<span
									aria-hidden="true"
									style={{
										position: "absolute",
										top: -6,
										left: -4,
										width: 0,
										height: 0,
										borderLeft: "5px solid transparent",
										borderRight: "5px solid transparent",
										borderTop: "6px solid var(--denim-accent)",
									}}
								/>
							</div>
							{/* pt-2 leaves headroom so the playhead's triangle cap (top: -6px
						    relative to the cursor line, which is positioned at the row's stave
						    top) isn't clipped by the scroll container's overflow at row 0. */}
							<div ref={rowsContainerRef} className="flex flex-col pt-2 pb-20 md:pb-0">
								{rows.map((row, rowIdx) => (
									<div
										key={row.measures[0].id}
										ref={(el) => {
											rowRefs.current[rowIdx] = el;
										}}
									>
										<TabStaveRow
											measures={row.measures}
											timeSignature={selectedPattern.timeSignature}
											startMeasureNumber={row.startMeasureNumber}
											startMeasureIndex={row.startMeasureNumber - 1}
											measureWidths={row.widths}
											chordDiagram={showChordDiagrams ? chordDiagram : undefined}
											chordDiagramSize={chordShapeSize}
											offShapeStrings={showOffShape ? offShapeAt : undefined}
										/>
									</div>
								))}
							</div>
						</div>

						{/* Mobile library toggle */}
						{!shared && !showLibrary && (
							<button
								onClick={() => setShowLibrary(true)}
								className={`absolute top-0 right-0 z-30 lg:hidden flex items-center gap-2 text-white text-sm font-semibold px-2 py-2 transition-all duration-300 active:scale-95 ${
									controlsVisible
										? "opacity-100 pointer-events-auto"
										: "opacity-0 pointer-events-none"
								}`}
								style={{ backgroundColor: "var(--denim)" }}
							>
								<SquareMenu />
							</button>
						)}
					</div>
				</div>

				<FingerpickDesktopPanel {...controls} />
			</div>

			<FingerpickMobileDrawer {...controls} controlsVisible={controlsVisible} />

			{/* The library owns the editor for its own patterns; a handed-over tab
			    gets its own instance so it can open without the library on screen. */}
			<FingerpickEditModal
				key={handoff?.pattern.id ?? "none"}
				open={handoff !== null}
				pattern={handoff?.pattern ?? null}
				takenNames={patterns.map((p) => p.name)}
				notice={{
					title: "Check this pattern",
					text: "Made from what you asked for — check the frets and the rhythm, then save it as your own.",
					warnings: handoff?.warnings.map((w) => w.message),
				}}
				onClose={() => setHandoff(null)}
				onSave={handleSaveCustom}
			/>
		</>
	);
}
