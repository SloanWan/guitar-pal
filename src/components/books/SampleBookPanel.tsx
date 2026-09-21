import Link from "@/components/AppLink";
import { ArrowRight } from "lucide-react";
import { SAMPLE_BOOK_ID } from "@/lib/books/sample";
import { MONO_META, Panel, StatusLed } from "@/components/books/bookUi";

/**
 * The way into the sample book (#241) from /books: its own panel under the
 * library, one row in the library's dress, there whether or not the player
 * has books of their own — it is the quickest way to see what a parsed
 * chapter gives them before uploading anything.
 */
export default function SampleBookPanel() {
	return (
		<Panel label="Sample" aside={<span className={MONO_META}>read-only</span>}>
			<Link
				href={`/books/${SAMPLE_BOOK_ID}`}
				className="flex items-center gap-3 border-l-2 border-l-transparent px-4 py-3 transition-colors duration-200 hover:border-l-line-strong hover:bg-sidebar-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-denim-accent"
			>
				<StatusLed status="ready" />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-[13px] font-medium text-ink">吉他自学三月通 — sample</span>
					<span className="block truncate text-[11px] text-ink-dim">
						One parsed chapter: knowledge points, tab drafts you can play beside the book, edit and take
						to fingerpick.
					</span>
				</span>
				<span className={`${MONO_META} flex-none tabular-nums`}>4 P · 1 chapter</span>
				<ArrowRight className="size-3.5 flex-none text-ink-faint" strokeWidth={1.5} aria-hidden="true" />
			</Link>
		</Panel>
	);
}
