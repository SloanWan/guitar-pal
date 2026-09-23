import { ChevronRight } from "lucide-react";
import type { Chapter } from "@/lib/books/types";
import { MAX_PARSE_PAGES } from "@/lib/books/types";
import { formatPages } from "@/lib/books/ranges";
import { MONO_META } from "@/components/books/bookUi";

/**
 * The chapters as the scan (or the player) drew them. A row opens its
 * chapter card (#202) under itself; one is open at a time. The row shows
 * the parse's state alongside the hint count, so a parsed chapter reads as
 * one at a glance. On a phone the meta moves under the title (#261): the
 * columns' fixed widths left the title no room at all.
 */
export default function ChapterList({
	chapters,
	openId,
	onOpen,
	renderCard,
}: {
	chapters: Chapter[];
	openId: string | null;
	onOpen: (id: string | null) => void;
	renderCard: (chapter: Chapter) => React.ReactNode;
}) {
	if (chapters.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
				<p className={MONO_META}>{"// No chapters"}</p>
				<p className="text-[13px] text-ink-dim">Draw the ranges by hand with “Edit ranges”.</p>
			</div>
		);
	}
	return (
		<ol>
			{chapters.map((chapter) => {
				const pages = chapter.page_end - chapter.page_start + 1;
				const hints = chapter.exercise_hint_count;
				const open = chapter.id === openId;
				return (
					<li key={chapter.id} className="border-b border-line last:border-b-0">
						<button
							type="button"
							aria-expanded={open}
							onClick={() => onOpen(open ? null : chapter.id)}
							className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-(--dur-hover) hover:bg-surface focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2 ${open ? "bg-surface" : ""}`}
						>
						<span className={`${MONO_META} w-6 flex-none tabular-nums`}>
							{String(chapter.index + 1).padStart(2, "0")}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13px] font-medium text-ink">{chapter.title}</span>
							{/* A phone: the meta on its own line under the title. */}
							<span
								data-testid="chapter-row-meta-stacked"
								className={`${MONO_META} mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:hidden`}
							>
								<ParseMark chapter={chapter} />
								{pages > MAX_PARSE_PAGES ? <span>&gt;{MAX_PARSE_PAGES} P</span> : null}
								<span className="tabular-nums">{formatPages(chapter.page_start, chapter.page_end)}</span>
								<span className={`tabular-nums ${hints > 0 ? "text-denim-accent" : ""}`}>
									{hints} {hints === 1 ? "hint" : "hints"}
								</span>
							</span>
						</span>
						{/* Wider: the meta as columns beside the title. */}
						<span className="hidden sm:contents">
							<ParseMark chapter={chapter} />
							{pages > MAX_PARSE_PAGES ? (
								<span
									className={`${MONO_META} flex-none`}
									title={`Longer than ${MAX_PARSE_PAGES} pages — split it before parsing`}
								>
									&gt;{MAX_PARSE_PAGES} P
								</span>
							) : null}
							<span className={`${MONO_META} w-20 flex-none text-right tabular-nums`}>
								{formatPages(chapter.page_start, chapter.page_end)}
							</span>
							<span
								className={`${MONO_META} w-16 flex-none text-right tabular-nums ${hints > 0 ? "text-denim-accent" : ""}`}
							>
								{hints} {hints === 1 ? "hint" : "hints"}
							</span>
						</span>
						<ChevronRight
							className={`size-3.5 flex-none text-ink-faint transition-transform duration-(--dur-hover) ${open ? "rotate-90" : ""}`}
							strokeWidth={1.5}
							aria-hidden="true"
						/>
						</button>
						{open ? renderCard(chapter) : null}
					</li>
				);
			})}
		</ol>
	);
}

/** Where the chapter's parse stands, as one word on the row; nothing for idle. */
function ParseMark({ chapter }: { chapter: Chapter }) {
	const label = {
		idle: null,
		parsing: "Parsing",
		ready: "Parsed",
		failed: "Parse failed",
	}[chapter.parse_status];
	if (label === null) return null;
	const tone = chapter.parse_status === "failed" ? "text-destructive" : "text-denim-accent";
	return <span className={`${MONO_META} flex-none ${tone}`}>{label}</span>;
}
