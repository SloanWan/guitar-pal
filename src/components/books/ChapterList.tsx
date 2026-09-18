import type { Chapter } from "@/lib/books/types";
import { MAX_PARSE_PAGES } from "@/lib/books/types";
import { formatPages } from "@/lib/books/ranges";
import { MONO_META } from "@/components/books/bookUi";

/**
 * The chapters as the scan (or the player) drew them. Rows are not links
 * yet: opening a chapter is the parse (#202), which lands with its card.
 */
export default function ChapterList({ chapters }: { chapters: Chapter[] }) {
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
				return (
					<li
						key={chapter.id}
						className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
					>
						<span className={`${MONO_META} w-6 flex-none tabular-nums`}>
							{String(chapter.index + 1).padStart(2, "0")}
						</span>
						<span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
							{chapter.title}
						</span>
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
					</li>
				);
			})}
		</ol>
	);
}
