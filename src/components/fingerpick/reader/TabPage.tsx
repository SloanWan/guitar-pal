"use client";

import "@/components/library/library.css";
import "./tab.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import SharedPatternPanel from "@/components/SharedPatternPanel";
import PlayBar from "@/components/playback/PlayBar";
import { usePlayerDock } from "@/components/playback/usePlayerDock";
import { usePlayKey } from "@/components/playback/usePlayKey";
import FingerpickEditModal from "@/components/fingerpick/FingerpickEditModal";
import TextTabDialog from "@/components/textTab/TextTabDialog";
import { useFingerpickPrefs } from "@/components/fingerpick/useFingerpickPrefs";
import { useMeasureGeometry } from "@/components/fingerpick/useMeasureGeometry";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import {
	EMPTY_SELECTION,
	highlightedRange,
	pickMeasure,
	sectionBands,
	sectionHint,
	type SectionSelection,
} from "@/components/fingerpick/sectionSelection";
import { useAutoScroll } from "@/components/useAutoScroll";
import { useElementWidth } from "@/components/useElementWidth";
import { FLAG_CODEC, useStoredState } from "@/components/useStoredState";
import { useUser } from "@/hooks/useUser";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { chordSymbolLabel, effectiveChords, patternCapo } from "@/lib/fingerpickChords";
import { indexPattern } from "@/lib/fingerpickIndex";
import { shouldRunPageShortcut } from "@/lib/keyboardShortcuts";
import { beatUnitGlyph, meterLabel } from "@/lib/strumMeter";
import type { SharedFingerpick } from "@/lib/sharedItems";
import TabHeader from "./TabHeader";
import TabSheet from "./TabSheet";
import TabToolbar from "./TabToolbar";
import TabLibrary from "./library/TabLibrary";
import { useChordLine } from "./useChordLine";
import { useTabHandoff } from "./useTabHandoff";
import { TAB_TICK_LEVELS, tabBpm, useTabPlayback } from "./useTabPlayback";
import { useTabSession } from "./useTabSession";
import { useTabShare } from "./useTabShare";

/** Per-viewer: whether the library beside the stage is folded away. */
const LIBRARY_FOLDED_KEY = "tabLibraryFolded";

/** The editor, open on a tab of the player's own or on a new one (null). */
type Editing = { pattern: FingerpickPattern | null } | null;

/**
 * The Tab page. On /fingerpick it opens the player's library; given `shared`, it
 * opens that snapshot instead (/p/[id]): the library and every save path are gone,
 * the snapshot is what plays, and the one way to change it is to import a copy.
 */
export default function TabPage({ shared }: { shared?: SharedFingerpick }) {
	const isShared = shared !== undefined;
	const { user, loading } = useUser();

	// Section mode: the first and last bar of a stretch to practise, in rendered bars.
	const [sectionMode, setSectionMode] = useState(false);
	const [section, setSection] = useState<SectionSelection>(EMPTY_SELECTION);

	// The session opens and changes tabs; the transport that must follow is built from
	// the session's choice, so it is reached through a ref.
	const playbackRef = useRef<{ open: (p: FingerpickPattern) => void; restart: (p: FingerpickPattern) => void } | null>(null);
	const session = useTabSession({
		shared,
		user,
		loading,
		onOpen: (next) => {
			playbackRef.current?.open(next);
			setSection(EMPTY_SELECTION);
		},
		onChanged: (next) => playbackRef.current?.restart(next),
	});
	const pattern = session.selected;

	const prefs = useFingerpickPrefs();
	const chordLine = useChordLine(pattern, prefs, user, loading);
	// Where the tab's spans lie, for the staves' brackets and lead-in arcs.
	const renderContext = useMemo(() => ({ index: indexPattern(pattern) }), [pattern]);

	// The sheet's width packs the bars into rows; the cursor and the section are drawn inside it.
	const viewerRef = useRef<HTMLDivElement | null>(null);
	const rowsRef = useRef<HTMLDivElement>(null);
	const [measureViewer, viewerWidth] = useElementWidth<HTMLDivElement>();
	const setViewer = useCallback(
		(el: HTMLDivElement | null) => {
			viewerRef.current = el;
			measureViewer(el);
		},
		[measureViewer],
	);
	const shapeWidth = chordLine.chordDiagram ? chordLine.chordDiagramSize.width : 0;
	const rows = useMemo(
		() => layoutMeasureRows(pattern.measures, viewerWidth, shapeWidth, chordLine.pitchLabel, renderContext),
		[pattern.measures, viewerWidth, shapeWidth, chordLine.pitchLabel, renderContext],
	);
	const geometry = useMeasureGeometry({ viewerRef, contentRef: rowsRef, ready: session.restored });

	const playback = useTabPlayback({
		pattern,
		rows,
		viewerRef,
		geometry,
		sectionRange: sectionMode ? section.range : null,
		sectionMode,
		onPickMeasure: (measureIndex) => setSection((s) => pickMeasure(s, measureIndex)),
	});
	useEffect(() => {
		playbackRef.current = playback;
	});

	const pickRef = useRef<HTMLButtonElement>(null);
	usePlayKey(pickRef, playback.togglePlay);

	function toggleSectionMode() {
		setSectionMode((on) => !on);
		setSection(EMPTY_SELECTION);
	}
	// Escape leaves section mode. Subscribed once; the ref holds whether it is on.
	const sectionModeRef = useRef(sectionMode);
	useEffect(() => {
		sectionModeRef.current = sectionMode;
	});
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key !== "Escape" || !sectionModeRef.current || !shouldRunPageShortcut(e)) return;
			// An open tray or popover takes the key for itself: Escape closes it, not section mode.
			if (document.querySelector("[data-radix-popper-content-wrapper]")) return;
			setSectionMode(false);
			setSection(EMPTY_SELECTION);
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);
	const bands = useMemo(() => {
		const range = sectionMode ? highlightedRange(section) : null;
		return range ? sectionBands(geometry, range) : [];
	}, [geometry, section, sectionMode]);

	// The stage is what scrolls; auto-scroll creeps it while reading along.
	const stageRef = useRef<HTMLElement>(null);
	const { contentRef: stageInRef, autoScroll, setAutoScroll } = useAutoScroll({
		viewerRef: stageRef,
		scrollSpeed: prefs.scrollSpeed,
		patternId: pattern.id,
		ready: session.restored,
	});

	const shareState = useTabShare({
		user,
		pattern,
		shared,
		takenNames: session.patterns.map((p) => p.name),
		loading: session.isLoading,
		stop: playback.stop,
	});
	const { handoff, closeHandoff } = useTabHandoff(session, isShared);
	const [editing, setEditing] = useState<Editing>(null);
	const [pasteOpen, setPasteOpen] = useState(false);
	function openEditor(next: Editing) {
		playback.stop();
		setLibraryOpen(false);
		setEditing(next);
	}

	const [folded, fold] = useStoredState(LIBRARY_FOLDED_KEY, false, FLAG_CODEC);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const { dock, canDock, moveDock } = usePlayerDock();

	// What the pill says: the bar under the playhead, and the chord in effect there and at the next.
	const chords = useMemo(() => effectiveChords(pattern.measures), [pattern.measures]);
	const bars = pattern.measures.length;
	const bar = Math.min(playback.measure, bars - 1);
	const nowChord = chords[bar]?.[0];
	const nextChord = chords[(bar + 1) % bars]?.[0];

	const meterText = meterLabel(pattern.timeSignature);
	const barsText = `${bars} bar${bars === 1 ? "" : "s"}`;
	const capo = patternCapo(pattern);
	const meta = [
		isShared ? "Shared" : session.owned ? "My tab" : "Preset",
		`${beatUnitGlyph(pattern.timeSignature)} = ${tabBpm(pattern)}`,
		meterText,
		barsText,
	].join(" · ");
	const sharedMeta = [
		`${beatUnitGlyph(pattern.timeSignature)} = ${pattern.bpm}`,
		meterText,
		barsText,
		...(capo > 0 ? [`Capo ${capo}`] : []),
	].join(" · ");

	const libraryProps = {
		customPatterns: session.customPatterns,
		loading: session.isLoading,
		selectedId: pattern.id,
		favouriteIds: session.favouriteIds,
		onToggleFavourite: session.toggleFavourite,
		onNew: () => openEditor({ pattern: null }),
		onPaste: () => {
			setLibraryOpen(false);
			setPasteOpen(true);
		},
	};
	const editorPattern = handoff ? handoff.pattern : (editing?.pattern ?? null);

	return (
		<div className="tb-page" data-m="tab">
			<div className="lib-shell" data-lib={folded && !isShared ? "closed" : "open"}>
				<div className="tb-stage-wrap pb-area">
					{/* Where the library's own fold button sits, so folding and unfolding never move it. */}
					{!isShared && folded && (
						<button
							type="button"
							className="pb-icon lib-fab"
							onClick={() => fold(false)}
							aria-label="Show the tab list"
							title="Show the tab list"
							aria-expanded={false}
						>
							<PanelRightOpen aria-hidden />
						</button>
					)}
					<main ref={stageRef} className="tb-stage">
						<div ref={stageInRef} className="tb-stage-in">
							{!session.restored ? (
								<div className="flex flex-col gap-4" aria-busy="true">
									<Skeleton className="h-13 w-60" />
									<Skeleton className="h-96 w-full rounded-gp-xl" />
								</div>
							) : (
								<>
									{shared && (
										<div className="tb-shared-strip">
											<SharedPatternPanel
												variant="strip"
												name={pattern.name}
												meta={sharedMeta}
												user={user}
												loading={loading}
												importing={shareState.importing}
												onImport={shareState.importShared}
											/>
										</div>
									)}
									<TabHeader
										name={pattern.name}
										meta={meta}
										capo={capo}
										onCapo={session.setCapo}
										onOpenLibrary={isShared ? undefined : () => setLibraryOpen(true)}
										onEdit={isShared ? undefined : () => openEditor({ pattern })}
										onShare={isShared ? undefined : () => void shareState.share()}
										sharing={shareState.sharing}
										onDelete={isShared ? undefined : () => session.remove(pattern.id)}
										owned={session.owned}
									/>
									<TabToolbar
										onOpenLibrary={isShared ? undefined : () => setLibraryOpen(true)}
										hasChords={chordLine.hasChords}
										prefs={prefs}
										capo={capo}
										onCapo={session.setCapo}
										sectionMode={sectionMode}
										sectionHint={sectionMode ? sectionHint(section) : null}
										onSectionMode={toggleSectionMode}
										autoScroll={{ on: autoScroll, toggle: () => setAutoScroll((on) => !on) }}
									/>
									<TabSheet
										rows={rows}
										timeSignature={pattern.timeSignature}
										renderContext={renderContext}
										chordDiagram={chordLine.chordDiagram}
										chordDiagramSize={chordLine.chordDiagramSize}
										offShapeAt={chordLine.offShapeAt}
										pitchLabel={chordLine.pitchLabel}
										viewerRef={setViewer}
										rowsRef={rowsRef}
										rowRefs={playback.cursor.rowRefs}
										cursorRef={playback.cursor.cursorRef}
										highlightRef={playback.cursor.measureHighlightRef}
										bands={bands}
										onClick={playback.handleTabClick}
									/>
								</>
							)}
						</div>
					</main>
					<PlayBar
						module="tab"
						pickRef={pickRef}
						status={{
							bar: bar + 1,
							bars,
							now: nowChord ? chordSymbolLabel(nowChord) : null,
							next: nextChord ? chordSymbolLabel(nextChord) : null,
							idle: "No chords",
						}}
						playing={playback.isPlaying}
						preparing={!playback.isLoaded}
						canPlay={playback.isLoaded}
						onTogglePlay={playback.togglePlay}
						onStop={playback.stop}
						canStop={playback.isPlaying || playback.isPaused}
						tempo={{
							bpm: playback.bpm,
							onBpm: playback.setBpm,
							onSliding: playback.slideBpm,
							meter: pattern.timeSignature,
							defaultBpm: tabBpm(pattern),
							onSaveDefault: session.owned ? () => session.saveTempo(playback.bpm) : undefined,
						}}
						tickLevel={playback.tickLevel}
						onTickLevel={playback.setTickLevel}
						tickLevels={TAB_TICK_LEVELS}
						loop={playback.loop}
						onLoop={playback.setLoop}
						loopGap={playback.loopGap}
						onLoopGap={playback.setLoopGap}
						dock={dock}
						onDock={moveDock}
						canDock={canDock}
						soundKind="notes"
						sound={playback.notes}
						click={playback.click}
						speedUp={playback.speedUp}
					/>
				</div>

				<aside className="lib-aside" aria-label={isShared ? "Shared tab" : "Tab library"}>
					{shared ? (
						<SharedPatternPanel
							variant="sidebar"
							name={pattern.name}
							meta={sharedMeta}
							user={user}
							loading={loading}
							importing={shareState.importing}
							onImport={shareState.importShared}
						/>
					) : (
						!folded && <TabLibrary {...libraryProps} variant="aside" onSelect={session.select} onFold={() => fold(true)} />
					)}
				</aside>
			</div>

			{!isShared && (
				<Sheet open={libraryOpen} onOpenChange={setLibraryOpen} title="Tabs">
					<div className="flex min-h-0 flex-col gap-3" data-m="tab">
						<TabLibrary
							{...libraryProps}
							variant="sheet"
							onSelect={(next) => {
								session.select(next);
								setLibraryOpen(false);
							}}
						/>
					</div>
				</Sheet>
			)}
			{/* One editor: a tab the assistant made, to be checked; or one of the player's own, or a new one. */}
			<FingerpickEditModal
				key={editorPattern?.id ?? "new"}
				open={handoff !== null || editing !== null}
				pattern={editorPattern}
				takenNames={session.patterns.filter((p) => p.id !== editorPattern?.id).map((p) => p.name)}
				notice={
					handoff
						? {
								title: "Check this tab",
								text: "Made from what you asked for — check the frets and the rhythm, then save it as your own.",
								warnings: handoff.warnings.map((w) => w.message),
							}
						: undefined
				}
				onClose={() => {
					closeHandoff();
					setEditing(null);
				}}
				onSave={session.save}
			/>
			<TextTabDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
		</div>
	);
}
