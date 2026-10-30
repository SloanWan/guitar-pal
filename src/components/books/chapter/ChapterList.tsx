import { ChevronRight } from "lucide-react";
import type { Chapter } from "@/lib/books/types";
import { MAX_PARSE_PAGES } from "@/lib/books/types";
import { formatPages } from "@/lib/books/ranges";
import type { CoverTone } from "@/lib/books/shelf";
import { StatusGlyph } from "@/components/books/shelf/BookCover";

/**
 * The chapters as the scan (or the player) drew them (#404): a card per
 * chapter that opens its chapter card (#202) under its row; one is open at a
 * time. The row shows where the parse stands beside the pages and the hint
 * count. On a phone the meta moves under the title (#261): written twice,
 * one shown per width, so the title keeps its room.
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
			<div className="bk-card bk-stack">
				<p className="bk-h2">No chapters</p>
				<p className="bk-lead">Draw them by hand: “Edit chapter ranges” in the ⋯ menu.</p>
			</div>
		);
	}
	return (
		<ol className="bk-chs">
			{chapters.map((chapter) => {
				const open = chapter.id === openId;
				return (
					<li key={chapter.id} className="bk-ch-item" data-open={open ? "" : undefined}>
						<ChapterRow chapter={chapter} open={open} onToggle={() => onOpen(open ? null : chapter.id)} />
						{open ? renderCard(chapter) : null}
					</li>
				);
			})}
		</ol>
	);
}

function ChapterRow({ chapter, open, onToggle }: { chapter: Chapter; open: boolean; onToggle: () => void }) {
	const pages = chapter.page_end - chapter.page_start + 1;
	const hints = chapter.exercise_hint_count;
	const facts = (
		<>
			<ParseMark chapter={chapter} />
			{pages > MAX_PARSE_PAGES ? (
				<span className="bk-st" data-tone="warn" title={`Longer than ${MAX_PARSE_PAGES} pages — split it before parsing`}>
					&gt;{MAX_PARSE_PAGES} pages
				</span>
			) : null}
			<span className="bk-meta bk-ch-col">{formatPages(chapter.page_start, chapter.page_end)}</span>
			<span className="bk-meta bk-ch-col">
				{hints} {hints === 1 ? "hint" : "hints"}
			</span>
		</>
	);
	return (
		<button type="button" aria-expanded={open} onClick={onToggle} className="bk-ch">
			<span className="bk-ch-n">{String(chapter.index + 1).padStart(2, "0")}</span>
			<span className="bk-ch-t">
				<b>
					<span className="gp-title">{chapter.title}</span>
				</b>
				{/* A phone: the facts on their own line under the title. */}
				<span data-testid="chapter-row-meta-stacked" className="bk-ch-stacked">
					{facts}
				</span>
			</span>
			{/* Wider: the facts as columns beside the title. */}
			<span className="bk-ch-m">{facts}</span>
			<ChevronRight className="bk-chev" aria-hidden />
		</button>
	);
}

const PARSE_MARK: Record<Chapter["parse_status"], { label: string; tone: CoverTone } | null> = {
	idle: null,
	parsing: { label: "Parsing", tone: "run" },
	ready: { label: "Parsed", tone: "ok" },
	failed: { label: "Parse failed", tone: "bad" },
};

/** Where the chapter's parse stands, as one word on the row; nothing for idle. */
function ParseMark({ chapter }: { chapter: Chapter }) {
	const mark = PARSE_MARK[chapter.parse_status];
	if (mark === null) return null;
	return (
		<span className="bk-st" data-tone={mark.tone}>
			<StatusGlyph tone={mark.tone} />
			{mark.label}
		</span>
	);
}
