"use client";

import { useEffect, useRef } from "react";
import { saveCopy, type Library } from "@/lib/offline/libraryCopy";

/**
 * Keeps this device's copy of a signed-in library in step with what the page
 * holds (#469), so a pattern saved a moment ago is still there in a reload
 * offline. Reads keep their own answer (`readThrough`); this covers what
 * changes after, the page's own writes.
 *
 * The first value seen once `ready` is the read itself, kept already, and is
 * not written again: a page may hold a list that has not loaded yet while
 * another has (the favourites arrive after the patterns), and writing that
 * would put an empty list over a good copy.
 */
export function useLibraryCopy(library: Library, userId: string | undefined, value: unknown, ready: boolean): void {
	const seen = useRef<{ userId: string; value: unknown } | null>(null);
	useEffect(() => {
		if (!userId || !ready) {
			seen.current = null;
			return;
		}
		const last = seen.current;
		seen.current = { userId, value };
		if (!last || last.userId !== userId || last.value === value) return;
		void saveCopy(library, userId, value);
	}, [library, userId, value, ready]);
}
