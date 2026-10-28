"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildChordLookup, resolveChordToken } from "@/lib/chordBatchResolve";
import { toVoicingCards, type VoicingCard } from "@/lib/chordCards";
import { BOARD_STORAGE_KEY, parseBoard, serializeBoard, type BoardItem } from "@/lib/chordBoard";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { loadVoicings, peekVoicings, voicingCacheKey } from "@/lib/chordVoicingCache";
import { chordIndexWithUser, mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";

/** A card on the board, read against the library. */
export type BoardCard =
	| { readonly status: "found"; readonly item: BoardItem; readonly root: string; readonly suffix: string; readonly shapes: VoicingCard[] | null }
	| { readonly status: "missing"; readonly item: BoardItem };

/**
 * The chords board: what is on it, kept in the URL (`?board=`) and in this
 * browser, and each card's shapes. A board arriving in the URL wins over the
 * stored one — that is a link someone followed to see those chords.
 */
export function useBoard(initial: string | null, index: readonly ChordIndexEntry[], userVoicings: readonly UserChordVoicing[]) {
	const [items, setItems] = useState<BoardItem[]>(() => parseBoard(initial ?? ""));

	useEffect(() => {
		try {
			if (initial !== null) localStorage.setItem(BOARD_STORAGE_KEY, initial);
			else {
				const saved = localStorage.getItem(BOARD_STORAGE_KEY);
				if (saved) queueMicrotask(() => setItems(parseBoard(saved)));
			}
		} catch {
			// unreadable storage: the board lives in the URL alone
		}
	}, [initial]);

	const update = useCallback((next: BoardItem[]) => {
		setItems(next);
		const text = serializeBoard(next);
		try {
			localStorage.setItem(BOARD_STORAGE_KEY, text);
		} catch {
			// kept in the URL only
		}
		const params = new URLSearchParams(window.location.search);
		if (text) params.set("board", text);
		else params.delete("board");
		const query = params.toString();
		window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
	}, []);

	const lookup = useMemo(() => buildChordLookup(chordIndexWithUser(index, userVoicings)), [index, userVoicings]);
	const resolved = useMemo(() => items.map((item) => resolveChordToken(lookup, item.token)), [items, lookup]);

	// Each chord's shapes, from the shared voicing cache (in memory or this browser's storage first).
	const [loaded, setLoaded] = useState<Record<string, readonly ChordVoicing[]>>({});
	const wanted = useMemo(
		() => [...new Map(resolved.flatMap((r) => (r ? [[voicingCacheKey(r.root, r.suffix), r] as const] : []))).values()],
		[resolved],
	);
	useEffect(() => {
		let cancelled = false;
		for (const { root, suffix } of wanted) {
			const key = voicingCacheKey(root, suffix);
			if (loaded[key]) continue;
			const cached = peekVoicings(root, suffix);
			const request = cached ? Promise.resolve(cached) : loadVoicings(root, suffix);
			request
				.then((voicings) => {
					if (!cancelled) setLoaded((prev) => (prev[key] ? prev : { ...prev, [key]: voicings }));
				})
				.catch((e: unknown) => console.error("[useBoard] voicings:", e));
		}
		return () => {
			cancelled = true;
		};
	}, [wanted, loaded]);

	const cards: BoardCard[] = items.map((item, i) => {
		const hit = resolved[i];
		if (!hit) return { status: "missing", item };
		const library = loaded[voicingCacheKey(hit.root, hit.suffix)];
		const shapes = library
			? toVoicingCards(mergeVoicings(library, userVoicings, hit.root, hit.suffix), hit.root, hit.suffix)
			: null;
		return { status: "found", item, root: hit.root, suffix: hit.suffix, shapes };
	});

	return { items, cards, update };
}
