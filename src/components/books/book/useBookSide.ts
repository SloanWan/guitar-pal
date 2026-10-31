"use client";

import { useEffect, useState } from "react";
import {
	BOOK_LOCATE_EVENT,
	clearPendingLocate,
	pendingLocateFor,
	type BookLocateDetail,
} from "@/lib/assistant/bookContext";
import type { OpenDraft } from "@/components/books/panel/DraftPanel";
import type { SourceView } from "@/components/books/panel/SourcePanel";

/**
 * What is open beside the book (#404): a draft to play (#233), a page to read
 * (#240) or a text tab to read by ear (#228) — one at a time. A page opened
 * from a draft remembers it, so the panel can go back to it.
 */
export type SideView =
	| { kind: "draft"; draft: OpenDraft }
	| { kind: "source"; source: SourceView; back: OpenDraft | null }
	| { kind: "textTab"; page: number };

export interface Side {
	view: SideView;
	/**
	 * Whether the panel opened from nothing (it moves into place) or replaced
	 * one already open (it only changes what it shows).
	 */
	entered: boolean;
}

export function openSide(current: Side | null, view: SideView): Side {
	return { view, entered: current === null };
}

/** What the panel is keyed on: another draft or another page is a fresh panel, not a swap. */
export function sideKey(view: SideView): string {
	switch (view.kind) {
		case "draft":
			return `draft:${view.draft.exercise.id}`;
		case "source":
			return `source:${view.source.chapterId}:${view.source.title}:${view.source.page}`;
		case "textTab":
			return `text-tab:${view.page}`;
	}
}

/** A page an answer cited, as the source panel shows it. */
export function citedPage(detail: BookLocateDetail): SourceView {
	return { chapterId: detail.chapterId, page: detail.page, pages: [detail.page], title: `p.${detail.page}` };
}

export function useBookSide(bookId: string) {
	// A click from elsewhere (an answer's citation on another page) brought the
	// player here: the page opens with it.
	const [side, setSide] = useState<Side | null>(() => {
		const cited = pendingLocateFor(bookId);
		return cited ? { view: { kind: "source", source: citedPage(cited), back: null }, entered: true } : null;
	});
	const show = (view: SideView) => setSide((current) => openSide(current, view));

	// A page an answer cited, clicked in the assistant: open it beside the book.
	useEffect(() => {
		function onLocate(event: Event) {
			const { detail } = event as CustomEvent<BookLocateDetail>;
			if (detail.bookId !== bookId) return;
			setSide((current) => openSide(current, { kind: "source", source: citedPage(detail), back: null }));
		}
		window.addEventListener(BOOK_LOCATE_EVENT, onLocate);
		return () => window.removeEventListener(BOOK_LOCATE_EVENT, onLocate);
	}, [bookId]);
	// Shown now: forget it, so coming back to the book does not open it again.
	useEffect(() => clearPendingLocate(), []);

	return {
		side,
		openDraft: (draft: OpenDraft) => show({ kind: "draft", draft }),
		locate: (source: SourceView, back: OpenDraft | null = null) => show({ kind: "source", source, back }),
		readTextTab: (page: number) => show({ kind: "textTab", page }),
		close: () => setSide(null),
	};
}
