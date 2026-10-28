"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildChordLookup, resolveChordToken } from "@/lib/chordBatchResolve";
import { toVoicingCards, type VoicingCard } from "@/lib/chordCards";
import {
	BOARD_STORAGE_KEY,
	boardParams,
	readBoardParams,
	transposeChord,
	type BoardItem,
	type BoardParams,
	type BoardState,
} from "@/lib/chordBoard";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { chordSymbol } from "@/lib/chordSuffixes";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { loadVoicings, peekVoicings, voicingCacheKey } from "@/lib/chordVoicingCache";
import { chordIndexWithUser, mergeVoicings, type UserChordVoicing } from "@/lib/userChordVoicings";

/**
 * A card on the board, read against the library: the chord held, as typed and
 * transposed. `sounds` is what it sounds as behind the capo, null without one.
 */
export type BoardCard =
	| {
			readonly status: "found";
			readonly item: BoardItem;
			readonly root: string;
			readonly suffix: string;
			readonly sounds: string | null;
			readonly shapes: VoicingCard[] | null;
	  }
	| { readonly status: "missing"; readonly item: BoardItem; readonly name: string };

const queryOf = (state: BoardState) => new URLSearchParams(boardParams(state)).toString();

/**
 * The chords board: what is on it, how far it is transposed and the capo it is
 * played behind — kept in the URL (`?board=&transpose=&capo=`) and in this
 * browser — and each card's shapes. A board arriving in the URL wins over the
 * stored one: that is a link someone followed to see those chords.
 */
export function useBoard(initial: BoardParams | null, index: readonly ChordIndexEntry[], userVoicings: readonly UserChordVoicing[]) {
	const [state, setState] = useState<BoardState>(() => readBoardParams(initial ?? {}));
	const { items, transpose, capo } = state;
	const initialQuery = initial === null ? null : queryOf(readBoardParams(initial));

	useEffect(() => {
		try {
			if (initialQuery !== null) localStorage.setItem(BOARD_STORAGE_KEY, initialQuery);
			else {
				const saved = localStorage.getItem(BOARD_STORAGE_KEY);
				if (saved) queueMicrotask(() => setState(readBoardParams(Object.fromEntries(new URLSearchParams(saved)))));
			}
		} catch {
			// unreadable storage: the board lives in the URL alone
		}
	}, [initialQuery]);

	const write = useCallback((next: BoardState) => {
		setState(next);
		const query = queryOf(next);
		try {
			localStorage.setItem(BOARD_STORAGE_KEY, query);
		} catch {
			// kept in the URL only
		}
		const params = new URLSearchParams(window.location.search);
		for (const key of ["board", "transpose", "capo"]) params.delete(key);
		for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
		const search = params.toString();
		window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
	}, []);
	const update = (next: BoardItem[]) => write({ ...state, items: next });
	const setTranspose = (next: number) => write({ ...state, transpose: next });
	const setCapo = (next: number) => write({ ...state, capo: next });

	const lookup = useMemo(() => buildChordLookup(chordIndexWithUser(index, userVoicings)), [index, userVoicings]);
	// Each card's chord as held: the typed chord, transposed.
	const held = useMemo(
		() =>
			items.map((item) => {
				const typed = resolveChordToken(lookup, item.token);
				if (!typed || transpose === 0) return typed;
				const shifted = transposeChord(typed.root, typed.suffix, transpose);
				return shifted && resolveChordToken(lookup, chordSymbol(shifted.root, shifted.suffix));
			}),
		[items, lookup, transpose],
	);

	// Each chord's shapes, from the shared voicing cache (in memory or this browser's storage first).
	const [loaded, setLoaded] = useState<Record<string, readonly ChordVoicing[]>>({});
	const wanted = useMemo(
		() => [...new Map(held.flatMap((chord) => (chord ? [[voicingCacheKey(chord.root, chord.suffix), chord] as const] : []))).values()],
		[held],
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
		const chord = held[i];
		if (!chord) return { status: "missing", item, name: item.token };
		const { root, suffix } = chord;
		const library = loaded[voicingCacheKey(root, suffix)];
		const shapes = library ? toVoicingCards(mergeVoicings(library, userVoicings, root, suffix), root, suffix) : null;
		const shifted = capo > 0 ? transposeChord(root, suffix, capo) : null;
		const sounds = shifted && chordSymbol(shifted.root, shifted.suffix);
		return { status: "found", item, root, suffix, sounds, shapes };
	});

	return { items, transpose, capo, cards, update, setTranspose, setCapo };
}
