"use client";

import "@/components/library/library.css";
import { FLAG_CODEC, useStoredState } from "@/components/useStoredState";
import "./strum.css";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PanelRightOpen } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareNote } from "@/components/share/SharedSnapshot";
import PlayBar from "@/components/playback/PlayBar";
import ShareStrumDialog from "@/components/strum/ShareStrumDialog";
import PatternComposer from "@/components/strum/composer/PatternComposer";
import PatternLibrary from "@/components/strum/library/PatternLibrary";
import PatternHeader from "@/components/strum/stage/PatternHeader";
import NowCard from "@/components/strum/stage/NowCard";
import RhythmGrid from "@/components/strum/stage/RhythmGrid";
import BeatPulse from "@/components/strum/stage/BeatPulse";
import ProgressionPanel from "@/components/strum/progressions/ProgressionPanel";
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
import { meterLabel } from "@/lib/strumMeter";
import { barLabel } from "@/lib/strumProgressions";
import { loadVoicings } from "@/lib/chordVoicingCache";
import { withUserVoicings } from "@/lib/userChordVoicings";
import type { SharedStrum } from "@/lib/sharedItems";
import { usePlayerDock } from "@/components/playback/usePlayerDock";
import { usePlayKey } from "@/components/playback/usePlayKey";

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
	const playback = useStrumPlayback({
		rhythm,
		progression: openProgression,
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
		else if (selectedPattern) playback.start();
	}
	const pickRef = useRef<HTMLButtonElement>(null);
	usePlayKey(pickRef, togglePlay);

	const [folded, fold] = useStoredState(LIBRARY_FOLDED_KEY, false, FLAG_CODEC);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const { dock, canDock, moveDock } = usePlayerDock();
	const [composer, setComposer] = useState<"new" | "edit" | null>(null);
	/** The composer has a play key of its own; the page's falls silent while it is open. */
	function openComposer(mode: "new" | "edit") {
		stop();
		setLibraryOpen(false);
		setComposer(mode);
	}

	const progressionBars = openProgression?.bars ?? [];
	const diagrams = useBarChordDiagrams(progressionBars, progressionBars.length > 0, userVoicings);
	const chordBar = playback.chordBar;
	const nowBar = chordBar !== null ? progressionBars[chordBar] : undefined;
	const nextBar = chordBar !== null ? progressionBars[(chordBar + 1) % progressionBars.length] : undefined;

	const isPreset = selectedPattern !== null && PRESET_STRUM_PATTERNS.some((p) => p.id === selectedPattern.id);
	const meta = selectedPattern
		? [
				// on a share page the badge says whose it is
				...(isShared ? [] : [session.owned ? "My pattern" : isPreset ? "Preset" : "Pattern"]),
				meterLabel(meter),
				`${rhythm.length} bar${rhythm.length === 1 ? "" : "s"}`,
			].join(" · ")
		: "";

	const libraryProps = {
		customPatterns: library.customPatterns,
		loading: library.patternsLoading,
		selectedId: selectedPattern?.id ?? null,
		favouriteIds: library.favouriteIds,
		onToggleFavourite: library.handleToggleFavourite,
		onNew: () => openComposer("new"),
	};

	return (
		<div className="st-page" data-m="strum">
			<div className="lib-shell" data-lib={isShared ? "none" : folded ? "closed" : "open"}>
				<div className="st-stage-wrap pb-area">
					{/* Outside the scrolling stage, so it stays put however far the page scrolls. */}
					{!isShared && folded && (
						<button
							type="button"
							className="st-icon lib-fab"
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
					) : (
						<div className="st-stage-in st-rise">
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
									shared={
										isShared
											? {
													onImport: shareState.importShared,
													importing: shareState.importing,
													disabled: loading || library.patternsLoading,
												}
											: undefined
									}
								/>
								{isShared && <ShareNote guest={!loading && !user} />}
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
					canPlay={selectedPattern !== null}
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
					soundKind="strum"
					sound={{
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

				{!isShared && (
					<aside className="lib-aside" aria-label="Pattern library">
						{!folded && (
							<PatternLibrary {...libraryProps} variant="aside" onSelect={session.selectPattern} onFold={() => fold(true)} />
						)}
					</aside>
				)}

			</div>

			{!isShared && (
				<Sheet open={libraryOpen} onOpenChange={setLibraryOpen} title="Patterns">
					<div className="flex min-h-0 flex-col gap-3" data-m="strum">
						<PatternLibrary
							{...libraryProps}
							variant="sheet"
							onSelect={(pattern) => {
								session.selectPattern(pattern);
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
