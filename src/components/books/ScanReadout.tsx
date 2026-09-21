import type { Book } from "@/lib/books/types";
import { MONO_META, Panel, StatusLed } from "@/components/books/bookUi";

/**
 * The scan as the page's readout: the same recessed, glowing number
 * treatment the BPM readout uses, counting pages.
 */
export default function ScanReadout({ book }: { book: Book }) {
	const total = book.page_count ?? 0;
	const pad = Math.max(3, String(total).length);
	const count = String(book.scanned_pages).padStart(pad, "0");
	const totalText = total ? String(total).padStart(pad, "0") : "—".repeat(pad);
	return (
		<Panel label="Scanning" aside={<StatusLed status="scanning" />}>
			<div className="flex flex-col items-center gap-4 px-4 py-10 sm:flex-row sm:justify-center sm:gap-8">
				<div className="border border-line-strong bg-surface px-6 py-3 font-mono text-3xl font-bold tabular-nums text-denim-accent [text-shadow:var(--glow-readout)]">
					{count} / {totalText}
				</div>
				<div className="text-center sm:text-left">
					<p className="text-sm text-ink">
						{total ? "Reading pages…" : "Opening the PDF…"}
					</p>
					<p className={`${MONO_META} mt-1`}>Chapters come after the last page</p>
				</div>
			</div>
		</Panel>
	);
}
