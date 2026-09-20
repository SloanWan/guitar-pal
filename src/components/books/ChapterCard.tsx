"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, PanelRightOpen, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { validateFingerpickPattern } from "@/lib/tabImport";
import { cropUrl, getChapterParse, parseChapter } from "@/lib/books/api";
import type { Chapter, ChapterExercise, ChapterNote, ChapterParse } from "@/lib/books/types";
import { MAX_PARSE_PAGES } from "@/lib/books/types";
import { chapterPages, estimateParseUsd, formatUsd, formatUsdRange } from "@/lib/books/parseCost";
import { usePolledResource } from "@/components/books/usePolledResource";
import IssueList, { WarningsFold } from "@/components/books/IssueList";
import type { CropView } from "@/components/books/CropViewer";
import type { SourceView } from "@/components/books/ChapterSourcePanel";
import type { OpenDraft } from "@/components/books/ChapterDraftPanel";
import { DenimButton, GhostButton, MONO_META, StatusLed } from "@/components/books/bookUi";

/**
 * The chapter card (#202 B6): what the parse made of a chapter, under its
 * row in the chapter list. Idle chapters offer the parse with what it is
 * likely to cost; a running parse is polled; a finished one shows the
 * knowledge points, the drafts with the crop they were read from, and every
 * warning inline — the #114 honesty rule, on screen.
 *
 * A draft opens beside the book (#233): the page keeps one draft panel,
 * where it plays, can be edited and saved, and from where it leaves for the
 * fingerpick page. The panel marks the draft's row `taken` when it is saved
 * or sent on — not when it is merely played — so the card shows what was
 * already used.
 */

const isParsing = (parse: ChapterParse) => parse.chapter.parse_status === "parsing";

export default function ChapterCard({
	bookId,
	chapter,
	onChapter,
	onOpenDraft,
	onViewCrop,
	onLocate,
	readOnly = false,
}: {
	bookId: string;
	chapter: Chapter;
	/** The chapter's row as the card learns it changed (status, cost). */
	onChapter: (chapter: Chapter) => void;
	/** A draft to open in the page's panel beside the book. */
	onOpenDraft: (draft: OpenDraft) => void;
	/** A draft's crop, to show at full size (a dialog, or beside the draft panel). */
	onViewCrop: (crop: CropView) => void;
	/** The page a note or a draft came from, beside the book (#240). */
	onLocate: (source: SourceView) => void;
	/** The sample book: nothing that would run or re-run the parse. */
	readOnly?: boolean;
}) {
	const load = useCallback(() => getChapterParse(bookId, chapter.id), [bookId, chapter.id]);
	const { value: parse, error, refresh, set } = usePolledResource(load, isParsing);
	const [starting, setStarting] = useState(false);

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
			<CardShell>
				<p className={MONO_META}>{error ? "Could not load the chapter." : "Loading…"}</p>
			</CardShell>
		);
	}

	const status = parse.chapter.parse_status;

	if (status === "parsing") {
		return (
			<CardShell>
				<div className="flex items-center gap-3">
					<StatusLed status="scanning" />
					<p className="text-sm text-ink">
						Parsing {pages} {pages === 1 ? "page" : "pages"}…
					</p>
				</div>
				<p className={`${MONO_META} mt-2`}>Classifying pages, reading exercises, writing notes</p>
			</CardShell>
		);
	}

	if (status === "idle" || status === "failed") {
		return (
			<CardShell>
				{status === "failed" ? (
					<p className="mb-3 flex items-start gap-2 text-sm text-ink">
						<TriangleAlert
							className="mt-0.5 size-3.5 flex-none text-destructive"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						{parse.chapter.parse_error ?? "The parse did not finish."}
					</p>
				) : (
					<p className="mb-3 text-sm text-ink-dim">
						Read the chapter for what it teaches and what it asks you to play. Tab exercises open
						beside the book, and from there in the fingerpick editor.
					</p>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<DenimButton onClick={start} disabled={starting || tooLong}>
						{status === "failed" ? "Retry the parse" : "Parse this chapter"}
					</DenimButton>
					<span className={MONO_META}>
						{tooLong
							? `${pages} pages — split it into chapters of ${MAX_PARSE_PAGES} or fewer first`
							: `${pages} ${pages === 1 ? "page" : "pages"} · est. ${estimate}`}
					</span>
				</div>
			</CardShell>
		);
	}

	const { notes, exercises } = parse;
	const cost = parse.chapter.parse_cost;
	const parsedAt = parse.chapter.parsed_at ? new Date(parse.chapter.parsed_at).toLocaleString() : "";

	return (
		<CardShell>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className={MONO_META}>
					Parsed {parsedAt} · {formatUsd(cost.usd)} · {notes.length}{" "}
					{notes.length === 1 ? "note" : "notes"} · {exercises.length}{" "}
					{exercises.length === 1 ? "draft" : "drafts"}
				</p>
				{readOnly ? null : (
					<GhostButton
						onClick={start}
						disabled={starting || tooLong}
						className="h-7"
						title={`Runs the parse again and replaces what it produced — est. ${estimate}`}
					>
						Re-parse · est. {estimate}
					</GhostButton>
				)}
			</div>

			{parse.chapter.parse_warnings.length > 0 ? (
				<IssueList issues={parse.chapter.parse_warnings} className="mt-3" />
			) : null}

			<section className="mt-5">
				<h3 className={`${MONO_META} mb-2`}>Knowledge points</h3>
				{notes.length === 0 ? (
					<p className="text-[13px] text-ink-dim">Nothing the chapter explains in words.</p>
				) : (
					<ol className="flex flex-col gap-3">
						{notes.map((note) => (
							<NoteItem
								key={note.id}
								note={note}
								onLocate={() =>
									onLocate({ chapterId: chapter.id, page: note.pages[0], pages: note.pages, title: note.title })
								}
							/>
						))}
					</ol>
				)}
			</section>

			<section className="mt-5">
				<h3 className={`${MONO_META} mb-2`}>Practice drafts</h3>
				{exercises.length === 0 ? (
					<p className="text-[13px] text-ink-dim">Nothing playable was found on these pages.</p>
				) : (
					<ul className="flex flex-col gap-3">
						{exercises.map((exercise) => (
							<ExerciseItem
								key={exercise.id}
								exercise={exercise}
								onOpen={() => openDraft(exercise)}
								onViewCrop={onViewCrop}
								onLocate={(title) =>
									onLocate({ chapterId: chapter.id, page: exercise.page, pages: [exercise.page], title })
								}
							/>
						))}
					</ul>
				)}
			</section>
		</CardShell>
	);
}

function CardShell({ children }: { children: React.ReactNode }) {
	return <div className="border-t border-line bg-surface px-4 py-4">{children}</div>;
}

/** The way to a page: a small bordered key with the jump glyph, in mono like the meta it sits in. */
const LOCATE =
	"inline-flex items-center gap-1 border border-line-strong px-1.5 py-0.5 transition-colors duration-(--dur-hover) hover:border-denim hover:text-denim-accent focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";
const LocateGlyph = () => <ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />;

/** A note; its pages, when the reader gave any, open the page beside the book. */
function NoteItem({ note, onLocate }: { note: ChapterNote; onLocate: () => void }) {
	return (
		<li className="flex flex-col gap-1">
			<p className="flex items-baseline gap-2 text-[13px] font-medium text-ink">
				<span className="min-w-0 flex-1">{note.title}</span>
				{note.pages.length > 0 ? (
					<button
						type="button"
						onClick={onLocate}
						title="See where the book says this"
						className={`${MONO_META} ${LOCATE} flex-none tabular-nums`}
					>
						p.{note.pages.join(", ")}
						<LocateGlyph />
					</button>
				) : null}
			</p>
			<p className="text-[13px] leading-relaxed text-ink-dim">{note.body}</p>
		</li>
	);
}

const KIND_LABEL: Record<ChapterExercise["kind"], string> = {
	strum: "Strum",
	progression: "Progression",
	tab: "Tab",
	chord_diagram: "Chord",
};

function ExerciseItem({
	exercise,
	onOpen,
	onViewCrop,
	onLocate,
}: {
	exercise: ChapterExercise;
	onOpen: () => void;
	onViewCrop: (crop: CropView) => void;
	/** The page beside the book; told the draft's name for the panel's header. */
	onLocate: (title: string) => void;
}) {
	const draft = exercise.draft;
	const name = typeof draft.name === "string" && draft.name ? draft.name : "Untitled";
	const measures = Array.isArray(draft.measures) ? draft.measures.length : null;
	const bpm = typeof draft.bpm === "number" ? draft.bpm : null;
	const taken = exercise.status === "taken";

	return (
		<li className="flex gap-3 border border-line bg-panel p-3">
			{exercise.crop_path ? (
				<CropThumb path={exercise.crop_path} alt={`Page ${exercise.page}, ${name}`} onView={onViewCrop} />
			) : null}
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="min-w-0 truncate text-[13px] font-medium text-ink">{name}</span>
					<span className={`${MONO_META} flex-none tabular-nums`}>
						<button type="button" onClick={() => onLocate(name)} title="See this page of the book" className={LOCATE}>
							p.{exercise.page}
							<LocateGlyph />
						</button>{" "}
						· {KIND_LABEL[exercise.kind]} · {exercise.source}
						{measures !== null ? ` · ${measures} ${measures === 1 ? "bar" : "bars"}` : ""}
						{bpm !== null ? ` · ♩=${bpm}` : ""}
					</span>
					{taken ? <span className={`${MONO_META} flex-none text-denim-accent`}>Used</span> : null}
				</p>
				<WarningsFold issues={exercise.warnings} />
				<div className="mt-1">
					{exercise.kind === "tab" ? (
						<GhostButton onClick={onOpen} className="h-7" title="Open beside the book">
							Open
							<PanelRightOpen className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
						</GhostButton>
					) : (
						<span className={MONO_META}>Opens in the strum editor once that reader lands</span>
					)}
				</div>
			</div>
		</li>
	);
}

/**
 * The crop the reader saw, from the private bucket by a short-lived URL. A
 * thumbnail in the row; clicked, the page asks for it at full size.
 */
function CropThumb({ path, alt, onView }: { path: string; alt: string; onView: (crop: CropView) => void }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void cropUrl(path).then((next) => {
			if (!cancelled) setUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [path]);
	if (url === null) return <div aria-hidden="true" className="w-32 flex-none border border-line bg-surface" />;
	return (
		<button
			type="button"
			onClick={() => onView({ url, alt })}
			title="See the page's notation at full size"
			className="w-32 flex-none cursor-pointer self-start border border-line bg-white transition-[border-color,box-shadow] duration-(--dur-hover) hover:border-denim hover:[box-shadow:var(--elev-panel)] focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
		>
			{/* A signed, hour-long Storage URL: not a candidate for next/image's loader. */}
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img src={url} alt={alt} loading="lazy" className="block w-full object-contain" />
		</button>
	);
}
