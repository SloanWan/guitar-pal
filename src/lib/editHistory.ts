/**
 * A bounded undo/redo stack, as pure data.
 *
 * Kept separate from the React hook that drives it so the index arithmetic —
 * where undo/redo bugs actually live — can be tested without a DOM.
 */

export interface HistoryState<T> {
	/** Every committed snapshot, oldest first. Never empty. */
	entries: readonly T[];
	/** Which entry is currently shown. */
	index: number;
}

/** Snapshots retained. Bounded so a long session cannot grow without limit. */
export const HISTORY_LIMIT = 100;

export function initHistory<T>(value: T): HistoryState<T> {
	return { entries: [value], index: 0 };
}

export function currentEntry<T>(state: HistoryState<T>): T {
	return state.entries[state.index];
}

export function canUndo<T>(state: HistoryState<T>): boolean {
	return state.index > 0;
}

export function canRedo<T>(state: HistoryState<T>): boolean {
	return state.index < state.entries.length - 1;
}

/**
 * Commit a snapshot.
 *
 * A commit identical to the current entry is dropped: otherwise undo would
 * appear to do nothing, several times over, for edits that changed nothing.
 * A commit after an undo abandons the redo tail, which is what every editor
 * does and what makes the stack a history rather than a tree.
 */
export function pushHistory<T>(
	state: HistoryState<T>,
	next: T,
	limit: number = HISTORY_LIMIT,
): HistoryState<T> {
	if (next === currentEntry(state)) return state;

	const base = state.entries.slice(0, state.index + 1);
	base.push(next);
	const entries = base.length > limit ? base.slice(base.length - limit) : base;
	return { entries, index: entries.length - 1 };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
	return canUndo(state) ? { ...state, index: state.index - 1 } : state;
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
	return canRedo(state) ? { ...state, index: state.index + 1 } : state;
}
