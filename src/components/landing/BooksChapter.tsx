"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import ChapterList from "@/components/books/ChapterList";
import ScanReadout from "@/components/books/ScanReadout";
import { MONO_META, Panel, StatusLed, STATUS_LABEL } from "@/components/books/bookUi";
import { sampleChapterParse } from "@/lib/books/sample";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { validateFingerpickPattern } from "@/lib/tabImport";
import { BOOKS_DEMO_BOOK, BOOKS_DEMO_CHAPTER, BOOKS_DEMO_EXERCISE, booksStage } from "@/lib/landing/booksStage";
import Chapter, { type ChapterCaption } from "./Chapter";
import { AutoHeight, ENTER, Pill } from "./landingUi";

const StaveRows = dynamic(() => import("./StaveRows"), {
	ssr: false,
	loading: () => <div className="min-h-[120px]" aria-hidden="true" />,
});

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Upload the method you already own.",
		text: "A PDF goes in. Chapters are found once, page by page, and the scan counts as it reads.",
	},
	{
		lead: "Every chapter, one row.",
		text: "Page ranges you can correct, a status per chapter, and a sample book that is always there to try.",
	},
	{
		lead: "Exercises read out beside the page.",
		text: "The crop the reader saw sits next to the TAB it read from it, with the chapter's points in words.",
	},
	{
		lead: "Play it beside the book.",
		text: "The draft is a real fingerpick pattern: play it, loop it, take it into the studio and edit.",
	},
];

/** The exercise's draft, from the sample fixture the /books/sample page reads — loaded once, on the client. */
function useSampleDraft(): FingerpickPattern | null {
	const [pattern, setPattern] = useState<FingerpickPattern | null>(null);
	useEffect(() => {
		let cancelled = false;
		void sampleChapterParse(BOOKS_DEMO_CHAPTER.id).then((parse) => {
			const exercise = parse?.exercises.find((e) => e.id === BOOKS_DEMO_EXERCISE.id);
			const next = exercise ? validateFingerpickPattern(exercise.draft).pattern : null;
			if (!cancelled) setPattern(next);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	return pattern;
}

export default function BooksChapter({ index }: { index: number }) {
	const draft = useSampleDraft();
	return (
		<Chapter
			index={index}
			name="Books · preview"
			title="Your textbook, playable."
			captions={CAPTIONS}
			cta={{ href: "/books/sample", label: "Open the sample book →" }}
			frame={{ title: "Books", meta: BOOKS_DEMO_BOOK.title }}
			position={(p) => booksStage(p).position}
		>
			{(p) => {
				const s = booksStage(p);
				const scanning = s.book.status !== "ready";
				return (
					<AutoHeight>
					<div className="flex flex-col gap-3">
						{scanning ? (
							<div key="scan" className={ENTER}>
								<ScanReadout book={s.book} />
							</div>
						) : (
							// A phone's stage has no room for the file line once the chapters are up.
							<div
								key="ready"
								className={`flex items-center gap-3 border border-line bg-panel px-4 py-2.5 ${ENTER} ${
									s.chapters.length > 0 ? "max-[640px]:hidden" : ""
								}`}
							>
								<StatusLed status={s.book.status} />
								<span className="min-w-0 truncate text-[13px] font-medium text-ink">{s.book.title}.pdf</span>
								<span className={`${MONO_META} ml-auto flex-none tabular-nums`}>
									{s.book.page_count} P · {STATUS_LABEL[s.book.status]}
								</span>
							</div>
						)}

						{s.chapters.length > 0 && (
							<div className={ENTER}>
							<Panel label="Chapters">
								<ChapterList
									chapters={s.chapters}
									openId={s.openId}
									onOpen={() => {}}
									renderCard={() => (
										<div className={`border-t border-line bg-surface px-4 py-3 ${ENTER}`}>
											<p className={`${MONO_META} max-[640px]:hidden`}>Parsed · 9 notes · 16 drafts</p>
											<h3 className={`${MONO_META} mt-3 mb-2 max-[640px]:mt-0`}>Practice drafts</h3>
											<div className="flex gap-3 border border-line bg-panel p-3">
												{/* A public crop of the sample book: the notation the reader saw. */}
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img
													src={BOOKS_DEMO_EXERCISE.cropPath}
													alt={`Page ${BOOKS_DEMO_EXERCISE.page}, ${BOOKS_DEMO_EXERCISE.name}`}
													className="w-32 flex-none self-start border border-line bg-white object-contain max-[640px]:w-20"
												/>
												<div className="flex min-w-0 flex-1 flex-col gap-1.5">
													<p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
														<span className="min-w-0 truncate text-[13px] font-medium text-ink">
															{BOOKS_DEMO_EXERCISE.name}
														</span>
														<span className={`${MONO_META} min-w-0 tabular-nums`}>
															p.{BOOKS_DEMO_EXERCISE.page} · tab · literal · {BOOKS_DEMO_EXERCISE.bars} bars · ♩=
															{BOOKS_DEMO_EXERCISE.bpm}
														</span>
													</p>
													<div className="mt-1 flex items-center gap-2">
														<Pill on={s.playingMeasure !== null}>
															<Play className="size-3" strokeWidth={1.5} aria-hidden="true" />
															Play
														</Pill>
														<Pill>Take to studio</Pill>
													</div>
												</div>
											</div>
											{s.draft && draft && (
												<div className={`mt-3 border border-line bg-panel px-2 ${ENTER}`}>
													<StaveRows
														measures={draft.measures}
														timeSignature={draft.timeSignature}
														highlightMeasure={s.playingMeasure}
													/>
												</div>
											)}
										</div>
									)}
								/>
							</Panel>
							</div>
						)}
					</div>
					</AutoHeight>
				);
			}}
		</Chapter>
	);
}
