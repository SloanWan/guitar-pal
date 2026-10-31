"use client";

import { useEffect, useState } from "react";
import { pageImageUrl } from "@/lib/books/api";

/**
 * A book's page as printed (#240), and its first page as the cover (#405).
 * Pages are rendered by the service on first sight and remembered there;
 * the signed URL is kept here for the tab's life, so a look back — the shelf
 * again, another locate of the same page — costs nothing.
 */

const urls = new Map<string, Promise<string | null>>();

export function pageImage(bookId: string, page: number): Promise<string | null> {
	const key = `${bookId}:${page}`;
	let pending = urls.get(key);
	if (!pending) {
		pending = pageImageUrl(bookId, page).catch(() => null);
		urls.set(key, pending);
		// A failure is not remembered: the next look tries again.
		void pending.then((url) => {
			if (url === null) urls.delete(key);
		});
	}
	return pending;
}

/**
 * The page's URL: undefined while it loads, null when it could not be had
 * (or when there is nothing to ask for — `bookId` null).
 */
export function usePageImage(bookId: string | null, page: number): string | null | undefined {
	const [images, setImages] = useState<Record<string, string | null>>({});
	const key = bookId === null ? null : `${bookId}:${page}`;
	useEffect(() => {
		if (bookId === null || key === null) return;
		let cancelled = false;
		void pageImage(bookId, page).then((url) => {
			if (!cancelled) setImages((current) => ({ ...current, [key]: url }));
		});
		return () => {
			cancelled = true;
		};
	}, [bookId, page, key]);
	return key === null ? null : images[key];
}
