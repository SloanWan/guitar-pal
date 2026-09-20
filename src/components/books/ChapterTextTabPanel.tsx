"use client";

import { useEffect, useState } from "react";
import { pageText } from "@/lib/books/api";
import type { BookDetail } from "@/lib/books/types";
import SidePanel from "@/components/books/SidePanel";
import TextTabPicker from "@/components/textTab/TextTabPicker";
import { MONO_META } from "@/components/books/bookUi";

/**
 * A page whose tab the parse left alone, beside the book (#228): its text
 * layer held the tab, and a text tab has no rhythm to read. The page's text
 * goes into the picker as it was scanned, the player listens to each
 * reading, and the one taken goes to the fingerpick page with the by-ear
 * warning on it. The parse has no row for it — nothing to mark taken.
 */
export default function ChapterTextTabPanel({
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
			label="Text tab · by ear"
			onClose={onClose}
			animateOpen={animateOpen}
			testId="chapter-text-tab-panel"
		>
			<div className="flex-none border-b border-line px-4 py-3">
				<p className="truncate text-[15px] font-semibold text-ink">
					{book.title} · p.{page}
				</p>
				<p className={`${MONO_META} mt-1`}>The tab is text: frets and order, no rhythm. Pick one by ear.</p>
			</div>
			{text === null ? (
				<p className="px-4 py-6 text-[13px] text-ink-dim">{error ?? "Loading the page…"}</p>
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
