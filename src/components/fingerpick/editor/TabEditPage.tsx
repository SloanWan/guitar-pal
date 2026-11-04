"use client";

import "@/components/fingerpick/reader/tab.css";
import "@/components/playback/icons.css";
import "@/components/playback/playback.css";
import "./tabEdit.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Play, Redo2, SlidersHorizontal, Square, TriangleAlert, Undo2, Wrench, X } from "lucide-react";
import Link from "@/components/AppLink";
import ZoomableImage from "@/components/ZoomableImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useEditHistory } from "@/components/fingerpick/useEditHistory";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import { autoAdvanceOn, useFingerpickPrefs, writeLastPatternId } from "@/components/fingerpick/useFingerpickPrefs";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUser } from "@/hooks/useUser";
import { cropUrl, setExerciseStatus } from "@/lib/books/api";
import { STRING_LABELS, clonePatternForEdit, makeDefaultPattern, setFret, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import { deriveRepeatDirectives } from "@/lib/fingerpickRepeats";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { clampBpmToMeter } from "@/lib/strumBars";
import { beatUnitGlyph, meterLabel } from "@/lib/strumMeter";
import {
	READER_PATH,
	clearEditorDraft,
	isEditorDirty,
	readEditorDraft,
	readEditorEntry,
	returnHref,
	type EditorBookSource,
	type EditorNotice,
	type EditorTarget,
} from "@/lib/tabEditorEntry";
import { blockCells, blockNotes, selectedSlots } from "@/lib/tabEditorCursor";
import { patternCapo, type FretHint } from "@/lib/fingerpickChords";
import { dockWrite } from "@/lib/fretboardDock";
import { noteText } from "./MeasureBlock";
import MeasureGrid from "./MeasureGrid";
import EditorInspector from "./EditorInspector";
import EditorToolbar from "./EditorToolbar";
import type { InspectorTab } from "@/lib/tabEditorInspector";
import FretboardDock from "./FretboardDock";
import TabSettingsSheet from "./TabSettingsSheet";
import { useEditorPlayback } from "./useEditorPlayback";
import { useLeaveGuard } from "./useLeaveGuard";
import { useChordTools } from "./useChordTools";
import { useTabCursor } from "./useTabCursor";
import { useNavRouter } from "@/components/nav-progress";

/** What the editor opened on, once it is known. */
type Opened =
	| { status: "loading" }
	| { status: "missing" }
	| { status: "ready"; isNew: boolean; notice?: EditorNotice; book?: EditorBookSource };

/**
 * The tab editor (#358): `/tab/edit/<id>` for one of the player's tabs,
 * `/tab/edit/new` for a blank one or a handed-over draft. The tab is
 * edited as a grid of bar blocks, a row a string. Saving goes through the library's own save (a
 * guest's tab to the browser, a player's to the account) and back to where the
 * editor was opened from; leaving with unsaved edits asks first. Given a
 * `target`, it opens that tab instead and saves through the target's own save.
 */
export default function TabEditPage({ id, target }: { id: string; target?: EditorTarget }) {
	const router = useNavRouter();
	const search = useSearchParams();
	const entry = useMemo(() => readEditorEntry(id, search), [id, search]);
	const { user, loading } = useUser();
	const library = useFingerpickPatterns(user, loading);
	const prefs = useFingerpickPrefs();

	const { working, commit, undo, redo, canUndo, canRedo, reset } = useEditHistory(makeDefaultPattern);
	const [opened, setOpened] = useState<Opened>({ status: "loading" });
	// What was opened, as text: the working tab differing from it is an unsaved edit.
	const [pristine, setPristine] = useState("");

	// Opens once: a blank tab and a draft at once, one of the player's own when the
	// library has loaded. A later library change (the save itself) never reopens it.
	const openedRef = useRef(false);
	useEffect(() => {
		if (openedRef.current) return;
		let next: FingerpickPattern | null = null;
		let state: Opened;
		if (target) {
			next = target.pattern;
			state = { status: "ready", isNew: false, notice: target.notice };
		} else if (entry.kind === "edit") {
			if (library.isLoading) return;
			const own = library.customPatterns.find((p) => p.id === entry.id);
			if (own) next = clonePatternForEdit(own);
			state = own ? { status: "ready", isNew: false } : { status: "missing" };
		} else {
			const draft = entry.kind === "draft" ? readEditorDraft(entry.token) : null;
			next = draft ? draft.pattern : makeDefaultPattern();
			state = { status: "ready", isNew: true, notice: draft?.notice, book: draft?.book };
		}
		openedRef.current = true;
		// A one-shot read of storage and the async library, as the reader's restore does.
		// Out of the effect: this one runs while the page's Suspense boundary hydrates, and
		// an update made there gets idle priority, so the blank tab waited behind every
		// library read (~2.5s signed in) before it showed.
		queueMicrotask(() => {
			if (next) {
				reset(next);
				setPristine(JSON.stringify(next));
			}
			setOpened(state);
		});
	}, [target, entry, library.isLoading, library.customPatterns, reset]);

	const ready = opened.status === "ready";
	const dirty = ready && isEditorDirty(pristine, working);
	const guard = useLeaveGuard(dirty, router);
	const back = target?.back ?? returnHref(entry.from);

	// ⌘Z / ⌘⇧Z, never in a text field (the field undoes its own typing).
	const historyRef = useRef({ undo, redo });
	useEffect(() => {
		historyRef.current = { undo, redo };
	});
	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "z") return;
			if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
			e.preventDefault();
			if (e.shiftKey) historyRef.current.redo();
			else historyRef.current.undo();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [warningsOpen, setWarningsOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	// A target keeps its tab apart from the library, so the library's names are not taken.
	const takenNames = useMemo(
		() => (target ? [] : library.patterns.filter((p) => p.id !== working.id).map((p) => p.name)),
		[target, library.patterns, working.id],
	);
	const named = working.name.trim().length > 0;

	async function save() {
		if (!ready || saving) return;
		if (!named) {
			setSettingsOpen(true);
			return;
		}
		// Unclosed or dangling repeats would reach playback and the stave malformed.
		const { error } = deriveRepeatDirectives(working.measures);
		if (error) {
			toast.error(error);
			return;
		}
		setSaving(true);
		const tab = { ...working, name: working.name.trim(), bpm: clampBpmToMeter(working.bpm, working.timeSignature) };
		if (target) {
			try {
				await target.save(tab);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "The tab could not be saved.");
				setSaving(false);
				return;
			}
			guard.leave(target.back);
			return;
		}
		const { pattern: stored, written } = library.saveCustomPattern(tab);
		clearEditorDraft();
		const book = opened.book;
		if (book) {
			void setExerciseStatus(book.bookId, book.exerciseId, "taken").catch(() => {});
			if (user) toast(`Saved "${stored.name}" to your tabs.`);
			else toast(`Saved "${stored.name}" to this browser.`, { description: "Sign in to keep it on your account." });
		}
		// The reader opens on what was saved, and reads the library on load: the
		// write lands first.
		writeLastPatternId(stored.id);
		await written;
		guard.leave(returnHref(entry.from, stored.id));
	}

	function discardDraft() {
		if (entry.kind === "draft") clearEditorDraft();
		guard.discard();
	}

	// The grid, whose slot columns the playhead marks.
	const gridRef = useRef<HTMLDivElement>(null);
	const playback = useEditorPlayback({ pattern: working, gridRef });

	// The cursor and the keys over the grid (#360).
	const tabRef = useRef<HTMLDivElement>(null);
	// A phone's width: the tab bar's breakpoint, where auto-advance starts on.
	const phone = useMediaQuery("(max-width: 719px)", false);
	// Below 960px the inspector is a sheet, opened from the status line, one tab at a time.
	const narrow = useMediaQuery("(max-width: 959px)", false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [toolsTab, setToolsTab] = useState<InspectorTab>("note");
	function togglePlay(from: SlotTarget) {
		if (playback.isPlaying) playback.stop();
		else playback.playFrom(from);
	}
	const autoAdvance = autoAdvanceOn(prefs.autoAdvance, phone);
	const tabCursor = useTabCursor({
		working,
		commit,
		autoAdvance,
		onPlay: togglePlay,
		onBlocked: (reason) => toast(reason),
		onWrote: (cell, fret) => playback.preview(cell.stringIndex, fret),
	});
	const { cursor, selection, block, pending } = tabCursor;
	const inspectorRef = useRef<HTMLElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const pinRef = useRef<HTMLDivElement>(null);
	const toolbayRef = useRef<HTMLDivElement>(null);
	const keysOnTab = useRef(false);
	// The tools for what was just picked: the sheet on that tab when narrow, else that section in view.
	function showTools(tab: InspectorTab) {
		if (narrow) {
			setToolsTab(tab);
			setToolsOpen(true);
			return;
		}
		const name = tab === "note" ? "Note" : tab === "effects" ? "Effects" : tab === "slot" ? "Slot" : "Bar";
		inspectorRef.current?.querySelector(`section[aria-label="${name}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}
	const focusTab = () => tabRef.current?.focus({ preventScroll: true });
	function gridPick(cell: Cell, shift: boolean, take: number | null) {
		focusTab();
		tabCursor.pick(cell, shift);
		// The chord shape's fret the empty cell offered: written, and heard.
		if (take !== null) {
			commit((p) => setFret(p, cell, take));
			playback.preview(cell.stringIndex, take);
		}
	}
	function gridColumn(target: SlotTarget, shift: boolean) {
		focusTab();
		tabCursor.pickSlot({ ...target, stringIndex: cursor.stringIndex }, shift);
		showTools("slot");
	}
	function gridMenu() {
		showTools("effects");
	}
	function gridBar(measureIndex: number) {
		tabCursor.moveTo({ measureIndex, slotIndex: 0, stringIndex: cursor.stringIndex });
	}
	// A click on a bar's blank space: the keys go to the tab, the cursor to that slot or, if it is elsewhere, the bar.
	function gridBlank(measureIndex: number, slotIndex: number | null) {
		focusTab();
		if (slotIndex !== null) tabCursor.moveTo({ measureIndex, slotIndex, stringIndex: cursor.stringIndex });
		else if (cursor.measureIndex !== measureIndex) gridBar(measureIndex);
	}
	const cursorSlot = working.measures[cursor.measureIndex]?.slots[cursor.slotIndex];

	// The fretboard writes at the cursor's slot, on the string clicked (#359).
	// The playback hook is new each render; the chord tools want one stable way to sound a shape.
	const previewChordRef = useRef(playback.previewChord);
	useEffect(() => {
		previewChordRef.current = playback.previewChord;
	});
	const hearShape = useCallback((hints: readonly FretHint[]) => previewChordRef.current(hints), []);
	const chordTools = useChordTools(working, user, loading, hearShape);
	function dockHit(stringIndex: number, fret: number, shift: boolean, pointer: boolean) {
		if (pointer) tabRef.current?.focus({ preventScroll: true });
		const cell = { measureIndex: cursor.measureIndex, slotIndex: cursor.slotIndex, stringIndex };
		const next = dockWrite(working, cell, fret, shift);
		commit(() => next);
		const wrote = next.measures[cell.measureIndex].slots[cell.slotIndex].strings[stringIndex];
		const wroteNote = !shift && wrote.fret === fret;
		if (wroteNote) playback.preview(stringIndex, fret);
		tabCursor.wroteAt(cell, wroteNote);
	}
	const run = selection ? selectedSlots(working, cursor, selection).length : 1;
	const statusPos = `Bar ${cursor.measureIndex + 1} · slot ${cursor.slotIndex + 1} · ${STRING_LABELS[cursor.stringIndex]} string`;
	const picked = block ? blockCells(working, block).length : 0;
	// What a note's edit in the inspector goes on: a block's notes, or the cursor's cell (#437).
	const blockNoteCells = block ? blockNotes(working, block) : [];
	const editNotes = blockNoteCells.length > 0 ? blockNoteCells : [cursor];
	const statusNote = pending
		? `${pending.digit}… type a second digit for ${pending.digit}0–${Math.min(24, pending.digit * 10 + 9)}`
		: picked > 1
			? `${picked} cells selected · the arrows move their notes`
			: run > 1
				? `${run} slots selected`
				: noteText(cursorSlot, cursor.stringIndex);

	// A book's page, signed once for the column beside the editor and the fold-out below 1024px.
	// A target's image needs no signing.
	const cropPath = ready ? (opened.book?.cropPath ?? null) : null;
	const [signedCrop, setCrop] = useState<string | null>(null);
	const crop = target?.source?.src ?? signedCrop;
	const wideSource = target?.source?.wide === true;

	// A wide source stays pinned under the toolbar (#437): the bars scroll beneath both,
	// so the pin sticks where the toolbar's bay ends and a bar brought into view clears them.
	const pinned = ready && !!crop && wideSource;
	useEffect(() => {
		const stage = stageRef.current;
		const pin = pinRef.current;
		const bay = toolbayRef.current;
		if (!stage || !pin || !bay) return;
		const place = () => {
			const top = bay.offsetHeight + (parseFloat(getComputedStyle(bay).top) || 0);
			pin.style.top = `${top}px`;
			// A sticky offset counts from the stage's content edge, its scroll padding from the padding edge.
			const pad = parseFloat(getComputedStyle(stage).paddingTop) || 0;
			stage.style.scrollPaddingTop = `${pad + top + pin.offsetHeight + 8}px`;
		};
		const observer = new ResizeObserver(place);
		observer.observe(pin);
		observer.observe(bay);
		return () => {
			observer.disconnect();
			stage.style.scrollPaddingTop = "";
		};
	}, [pinned]);

	// Under a pinned source the cursor's cell stays in view as the keys move it — its row,
	// not the whole bar, which can be taller than the room left under the source.
	const cursorMeasureId = working.measures[cursor.measureIndex]?.id;
	useEffect(() => {
		if (!pinned || !cursorMeasureId) return;
		const bar = stageRef.current?.querySelector(`[data-measure-id="${cursorMeasureId}"]`);
		(bar?.querySelector("[data-cur]") ?? bar)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
	}, [pinned, cursorMeasureId, cursor.slotIndex, cursor.stringIndex]);

	const [cropOpen, setCropOpen] = useState(false);
	useEffect(() => {
		if (!cropPath) return;
		let cancelled = false;
		void cropUrl(cropPath).then((url) => {
			if (!cancelled) setCrop(url);
		});
		return () => {
			cancelled = true;
		};
	}, [cropPath]);

	if (opened.status === "missing") {
		return (
			<div className="te-page" data-m="tab">
				<div className="te-stage">
					<div className="te-stage-in gp-rise">
						<h1 className="te-name">This tab isn&apos;t in your tabs</h1>
						<p className="pb-lab">It may have been deleted, or saved in another browser.</p>
						<div>
							<Button variant="secondary" size="sm" asChild>
								<Link href={READER_PATH}>Back to your tabs</Link>
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const notice = ready ? opened.notice : undefined;
	const bars = working.measures.length;
	const meta = [
		ready && opened.isNew ? "New tab" : "My tab",
		`${beatUnitGlyph(working.timeSignature)} = ${working.bpm}`,
		meterLabel(working.timeSignature),
		`${bars} bar${bars === 1 ? "" : "s"}`,
	].join(" · ");
	const heading = named ? working.name : (notice?.title ?? "New tab");
	const page = target ? target.source?.page : ready ? opened.book?.page : undefined;
	const leaveName = named ? `“${working.name.trim()}”` : "this tab";

	return (
		<div className="te-page" data-m="tab">
			<div className="te-body">
				{crop && !wideSource && (
					<aside className="te-src" aria-label="Source page">
						<div className="te-src-head">Page {page}</div>
						<div className="te-src-img">
							<ZoomableImage src={crop} alt={`Page ${page} of the book`} />
						</div>
					</aside>
				)}
				<div className="te-main">
					<div className="te-stage" ref={stageRef}>
						<div className="te-stage-in gp-rise">
							{!ready ? (
								<>
									<div className="te-titlerow" aria-busy="true" aria-label="Loading">
										<Skeleton className="te-sk-meta" />
										<Skeleton className="te-sk-name" />
									</div>
									<div className="te-toolbay" aria-hidden>
										<Skeleton className="te-sk-tool" />
									</div>
									<Skeleton className="te-sk-bar" />
								</>
							) : (
								<>
									{notice && (
										<div className="te-notice" role="note">
											<div className="te-notice-top">
												<b>{notice.title}</b>
												{notice.warnings && notice.warnings.length > 0 && (
													<button
														type="button"
														className="te-warnchip"
														aria-expanded={warningsOpen}
														onClick={() => setWarningsOpen((on) => !on)}
													>
														<TriangleAlert aria-hidden />
														{notice.warnings.length} {notice.warnings.length === 1 ? "warning" : "warnings"}
													</button>
												)}
												<span className="tb-grow" />
												{crop && !wideSource && (
													<Button
														variant="secondary"
														size="xs"
														className="te-srcfold-btn"
														aria-expanded={cropOpen}
														onClick={() => setCropOpen((on) => !on)}
													>
														{cropOpen ? "Hide the page" : "Show the page"}
													</Button>
												)}
											</div>
											<p>{notice.text}</p>
											{warningsOpen && notice.warnings && (
												<ul>
													{notice.warnings.map((w) => (
														<li key={w}>{w}</li>
													))}
												</ul>
											)}
											{crop && cropOpen && (
												<div className="te-srcfold te-srcfold-btn">
													<ZoomableImage src={crop} alt={`Page ${page} of the book`} />
												</div>
											)}
										</div>
									)}
									<div className="te-titlerow">
										<div className="te-meta">
											<span className="pb-lab pb-num">{meta}</span>
											<span className="te-unsaved" hidden={!dirty}>
												Unsaved
											</span>
											{!named && <span className="te-savewhy">Name it to save</span>}
										</div>
										<button
											type="button"
											className="te-name"
											data-empty={named ? undefined : ""}
											onClick={() => setSettingsOpen(true)}
											title="Name, tempo, capo and meter"
										>
											{heading}
										</button>
										<div className="te-acts">
											<button
												type="button"
												className="pb-icon te-mid-up"
												onClick={undo}
												disabled={!canUndo}
												aria-label="Undo"
												title="Undo (⌘Z)"
											>
												<Undo2 aria-hidden />
											</button>
											<button
												type="button"
												className="pb-icon te-mid-up"
												onClick={redo}
												disabled={!canRedo}
												aria-label="Redo"
												title="Redo (⌘⇧Z)"
											>
												<Redo2 aria-hidden />
											</button>
											<button
												type="button"
												className="pb-icon"
												onClick={() => setSettingsOpen(true)}
												aria-expanded={settingsOpen}
												aria-label="Tab settings"
												title="Name, tempo, capo and meter"
											>
												<SlidersHorizontal aria-hidden />
											</button>
											<span className="te-vsep te-mid-up" aria-hidden />
											<Button variant="secondary" size="xs" className="te-mid-up" onClick={() => guard.request(back)}>
												Close
											</Button>
											<button
												type="button"
												className="pb-icon te-phone-only"
												onClick={() => guard.request(back)}
												aria-label="Close the editor"
											>
												<X aria-hidden />
											</button>
											<Button
												size="xs"
												onClick={() => void save()}
												loading={saving}
												disabled={!named || (!target && library.isLoading)}
												title={
													!named
														? "Name the tab to save it"
														: target
															? target.saveTitle
															: library.isLoading
																? "Loading your tabs…"
																: "Save to your tabs"
												}
											>
												Save
											</Button>
										</div>
									</div>
									<div className="te-toolbay" ref={toolbayRef}>
										<EditorToolbar
											working={working}
											commit={commit}
											cursor={cursor}
											slots={selectedSlots(working, cursor, selection)}
											onBlocked={(reason) => toast(reason)}
											onBar={(measureIndex) =>
												tabCursor.moveTo({ measureIndex, slotIndex: 0, stringIndex: cursor.stringIndex })
											}
											onMerged={(at) => tabCursor.pickSlot({ ...at, stringIndex: cursor.stringIndex }, false)}
										/>
									</div>
									{pinned && (
										<div
											className="te-srcpin"
											ref={pinRef}
											// Panning or zooming the source must not take the keys from the tab.
											onPointerDown={() => {
												const tab = tabRef.current;
												keysOnTab.current = !!tab && tab.contains(document.activeElement);
											}}
											onPointerUp={() => {
												if (keysOnTab.current) tabRef.current?.focus({ preventScroll: true });
											}}
										>
											<div className="te-srcwide">
												<ZoomableImage src={crop} alt={`Page ${page} of the book`} />
											</div>
										</div>
									)}
									<div
										ref={tabRef}
										className="te-sheet"
										role="application"
										aria-label="Tab. Click a cell to place the cursor, then type a fret."
										tabIndex={0}
										onKeyDown={tabCursor.onKeyDown}
									>
										<MeasureGrid
											ref={gridRef}
											working={working}
											commit={commit}
											cursor={cursor}
											selection={selection}
											block={block}
											chordTools={chordTools}
											countEighths={prefs.countEighths}
											onPick={gridPick}
											onColumn={gridColumn}
											onMenu={gridMenu}
											onBar={gridBar}
											onBlank={gridBlank}
										/>
									</div>
								</>
							)}
						</div>
					</div>
					<div className="te-status">
						<button
							type="button"
							className="te-play"
							onClick={() => togglePlay(cursor)}
							disabled={!ready || !playback.isLoaded}
							aria-label={playback.isPlaying ? "Stop" : "Play from the cursor"}
							title={playback.isPlaying ? "Stop (Space)" : "Play from the cursor (Space)"}
						>
							{playback.isPlaying ? <Square aria-hidden /> : <Play aria-hidden />}
						</button>
						<span className="te-status-pos pb-num" role="status" aria-label="Cursor">
							{statusPos}
						</span>
						<span className="te-status-note pb-num" data-pending={pending ? "" : undefined}>
							{statusNote}
						</span>
						<span className="tb-grow" />
						{narrow && (
							<Button size="xs" onClick={() => setToolsOpen(true)} disabled={!ready}>
								<Wrench aria-hidden />
								Tools
							</Button>
						)}
					</div>
					{/* An instrument with nothing to load: there from the start, and only
					    taking clicks once the tab is open. */}
					<div className="contents" inert={!ready}>
						<FretboardDock
							pattern={working}
							cursor={cursor}
							capo={patternCapo(working)}
							hints={chordTools.hintsAt(cursor.measureIndex, cursor.slotIndex)}
							paged={phone}
							labels={prefs.dockLabels}
							onLabels={prefs.setDockLabels}
							autoAdvance={autoAdvance}
							onAutoAdvance={prefs.setAutoAdvance}
							open={prefs.dockOpen}
							onOpen={prefs.setDockOpen}
							onHit={dockHit}
						/>
					</div>
				</div>
				{!narrow && (
					<aside ref={inspectorRef} className="te-insp gp-rise" aria-label="Inspector">
						{ready ? (
							<EditorInspector
								working={working}
								commit={commit}
								cursor={cursor}
								slots={selectedSlots(working, cursor, selection)}
								notes={editNotes}
								onSkipped={(message) => toast(message)}
								onCursor={(cell) => tabCursor.moveTo(cell, selection)}
								chordTools={chordTools}
							/>
						) : (
							<div className="te-sk-insp" aria-hidden>
								<Skeleton className="te-sk-meta" />
								<Skeleton className="te-sk-chips" />
								<Skeleton className="te-sk-chips" />
								<Skeleton className="te-sk-panel" />
							</div>
						)}
					</aside>
				)}
			</div>
			{ready && narrow && (
				<Sheet open={toolsOpen} onOpenChange={setToolsOpen} title="Tools">
					<div className="te-sheet-tools" data-m="tab">
						<Segmented
							label="Tools"
							full
							options={[
								{ value: "note", label: "Note" },
								{ value: "effects", label: "Effects" },
								{ value: "slot", label: "Slot" },
								{ value: "bar", label: "Bar" },
							]}
							value={toolsTab}
							onChange={setToolsTab}
						/>
						<EditorInspector
							working={working}
							commit={commit}
							cursor={cursor}
							slots={selectedSlots(working, cursor, selection)}
							notes={editNotes}
							onSkipped={(message) => toast(message)}
							onCursor={(cell) => tabCursor.moveTo(cell, selection)}
							chordTools={chordTools}
							only={toolsTab}
						/>
					</div>
				</Sheet>
			)}

			{ready && (
				<TabSettingsSheet
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					working={working}
					commit={commit}
					takenNames={takenNames}
					countEighths={prefs.countEighths}
					onCountEighths={prefs.setCountEighths}
				/>
			)}

			<Dialog open={guard.attempt !== null} onOpenChange={(open) => (open ? undefined : guard.keep())}>
				<DialogContent role="alertdialog" data-m="tab" showCloseButton={false} className="te-leave sm:max-w-90">
					<DialogTitle>Discard changes?</DialogTitle>
					<DialogDescription>Your edits to {leaveName} aren&apos;t saved. Leaving now throws them away.</DialogDescription>
					<div className="te-leave-row">
						<Button variant="secondary" size="sm" onClick={guard.keep}>
							Keep editing
						</Button>
						<Button variant="danger" size="sm" onClick={discardDraft}>
							Discard
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
