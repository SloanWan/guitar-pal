"use client";

import "@/components/fingerpick/reader/tab.css";
import "@/components/playback/icons.css";
import "@/components/playback/playback.css";
import "./tabEdit.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Play, Redo2, SlidersHorizontal, Square, TriangleAlert, Undo2, X } from "lucide-react";
import Link from "@/components/AppLink";
import ZoomableImage from "@/components/ZoomableImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import TabSheet from "@/components/fingerpick/reader/TabSheet";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import { useEditHistory } from "@/components/fingerpick/useEditHistory";
import { useFingerpickPatterns } from "@/components/fingerpick/useFingerpickPatterns";
import { autoAdvanceOn, useFingerpickPrefs, writeLastPatternId } from "@/components/fingerpick/useFingerpickPrefs";
import { useElementWidth } from "@/components/useElementWidth";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUser } from "@/hooks/useUser";
import { cropUrl, setExerciseStatus } from "@/lib/books/api";
import { STRING_LABELS, clonePatternForEdit, makeDefaultPattern, type SlotTarget } from "@/lib/fingerpickEdit";
import { indexPattern } from "@/lib/fingerpickIndex";
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
} from "@/lib/tabEditorEntry";
import { inSelection, selectedSlots } from "@/lib/tabEditorCursor";
import type { EditableStave } from "@/components/fingerpick/TabStaveRow";
import { patternCapo } from "@/lib/fingerpickChords";
import { dockWrite } from "@/lib/fretboardDock";
import EditorColumn, { noteText } from "./EditorColumn";
import FretboardDock from "./FretboardDock";
import TabSettingsSheet from "./TabSettingsSheet";
import { useEditorPlayback } from "./useEditorPlayback";
import { useLeaveGuard } from "./useLeaveGuard";
import { useShapeHints } from "./useShapeHints";
import { useTabCursor } from "./useTabCursor";

/** What the editor opened on, once it is known. */
type Opened =
	| { status: "loading" }
	| { status: "missing" }
	| { status: "ready"; isNew: boolean; notice?: EditorNotice; book?: EditorBookSource };

// The reader's section bands; the editor draws none.
const NO_BANDS: [] = [];

/**
 * The tab editor (#358): `/fingerpick/edit/<id>` for one of the player's tabs,
 * `/fingerpick/edit/new` for a blank one or a handed-over draft. The tab is
 * drawn as the reader draws it. Saving goes through the library's own save (a
 * guest's tab to the browser, a player's to the account) and back to where the
 * editor was opened from; leaving with unsaved edits asks first.
 */
export default function TabEditPage({ id }: { id: string }) {
	const router = useRouter();
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
		if (entry.kind === "edit") {
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
		/* eslint-disable react-hooks/set-state-in-effect */
		if (next) {
			reset(next);
			setPristine(JSON.stringify(next));
		}
		setOpened(state);
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [entry, library.isLoading, library.customPatterns, reset]);

	const ready = opened.status === "ready";
	const dirty = ready && isEditorDirty(pristine, working);
	const guard = useLeaveGuard(dirty, router);
	const back = returnHref(entry.from);

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

	const takenNames = useMemo(
		() => library.patterns.filter((p) => p.id !== working.id).map((p) => p.name),
		[library.patterns, working.id],
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
		const { pattern: stored, written } = library.saveCustomPattern({
			...working,
			name: working.name.trim(),
			bpm: clampBpmToMeter(working.bpm, working.timeSignature),
		});
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

	// The tab, drawn as the reader draws it, packed to the card's width.
	const [measureViewer, viewerWidth] = useElementWidth<HTMLDivElement>();
	const renderContext = useMemo(() => ({ index: indexPattern(working) }), [working]);
	const rows = useMemo(
		() => layoutMeasureRows(working.measures, viewerWidth, 0, undefined, renderContext),
		[working.measures, viewerWidth, renderContext],
	);
	const rowsRef = useRef<HTMLDivElement>(null);
	const viewerRef = useRef<HTMLDivElement | null>(null);
	const setViewer = useCallback(
		(el: HTMLDivElement | null) => {
			viewerRef.current = el;
			measureViewer(el);
		},
		[measureViewer],
	);
	const playback = useEditorPlayback({ pattern: working, rows, viewerRef });

	// The cursor and the keys over the stave (#360).
	const tabRef = useRef<HTMLDivElement>(null);
	// A phone's width: the tab bar's breakpoint, where auto-advance starts on.
	const phone = useMediaQuery("(max-width: 719px)", false);
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
	const { cursor, selection, pending } = tabCursor;
	const editable: EditableStave = {
		renderColumn: (column) => (
			<EditorColumn
				column={column}
				slot={working.measures[column.measureIndex]?.slots[column.slotIndex]}
				cursorString={
					column.measureIndex === cursor.measureIndex && column.slotIndex === cursor.slotIndex
						? cursor.stringIndex
						: null
				}
				selected={inSelection(working, selection, column)}
				onPick={(cell, shift) => {
					tabRef.current?.focus({ preventScroll: true });
					tabCursor.pick(cell, shift);
				}}
			/>
		),
	};
	const cursorSlot = working.measures[cursor.measureIndex]?.slots[cursor.slotIndex];

	// The fretboard writes at the cursor's slot, on the string clicked (#359).
	const hintsAt = useShapeHints(working, user, loading);
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
	const statusNote = pending ? `${pending.digit}… type a second digit for ${pending.digit}0–${Math.min(24, pending.digit * 10 + 9)}` : run > 1 ? `${run} slots selected` : noteText(cursorSlot, cursor.stringIndex);

	// A book's page, signed once for the column beside the editor and the fold-out below 1024px.
	const cropPath = ready ? (opened.book?.cropPath ?? null) : null;
	const [crop, setCrop] = useState<string | null>(null);
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
					<div className="te-stage-in">
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
	const page = ready ? opened.book?.page : undefined;
	const leaveName = named ? `“${working.name.trim()}”` : "this tab";

	return (
		<div className="te-page" data-m="tab">
			<div className="te-body">
				{crop && (
					<aside className="te-src" aria-label="Source page">
						<div className="te-src-head">Page {page}</div>
						<div className="te-src-img">
							<ZoomableImage src={crop} alt={`Page ${page} of the book`} />
						</div>
					</aside>
				)}
				<div className="te-main">
					<div className="te-stage">
						<div className="te-stage-in">
							{!ready ? (
								<div className="flex flex-col gap-4" aria-busy="true">
									<Skeleton className="h-13 w-60" />
									<Skeleton className="h-96 w-full rounded-gp-xl" />
								</div>
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
												{crop && (
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
												disabled={!named}
												title={named ? "Save to your tabs" : "Name the tab to save it"}
											>
												Save
											</Button>
										</div>
									</div>
									<div
										ref={tabRef}
										className="te-sheet"
										role="application"
										aria-label="Tab. Click a string to place the cursor, then type a fret."
										tabIndex={0}
										onKeyDown={tabCursor.onKeyDown}
										data-playing={playback.isPlaying ? "" : undefined}
									>
										<TabSheet
											rows={rows}
											timeSignature={working.timeSignature}
											renderContext={renderContext}
											chordDiagramSize={{ width: 0, height: 0 }}
											viewerRef={setViewer}
											rowsRef={rowsRef}
											rowRefs={playback.cursor.rowRefs}
											cursorRef={playback.cursor.cursorRef}
											highlightRef={playback.cursor.measureHighlightRef}
											bands={NO_BANDS}
											onClick={() => {}}
											editable={editable}
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
					</div>
					{ready && (
						<FretboardDock
							pattern={working}
							cursor={cursor}
							capo={patternCapo(working)}
							hints={hintsAt(cursor.measureIndex, cursor.slotIndex)}
							paged={phone}
							labels={prefs.dockLabels}
							onLabels={prefs.setDockLabels}
							autoAdvance={autoAdvance}
							onAutoAdvance={prefs.setAutoAdvance}
							open={prefs.dockOpen}
							onOpen={prefs.setDockOpen}
							onHit={dockHit}
						/>
					)}
				</div>
			</div>

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
