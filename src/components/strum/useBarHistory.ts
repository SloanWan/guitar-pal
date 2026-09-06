"use client";

import { useCallback, useState } from "react";
import type { Bar } from "@/lib/strumPatterns";
import {
	canRedo,
	canUndo,
	currentEntry,
	initHistory,
	pushHistory,
	redoHistory,
	undoHistory,
	type HistoryState,
} from "@/lib/editHistory";

/**
 * Undo/redo for a bar grid.
 *
 * A strum grid is edited by many small, cheap, easily mistaken actions — every
 * cell is a cycle, and re-dividing a compound beat from six cells to three drops
 * whatever sat between the kept cells by design. One mis-click can delete work
 * that took thirty clicks to make. The fingerpick editor has had a snapshot
 * history for this reason; the strum editors now want the same.
 *
 * `setBars` keeps React's own signature, so existing call sites are unchanged
 * and every mutation is captured without having to flag each one.
 */

export type BarsUpdate = Bar[] | ((prev: Bar[]) => Bar[]);

export interface BarHistory {
	bars: Bar[];
	/** Commits a new state and pushes it onto the history. */
	setBars: (update: BarsUpdate) => void;
	/** Replaces the state and starts a fresh history — for opening the editor. */
	reset: (bars: Bar[]) => void;
	undo: () => void;
	redo: () => void;
	canUndo: boolean;
	canRedo: boolean;
}

export function useBarHistory(initial: Bar[]): BarHistory {
	const [state, setState] = useState<HistoryState<Bar[]>>(() => initHistory(initial));

	const setBars = useCallback((update: BarsUpdate) => {
		// Read through the updater so the commit always sees the latest entry,
		// even when several edits land in one React batch.
		setState((prev) => {
			const current = currentEntry(prev);
			const next = typeof update === "function" ? update(current) : update;
			return pushHistory(prev, next);
		});
	}, []);

	const reset = useCallback((bars: Bar[]) => setState(initHistory(bars)), []);
	const undo = useCallback(() => setState(undoHistory), []);
	const redo = useCallback(() => setState(redoHistory), []);

	return {
		bars: currentEntry(state),
		setBars,
		reset,
		undo,
		redo,
		canUndo: canUndo(state),
		canRedo: canRedo(state),
	};
}
