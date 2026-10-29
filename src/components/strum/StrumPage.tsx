"use client";

import "./strum.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PanelRightOpen } from "lucide-react";
import { Sheet, useSheetSide } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import SharedPatternPanel from "@/components/SharedPatternPanel";
import PlayBar from "@/components/playback/PlayBar";
import ShareStrumDialog from "@/components/strum/ShareStrumDialog";
import PatternComposer from "@/components/strum/composer/PatternComposer";
import PatternLibrary from "@/components/strum/library/PatternLibrary";
import PatternHeader from "@/components/strum/stage/PatternHeader";
import NowCard from "@/components/strum/stage/NowCard";
import RhythmGrid from "@/components/strum/stage/RhythmGrid";
import BeatPulse from "@/components/strum/stage/BeatPulse";
import ProgressionPanel from "@/components/strum/progressions/ProgressionPanel";
import PendingChords from "@/components/strum/progressions/PendingChords";
import { useProgressionDraft } from "@/components/strum/useProgressionDraft";
import { useStrumPatterns } from "@/components/strum/useStrumPatterns";
import { useChordProgressions } from "@/components/strum/useChordProgressions";
import { useBarChordDiagrams } from "@/components/strum/useBarChordDiagrams";
import { useStrumSession } from "@/components/strum/useStrumSession";
import { useRhythmDraft } from "@/components/strum/useRhythmDraft";
import { useStrumPlayback } from "@/components/strum/useStrumPlayback";
import { useStrumShare } from "@/components/strum/useStrumShare";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useUser } from "@/hooks/useUser";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import { patternBpm } from "@/lib/strumBars";
import { beatUnitGlyph, meterLabel } from "@/lib/strumMeter";
import { barLabel, progressionCapo } from "@/lib/strumProgressions";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { withUserVoicings } from "@/lib/userChordVoicings";
import type { SharedStrum } from "@/lib/sharedItems";
import { PLAYER_DOCK_KEY, readDock, type PlayerDock } from "@/lib/playerDock";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { showPress } from "@/components/ui/press";

/** Per-viewer: whether the library beside the stage is folded away. */
const LIBRARY_FOLDED_KEY = "strumLibraryFolded";

/**
 * The Strum page. On /strum it opens the player's library; given `shared`, it opens
 * that snapshot instead (/p/[id]): the library and every save path are gone, the
 * snapshot is what plays, and the one way to change it is to import a copy.
 */
export default function StrumPage({ shared }: { shared?: SharedStrum }) {
	const isShared = shared !== undefined;
	const { user, loading } = useUser();
	const library = useStrumPatterns(user, loading);
	const sequences = useChordProgressions(user, loading);
	// Held here because sound, diagrams and the shape editor need the same list.
	const { voicings: userVoicings, saveVoicing } = useUserChordVoicings(user, loading);
	const lookupVoicings = useMemo(() => withUserVoicings(loadVoicings, userVoicings), [userVoicings]);
	const voicingsKey = useMemo(
		() => userVoicings.map((v) => `${v.id}:${v.start_fret}:${v.frets}`).join("|"),
		[userVoicings],
	);

	// The session stops the transport before changing what plays; the engine that
	// owns `stop` is built from the session's choices, so it is reached through a ref.
	const stopRef = useRef<() => void>(() => {});
	const stop = useCallback(() => stopRef.current(), []);
	const session = useStrumSession({ shared, user, library, sequences, stop });
	const { selectedPattern, meter } = session;
	// On a share page the grid is read-only, so the draft is only ever the snapshot's rhythm.
	const draft = useRhythmDraft(selectedPattern);
	const rhythm = draft.rhythm;
	// What plays is the open progression with its unsaved edits: a chord changed is a chord heard.
	const progressionDraft = useProgressionDraft(session.openProgression);
	const openProgression = progressionDraft.progression;
	// Chords from the Chords board wait for a pattern; once one is picked they play on it, unsaved.
	const pending = session.pending;
	const picking = pending !== null;
	const canPlay = selectedPattern !== null && (!picking || pending.chosen);
	const playing = picking ? session.pendingProgression : openProgression;
	const playback = useStrumPlayback({
		rhythm,
		progression: playing,
		meter,
		bpm: session.bpm,
		lookupVoicings,
		voicingsKey,
	});
	useEffect(() => {
		stopRef.current = playback.stop;
	});

	const shareState = useStrumShare({
		user,
		pattern: selectedPattern,
		progressions: session.patternProgressions,
		openProgression: session.openProgression,
		customPatterns: library.customPatterns,
		patternsLoading: library.patternsLoading,
		shared,
		stop,
	});

	function togglePlay() {
		navigator.vibrate?.(10);
		if (playback.isPlaying) playback.stop();
		else if (canPlay) playback.start();
	}
	// Space is the transport anywhere on the page (see shouldRunPageShortcut).
	// Subscribed once; the ref always holds the current toggle.
	const togglePlayRef = useRef(togglePlay);
	useEffect(() => {
		togglePlayRef.current = togglePlay;
	});
	// The play key sinks under space the way it sinks under a click: down on the
	// key going down, back up when it is let go.
	const pickRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		let release: (() => void) | null = null;
		function handleKeyDown(e: KeyboardEvent) {
			if (e.code !== "Space" || !shouldRunPageShortcut(e)) return;
			e.preventDefault();
			// A held key repeats; one press is one toggle.
			if (e.repeat) return;
			release?.();
			release = pickRef.current ? showPress(pickRef.current) : null;
			togglePlayRef.current();
		}
		function handleKeyUp(e: KeyboardEvent) {
			if (e.code !== "Space") return;
			release?.();
			release = null;
		}
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			release?.();
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, []);

	const [folded, setFolded] = useState(false);
	useEffect(() => {
		try {
			if (localStorage.getItem(LIBRARY_FOLDED_KEY) === "1") queueMicrotask(() => setFolded(true));
		} catch {
			// unreadable storage: the library starts open
		}
	}, []);
	function fold(next: boolean) {
		setFolded(next);
		try {
			localStorage.setItem(LIBRARY_FOLDED_KEY, next ? "1" : "0");
		} catch {
			// remembered for this visit only
		}
	}
	const [libraryOpen, setLibraryOpen] = useState(false);
	// Chords arriving for a pattern open the list: beside the stage (unfolded for
	// this visit), or in its sheet where there is no room beside it.
	const asideRef = useRef<HTMLElement>(null);
	useEffect(() => {
		if (!picking) return;
		queueMicrotask(() => {
			setFolded(false);
			if (asideRef.current && getComputedStyle(asideRef.current).display === "none") setLibraryOpen(true);
		});
	}, [picking]);
	// Where the player floats. A phone has no room beside the stage, so there it
	// stays at the bottom whatever was chosen on a wider screen.
	const [dockChoice, setDockChoice] = useState<PlayerDock>("bottom");
	useEffect(() => {
		try {
			const saved = readDock(localStorage.getItem(PLAYER_DOCK_KEY));
			queueMicrotask(() => setDockChoice(saved));
		} catch {
			// unreadable storage: the bottom
		}
	}, []);
	const canDock = useSheetSide(true) === "right";
	const dock: PlayerDock = canDock ? dockChoice : "bottom";
	function moveDock(next: PlayerDock) {
		setDockChoice(next);
		try {
			localStorage.setItem(PLAYER_DOCK_KEY, next);
		} catch {
			// remembered for this visit only
		}
	}
	const [composer, setComposer] = useState<"new" | "edit" | null>(null);
	/** The composer has a play key of its own; the page's falls silent while it is open. */
	function openComposer(mode: "new" | "edit") {
		stop();
		setLibraryOpen(false);
		setComposer(mode);
	}

	const progressionBars = playing?.bars ?? [];
	const diagrams = useBarChordDiagrams(progressionBars, progressionBars.length > 0, userVoicings);
	const chordBar = playback.chordBar;
	const nowBar = chordBar !== null ? progressionBars[chordBar] : undefined;
	const nextBar = chordBar !== null ? progressionBars[(chordBar + 1) % progressionBars.length] : undefined;

	const isPreset = selectedPattern !== null && PRESET_STRUM_PATTERNS.some((p) => p.id === selectedPattern.id);
	const meta = selectedPattern
		? [
				isShared ? "Shared" : session.owned ? "My pattern" : isPreset ? "Preset" : "Pattern",
				meterLabel(meter),
				`${rhythm.length} bar${rhythm.length === 1 ? "" : "s"}`,
			].join(" · ")
		: "";
	const sharedMeta =
		shared && selectedPattern
			? [
					`${beatUnitGlyph(meter)} = ${openProgression?.bpm ?? patternBpm(selectedPattern)}`,
					meterLabel(meter),
					...(shared.progressions.length > 1
						? [`${shared.progressions.length} progressions`]
						: openProgression
							? [
									`${openProgression.bars.length} bar${openProgression.bars.length === 1 ? "" : "s"}`,
									...(progressionCapo(openProgression) > 0 ? [`Capo ${progressionCapo(openProgression)}`] : []),
								]
							: []),
				].join(" · ")
			: "";

	const libraryProps = {
		customPatterns: library.customPatterns,
		loading: library.patternsLoading,
		// Until the waiting chords have a pattern, the one open underneath is not an answer.
		selectedId: picking && !pending.chosen ? null : selectedPattern?.id ?? null,
		favouriteIds: library.favouriteIds,
		onToggleFavourite: library.handleToggleFavourite,
		onNew: () => openComposer("new"),
	};

	return (
		<div className="st-page" data-m="strum">
			<div className="st-shell" data-lib={folded && !isShared ? "closed" : "open"}>
				<div className="st-stage-wrap">
					{/* Outside the scrolling stage, so it stays put however far the page scrolls. */}
					{!isShared && folded && (
						<button
							type="button"
							className="st-icon st-lib-fab"
							onClick={() => fold(false)}
							aria-label="Show the pattern list"
							title="Show the pattern list"
							aria-expanded={false}
						>
							<PanelRightOpen aria-hidden />
						</button>
					)}
				<main className="st-stage">
					{!session.patternRestored || !selectedPattern ? (
						<div className="st-stage-in" aria-busy="true">
							<Skeleton className="h-13 w-60" />
							<Skeleton className="h-60 w-full rounded-gp-xl" />
						</div>
					) : pending ? (
						<div className="st-stage-in st-rise">
							<div style={{ "--i": 0 } as CSSProperties}>
								<PendingChords
									bars={pending.bars}
									capo={pending.capo}
									pattern={pending.chosen ? selectedPattern : null}
									meta={meta}
									rhythm={rhythm}
									meter={meter}
									position={playback.rhythmPosition}
									onOpenLibrary={() => setLibraryOpen(true)}
									onNewPattern={() => openComposer("new")}
									onConfirm={session.confirmPending}
									onCancel={session.cancelPending}
								/>
							</div>
						</div>
					) : (
						<div className="st-stage-in st-rise">
							{shared && (
								<div className="st-shared-strip" style={{ "--i": 0 } as CSSProperties}>
									<SharedPatternPanel
										variant="strip"
										name={selectedPattern.name}
										meta={sharedMeta}
										user={user}
										loading={loading}
										importing={shareState.importing}
										onImport={shareState.importShared}
									/>
								</div>
							)}
							<div style={{ "--i": 0 } as CSSProperties}>
								<PatternHeader
									name={selectedPattern.name}
									meta={meta}
									dirty={draft.dirty}
									onRevert={draft.revert}
									onSave={session.owned ? () => session.saveRhythm(draft.rhythm) : undefined}
									onSaveAsNew={() => session.saveRhythmAsNew(draft.rhythm)}
									owned={session.owned}
									onEdit={isShared ? undefined : () => openComposer("edit")}
									onDelete={isShared ? undefined : () => session.removePattern(selectedPattern.id)}
									onShare={isShared ? undefined : shareState.share}
									sharing={shareState.sharing}
									onOpenLibrary={isShared ? undefined : () => setLibraryOpen(true)}
								/>
							</div>
							<div style={{ "--i": 1 } as CSSProperties}>
								<NowCard
									now={nowBar ? { label: barLabel(nowBar), diagram: chordBar !== null ? diagrams[chordBar] ?? null : null } : null}
									next={nextBar ? barLabel(nextBar) : null}
								>
									<BeatPulse
										beats={rhythm[playback.rhythmPosition?.bar ?? 0]?.length ?? 0}
										ticksPerBeat={playback.ticksPerBeat}
										active={playback.pulse}
									/>
									<RhythmGrid
										rhythm={rhythm}
										meter={meter}
										position={playback.rhythmPosition}
										onToggle={isShared ? undefined : draft.toggle}
									/>
								</NowCard>
							</div>
							<div className="st-prog-slot" style={{ "--i": 2 } as CSSProperties}>
								<ProgressionPanel
									patternName={selectedPattern.name}
									progressions={session.patternProgressions}
									draft={progressionDraft}
									loading={!session.progressionsReady}
									readOnly={isShared}
									playingBar={playback.isPlaying ? playback.chordBar : null}
									diagrams={diagrams}
									userVoicings={userVoicings}
									onSaveVoicing={saveVoicing}
									onOpen={session.openProgressionById}
									onCreate={(tokens, name) => session.addProgression(tokens, name)}
									onSave={session.saveProgression}
									onSaveAsNew={(progression) => {
										progressionDraft.revert();
										session.saveProgressionAsNew(progression);
									}}
									onDelete={session.removeProgression}
								/>
							</div>
						</div>
					)}
				</main>
				<PlayBar
					module="strum"
					pickRef={pickRef}
					status={{
						bar: playback.isPlaying ? playback.currBar + 1 : 1,
						bars: playback.playBars.length,
						now: nowBar ? barLabel(nowBar) : null,
						next: nextBar ? barLabel(nextBar) : null,
					}}
					playing={playback.isPlaying}
					preparing={playback.isPreparing}
					canPlay={canPlay}
					onTogglePlay={togglePlay}
					tempo={{
						bpm: session.bpm,
						onBpm: session.setBpm,
						meter,
						defaultBpm: session.defaultBpm,
						onSaveDefault: session.canSaveTempo ? session.saveDefaultTempo : undefined,
					}}
					tickLevel={playback.tickLevel}
					onTickLevel={playback.setTickLevel}
					loop={!playback.playOnce}
					onLoop={(loop) => playback.setPlayOnce(!loop)}
					loopGap={playback.loopGap}
					onLoopGap={playback.setLoopGap}
					dock={dock}
					onDock={moveDock}
					canDock={canDock}
					strum={{
						enabled: playback.strumEnabled,
						onEnabledChange: playback.setStrumEnabled,
						gain: playback.strumGain,
						onGainChange: playback.setStrumGain,
						max: 2,
					}}
					click={{
						enabled: playback.metronomeEnabled,
						onEnabledChange: playback.setMetronomeEnabled,
						gain: playback.metronomeGain,
						onGainChange: playback.setMetronomeGain,
						max: 1,
					}}
				/>
				</div>

				<aside ref={asideRef} className="st-lib" aria-label={isShared ? "Shared pattern" : "Pattern library"}>
					{shared && selectedPattern ? (
						<SharedPatternPanel
							variant="sidebar"
							name={selectedPattern.name}
							meta={sharedMeta}
							user={user}
							loading={loading}
							importing={shareState.importing}
							onImport={shareState.importShared}
						/>
					) : (
						!folded && (
							<PatternLibrary
								{...libraryProps}
								variant="aside"
								onSelect={picking ? session.choosePendingPattern : session.selectPattern}
								onFold={() => fold(true)}
							/>
						)
					)}
				</aside>

			</div>

			{!isShared && (
				<Sheet open={libraryOpen} onOpenChange={setLibraryOpen} title={picking ? "Choose a pattern" : "Patterns"}>
					<div className="flex min-h-0 flex-col gap-3" data-m="strum">
						<PatternLibrary
							{...libraryProps}
							variant="sheet"
							onSelect={(pattern) => {
								if (picking) session.choosePendingPattern(pattern);
								else session.selectPattern(pattern);
								setLibraryOpen(false);
							}}
						/>
					</div>
				</Sheet>
			)}
			{!isShared && composer !== null && (
				<PatternComposer
					editing={composer === "edit" && selectedPattern ? selectedPattern : undefined}
					existingPatterns={session.allPatterns}
					user={user}
					onClose={() => setComposer(null)}
					onSave={(pattern) => {
						if (composer === "edit") session.savePattern(pattern);
						else if (picking) session.createPendingPattern(pattern);
						else session.createPattern(pattern);
					}}
				/>
			)}
			{shareState.dialogOpen && selectedPattern && (
				<ShareStrumDialog
					open
					onClose={shareState.closeDialog}
					patternName={selectedPattern.name}
					progressions={session.patternProgressions}
					openId={openProgression?.id ?? null}
					onShare={(chosen) => void shareState.shareWith(chosen)}
				/>
			)}
		</div>
	);
}
