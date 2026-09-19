"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { stashHandoff } from "@/lib/strumAssistant/handoff";
import { cropUrl, getChapterParse, parseChapter, setExerciseStatus } from "@/lib/books/api";
import type { Chapter, ChapterExercise, ChapterNote, ChapterParse, ParseIssue } from "@/lib/books/types";
import { MAX_PARSE_PAGES } from "@/lib/books/types";
import { chapterPages, estimateParseUsd, formatUsd, formatUsdRange } from "@/lib/books/parseCost";
import { usePolledResource } from "@/components/books/usePolledResource";
import { DenimButton, GhostButton, MONO_META, StatusLed } from "@/components/books/bookUi";

/**
 * The chapter card (#202 B6): what the parse made of a chapter, under its
 * row in the chapter list. Idle chapters offer the parse with what it is
 * likely to cost; a running parse is polled; a finished one shows the
 * knowledge points, the drafts with the crop they were read from, and every
 * warning inline — the #114 honesty rule, on screen.
 *
 * A draft opens in its editor through the same handoff the assistant uses.
 * Nothing is saved from here: the player checks it in the editor and saves
 * it like anything drawn by hand. The draft's row is marked `taken` as it
 * leaves, so the card shows what was already used.
 */

const FINGERPICK_PATH = "/fingerpick";

const isParsing = (parse: ChapterParse) => parse.chapter.parse_status === "parsing";

export default function ChapterCard({
	bookId,
	chapter,
	onChapter,
}: {
	bookId: string;
	chapter: Chapter;
	/** The chapter's row as the card learns it changed (status, cost). */
	onChapter: (chapter: Chapter) => void;
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

	function taken(exercise: ChapterExercise) {
		if (!parse) return;
		set({
			...parse,
			exercises: parse.exercises.map((e) => (e.id === exercise.id ? { ...e, status: "taken" } : e)),
		});
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
						Read the chapter for what it teaches and what it asks you to play. Tab exercises open in
						the fingerpick editor.
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
				<GhostButton
					onClick={start}
					disabled={starting || tooLong}
					className="h-7"
					title={`Runs the parse again and replaces what it produced — est. ${estimate}`}
				>
					Re-parse · est. {estimate}
				</GhostButton>
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
							<NoteItem key={note.id} note={note} />
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
								bookId={bookId}
								exercise={exercise}
								onTaken={() => taken(exercise)}
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

function NoteItem({ note }: { note: ChapterNote }) {
	return (
		<li className="flex flex-col gap-1">
			<p className="flex items-baseline gap-2 text-[13px] font-medium text-ink">
				<span className="min-w-0 flex-1">{note.title}</span>
				{note.pages.length > 0 ? (
					<span className={`${MONO_META} flex-none tabular-nums`}>p.{note.pages.join(", ")}</span>
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
	bookId,
	exercise,
	onTaken,
}: {
	bookId: string;
	exercise: ChapterExercise;
	onTaken: () => void;
}) {
	const router = useRouter();
	const [opening, setOpening] = useState(false);
	const draft = exercise.draft;
	const name = typeof draft.name === "string" && draft.name ? draft.name : "Untitled";
	const measures = Array.isArray(draft.measures) ? draft.measures.length : null;
	const bpm = typeof draft.bpm === "number" ? draft.bpm : null;
	const taken = exercise.status === "taken";

	async function open() {
		setOpening(true);
		try {
			await setExerciseStatus(bookId, exercise.id, "taken");
			onTaken();
		} catch {
			// The mark is bookkeeping; the draft still opens.
		}
		// The draft is the validator's own output, so the editor's validator
		// will pass it again on the way in.
		stashHandoff({
			kind: "fingerpick",
			pattern: draft as unknown as FingerpickPattern,
			warnings: exercise.warnings,
		});
		router.push(FINGERPICK_PATH);
	}

	return (
		<li className="flex gap-3 border border-line bg-panel p-3">
			{exercise.crop_path ? <CropThumb path={exercise.crop_path} alt={`Page ${exercise.page}, ${name}`} /> : null}
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="min-w-0 truncate text-[13px] font-medium text-ink">{name}</span>
					<span className={`${MONO_META} flex-none tabular-nums`}>
						p.{exercise.page} · {KIND_LABEL[exercise.kind]} · {exercise.source}
						{measures !== null ? ` · ${measures} ${measures === 1 ? "bar" : "bars"}` : ""}
						{bpm !== null ? ` · ♩=${bpm}` : ""}
					</span>
					{taken ? <span className={`${MONO_META} flex-none text-denim-accent`}>Opened</span> : null}
				</p>
				{exercise.warnings.length > 0 ? <IssueList issues={exercise.warnings} /> : null}
				<div className="mt-1">
					{exercise.kind === "tab" ? (
						<GhostButton onClick={open} disabled={opening} className="h-7">
							Open in fingerpick
							<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
						</GhostButton>
					) : (
						<span className={MONO_META}>Opens in the strum editor once that reader lands</span>
					)}
				</div>
			</div>
		</li>
	);
}

/** The crop the reader saw, from the private bucket by a short-lived URL. */
function CropThumb({ path, alt }: { path: string; alt: string }) {
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
		// A signed, hour-long Storage URL: not a candidate for next/image's loader.
		// eslint-disable-next-line @next/next/no-img-element
		<img src={url} alt={alt} className="w-32 flex-none self-start border border-line bg-white object-contain" />
	);
}

function IssueList({ issues, className = "" }: { issues: ParseIssue[]; className?: string }) {
	return (
		<ul className={`flex flex-col gap-1 ${className}`}>
			{issues.map((issue, i) => (
				<li key={`${issue.code}-${issue.path}-${i}`} className="flex items-start gap-1.5 text-[12px] text-ink-dim">
					<TriangleAlert
						className="mt-0.5 size-3 flex-none text-denim-accent"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<span>{issue.message}</span>
				</li>
			))}
		</ul>
	);
}
