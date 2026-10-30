"use client";

import { useEffect, useState } from "react";
import { pageText } from "@/lib/books/api";
import type { BookDetail } from "@/lib/books/types";
import SidePanel from "@/components/books/panel/SidePanel";
import TextTabPicker from "@/components/textTab/TextTabPicker";

/**
 * A page whose tab the parse left alone, beside the book (#228): its text
 * layer held the tab, and a text tab has no rhythm to read. The page's text
 * goes into the picker as it was scanned, the player listens to each
 * reading, and the one taken goes to the Tab page with the by-ear warning on
 * it. The parse has no row for it — nothing to mark taken.
 */
export default function TextTabPanel({
	book,
	page,
	onClose,
	animateOpen,
}: {
	book: BookDetail;
	page: number;
	onClose: () => void;
	animateOpen?: boolean;
}) {
	const [text, setText] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		pageText(book.id, page)
			.then((result) => {
				if (cancelled) return;
				if (result === null) setError("This page has no text to read.");
				else setText(result.text);
			})
			.catch((e: unknown) => {
				if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the page's text.");
			});
		return () => {
			cancelled = true;
		};
	}, [book.id, page]);

	return (
		<SidePanel
			eyebrow={`Read by ear · p.${page}`}
			title="Pick the rhythm that sounds right"
			meta="The tab is text: frets and order, no rhythm."
			ariaLabel="Text tab, by ear"
			onClose={onClose}
			animateOpen={animateOpen}
			testId="chapter-text-tab-panel"
			bare
		>
			{text === null ? (
				<p className="bk-pnl-b bk-lead bk-lead-s">{error ?? "Loading the page…"}</p>
			) : (
				<TextTabPicker
					initialText={text}
					initialName={`${book.title} p.${page}`}
					navigate
					readOnlyText
					onTaken={onClose}
				/>
			)}
		</SidePanel>
	);
}
