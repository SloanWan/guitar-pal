import { useCallback, useEffect, useRef, useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";

// Maximum number of pattern snapshots retained for undo/redo. Older snapshots
// are dropped from the front once this is exceeded.
const HISTORY_LIMIT = 50;

export interface EditHistory {
	/** The pattern currently shown in the editor. */
	working: FingerpickPattern;
	/** Latest working pattern for event handlers (avoids stale-closure nav). */
	workingRef: React.RefObject<FingerpickPattern>;
	/**
	 * Apply a draft mutation and record it for undo/redo. Every draft-mutating
	 * operation goes through here: it derives the next pattern from the current
	 * one, drops any redo tail, appends the snapshot (capped at HISTORY_LIMIT),
	 * and advances the index. An updater that returns its input records nothing.
	 */
	commit: (updater: (prev: FingerpickPattern) => FingerpickPattern) => void;
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	/** Start over from a fresh pattern: one history entry, nothing to undo. */
	reset: (next: FingerpickPattern) => void;
}

/**
 * Undo/redo history for the fingerpick editor. `history` holds every committed
 * pattern snapshot (the initial state plus one entry per edit); `historyIndex`
 * points at the entry currently shown in `working`. Undo/redo move the index
 * and restore that snapshot; a fresh edit truncates any redo tail before
 * appending.
 */
export function useEditHistory(initial: () => FingerpickPattern): EditHistory {
	const [working, setWorking] = useState<FingerpickPattern>(initial);
	const [history, setHistory] = useState<FingerpickPattern[]>([]);
	const [historyIndex, setHistoryIndex] = useState(0);

	const workingRef = useRef(working);
	// Ref mirrors of the history state so commit/undo/redo can read the latest
	// values without stale closures (and without re-creating the callbacks).
	const historyRef = useRef<FingerpickPattern[]>([]);
	const historyIndexRef = useRef(0);

	// Keep the refs in step with their state.
	useEffect(() => {
		workingRef.current = working;
	}, [working]);
	useEffect(() => {
		historyRef.current = history;
	}, [history]);
	useEffect(() => {
		historyIndexRef.current = historyIndex;
	}, [historyIndex]);

	const commit = useCallback((updater: (prev: FingerpickPattern) => FingerpickPattern) => {
		const prev = workingRef.current;
		const next = updater(prev);
		if (next === prev) return;
		setWorking(next);
		const idx = historyIndexRef.current;
		setHistory((h) => {
			const base = h.slice(0, idx + 1);
			base.push(next);
			return base.length > HISTORY_LIMIT ? base.slice(base.length - HISTORY_LIMIT) : base;
		});
		setHistoryIndex((i) => Math.min(i + 1, HISTORY_LIMIT - 1));
	}, []);

	const undo = useCallback(() => {
		const i = historyIndexRef.current;
		if (i <= 0) return;
		const ni = i - 1;
		setHistoryIndex(ni);
		setWorking(historyRef.current[ni]);
	}, []);

	const redo = useCallback(() => {
		const i = historyIndexRef.current;
		if (i >= historyRef.current.length - 1) return;
		const ni = i + 1;
		setHistoryIndex(ni);
		setWorking(historyRef.current[ni]);
	}, []);

	const reset = useCallback((next: FingerpickPattern) => {
		setWorking(next);
		setHistory([next]);
		setHistoryIndex(0);
	}, []);

	return {
		working,
		workingRef,
		commit,
		undo,
		redo,
		canUndo: historyIndex > 0,
		canRedo: historyIndex < history.length - 1,
		reset,
	};
}
