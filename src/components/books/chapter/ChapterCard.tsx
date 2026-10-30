"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { validateFingerpickPattern } from "@/lib/tabImport";
import { getChapterParse, parseChapter } from "@/lib/books/api";
import type { Chapter, ChapterExercise, ChapterParse } from "@/lib/books/types";
import { MAX_PARSE_PAGES, TEXT_TAB_SKIPPED, issuePage } from "@/lib/books/types";
import { chapterPages, estimateParseUsd, formatUsd, formatUsdRange } from "@/lib/books/parseCost";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { usePolledResource } from "@/components/books/usePolledResource";
import IssueList from "@/components/books/IssueList";
import DraftRow, { draftName } from "@/components/books/chapter/DraftRow";
import type { SourceView } from "@/components/books/panel/SourcePanel";
import type { OpenDraft } from "@/components/books/panel/DraftPanel";

/**
 * The chapter card (#202 B6, on Candy #404): what the parse made of a
 * chapter, under its row in the chapter list. Idle chapters offer the parse
 * with what it is likely to cost; a running parse is polled; a finished one
 * shows its warnings on top — the #114 honesty rule, on screen — then the
 * drafts or the notes, one at a time.
 *
 * A draft opens beside the book (#233): the page keeps one panel, where it
 * plays and from where it is edited or taken to the Tab page. The panel marks
 * the draft's row `taken` when it is saved or sent on — not when it is merely
 * played — so the card shows what was already used.
 */

const isParsing = (parse: ChapterParse) => parse.chapter.parse_status === "parsing";

type Show = "drafts" | "notes";

export default function ChapterCard({
	bookId,
	chapter,
	openExerciseId = null,
	onChapter,
	onOpenDraft,
	onLocate,
	onReadTextTab,
	readOnly = false,
}: {
	bookId: string;
	chapter: Chapter;
	/** The draft open in the panel, marked in the list. */
	openExerciseId?: string | null;
	/** The chapter's row as the card learns it changed (status, cost). */
	onChapter: (chapter: Chapter) => void;
	/** A draft to open in the page's panel beside the book. */
	onOpenDraft: (draft: OpenDraft) => void;
	/** The page a note or a draft came from, beside the book (#240). */
	onLocate: (source: SourceView) => void;
	/** A page whose tab was in the text layer, to read by ear beside the book (#228). */
	onReadTextTab?: (page: number) => void;
	/** The sample book: nothing that would run or re-run the parse. */
	readOnly?: boolean;
}) {
	const load = useCallback(() => getChapterParse(bookId, chapter.id), [bookId, chapter.id]);
	// Only a parsed chapter has anything the row lacks (its notes and drafts);
	// any other shows at once from the row, a running one polled from there.
	// Every round trip to the service is a database round trip or three.
	const seed = chapter.parse_status === "ready" ? null : { chapter, notes: [], exercises: [] };
	const { value: parse, error, refresh, set } = usePolledResource(load, isParsing, seed);
	const [starting, setStarting] = useState(false);
	const [show, setShow] = useState<Show>("drafts");

	// Whatever the poll learns about the chapter, the list row shows too.
	useEffect(() => {
		if (parse) onChapter(parse.chapter);
	}, [parse, onChapter]);

	const pages = chapterPages(chapter);
	const tooLong = pages > MAX_PARSE_PAGES;
	const estimate = formatUsdRange(estimateParseUsd(pages));

	async function start() {
		setStarting(true);
		try {
			const started = await parseChapter(bookId, chapter.id);
			set({ chapter: started, notes: [], exercises: [] });
			void refresh();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "Could not start the parse.");
		} finally {
			setStarting(false);
		}
	}

	// Read through the setter, not the closure: the panel calls this long
	// after the card rendered, and a re-parse may have replaced the card since.
	function taken(exerciseId: string) {
		set((current) =>
			current
				? {
						...current,
						exercises: current.exercises.map((e) => (e.id === exerciseId ? { ...e, status: "taken" } : e)),
					}
				: current,
		);
	}

	function openDraft(exercise: ChapterExercise) {
		// The draft is the validator's own output, so this is a formality that
		// also gives it its type — and catches a row an older build wrote.
		const { pattern } = validateFingerpickPattern(exercise.draft);
		if (pattern === null) {
			toast.error("This draft can't be opened — re-parse the chapter.");
			return;
		}
		onOpenDraft({ chapterId: chapter.id, exercise, pattern, onTaken: () => taken(exercise.id) });
	}

	if (parse === null) {
		return (
			<div className="bk-chb">
				<p className="bk-meta">{error ? "Could not load the chapter." : "Loading…"}</p>
			</div>
		);
	}

	const status = parse.chapter.parse_status;

	if (status === "parsing") {
		return (
			<div className="bk-chb">
				<p className="bk-row">
					<span className="bk-spin" aria-hidden />
					<span className="bk-h2">
						Parsing {pages} {pages === 1 ? "page" : "pages"}…
					</span>
				</p>
				<span className="bk-prog bk-prog-w" data-run="">
					<i />
				</span>
				<p className="bk-meta">
					Classifying pages, reading exercises, writing notes. You can leave this page; it keeps going.
				</p>
			</div>
		);
	}

	if (status === "idle" || status === "failed") {
		return (
			<div className="bk-chb">
				{status === "failed" ? (
					<p className="bk-iss">
						<TriangleAlert aria-hidden data-tone="bad" />
						<span>{parse.chapter.parse_error ?? "The parse did not finish."}</span>
					</p>
				) : null}
				<p className="bk-lead bk-lead-s">
					Read the chapter for what it teaches and what it asks you to play. Tab exercises open beside the
					book, and from there in the Tab editor.
				</p>
				<div className="bk-row">
					<Button onClick={start} disabled={tooLong} loading={starting}>
						{status === "failed" ? "Retry the parse" : "Parse this chapter"}
					</Button>
					<span className="bk-meta">
						{tooLong
							? `${pages} pages — split it into chapters of ${MAX_PARSE_PAGES} or fewer first`
							: `${pages} ${pages === 1 ? "page" : "pages"} · est. ${estimate}`}
					</span>
				</div>
			</div>
		);
	}

	const { notes, exercises } = parse;
	const cost = parse.chapter.parse_cost;
	const parsedAt = parse.chapter.parsed_at ? new Date(parse.chapter.parsed_at).toLocaleDateString() : "";
	const used = exercises.filter((e) => e.status === "taken").length;

	return (
		<div className="bk-chb">
			<div className="bk-chb-top">
				<p className="bk-meta">
					Parsed {parsedAt} · {formatUsd(cost.usd)} · {notes.length} {notes.length === 1 ? "note" : "notes"} ·{" "}
					{exercises.length} {exercises.length === 1 ? "draft" : "drafts"}
					{used > 0 ? ` · ${used} used` : ""}
				</p>
				{readOnly ? null : (
					<span className="bk-row">
						<Button
							variant="ghost"
							size="sm"
							onClick={start}
							disabled={starting || tooLong}
							title={`Runs the parse again and replaces what it produced — est. ${estimate}`}
						>
							Re-parse · est. {estimate}
						</Button>
					</span>
				)}
			</div>

			{parse.chapter.parse_warnings.length > 0 ? (
				<IssueList
					issues={parse.chapter.parse_warnings}
					action={(issue) => {
						const page = issue.code === TEXT_TAB_SKIPPED ? issuePage(issue) : null;
						if (page === null || !onReadTextTab) return null;
						return (
							<button
								type="button"
								onClick={() => onReadTextTab(page)}
								title="Play each rhythm the text allows and take the one that sounds right"
								className="bk-lnk"
							>
								Read by ear
								<ArrowUpRight aria-hidden />
							</button>
						);
					}}
				/>
			) : null}

			<Segmented
				label="Show"
				dense
				value={show}
				onChange={setShow}
				options={[
					{ value: "drafts", label: `Drafts ${exercises.length}` },
					{ value: "notes", label: `Notes ${notes.length}` },
				]}
				className="bk-seg"
			/>

			{show === "drafts" ? (
				exercises.length === 0 ? (
					<p className="bk-lead bk-lead-s">Nothing playable was found on these pages.</p>
				) : (
					<ul className="bk-drs" aria-label="Practice drafts">
						{exercises.map((exercise) => (
							<DraftRow
								key={exercise.id}
								exercise={exercise}
								selected={exercise.id === openExerciseId}
								onOpen={() => openDraft(exercise)}
								onLocate={() =>
									onLocate({
										chapterId: chapter.id,
										page: exercise.page,
										pages: [exercise.page],
										title: draftName(exercise),
									})
								}
							/>
						))}
					</ul>
				)
			) : notes.length === 0 ? (
				<p className="bk-lead bk-lead-s">Nothing the chapter explains in words.</p>
			) : (
				<ol className="bk-nts" aria-label="Knowledge points">
					{notes.map((note) => (
						<li key={note.id} className="bk-nt">
							<p className="bk-nt-h">
								<b>{note.title}</b>
								{note.pages.length > 0 ? (
									<button
										type="button"
										onClick={() =>
											onLocate({ chapterId: chapter.id, page: note.pages[0], pages: note.pages, title: note.title })
										}
										title="See where the book says this"
										className="bk-lnk"
									>
										p.{note.pages.join(", ")}
										<ArrowUpRight aria-hidden />
									</button>
								) : null}
							</p>
							<p className="bk-nt-b">{note.body}</p>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
