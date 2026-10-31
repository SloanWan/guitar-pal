import { useCallback, useEffect, useRef, useState } from "react";
import { setFret, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	TWO_DIGIT_WINDOW_MS,
	applyNoteEdit,
	clampCell,
	editorKeyAction,
	extendSelection,
	selectTo,
	selectedSlots,
	stepSlot,
	stepString,
	typeDigit,
	type PendingDigit,
	type Selection,
} from "@/lib/tabEditorCursor";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";

interface Args {
	working: FingerpickPattern;
	commit: CommitPattern;
	/** Move on a slot after a note is written (a device preference). */
	autoAdvance: boolean;
	/** Space: play from the cursor, or stop. */
	onPlay: (from: SlotTarget) => void;
	/** A key the note cannot take, with the reason, said where the player sees it. */
	onBlocked: (reason: string) => void;
	/** A note just written, to be heard. */
	onWrote?: (cell: Cell, fret: number) => void;
}

const START: Cell = { measureIndex: 0, slotIndex: 0, stringIndex: 0 };

/**
 * The editor's cursor over the stave (#360): a click puts it on a slot and a
 * string, Shift-click and Shift+arrows select a run of slots, and the keys
 * edit at it — digits with the 800ms two-digit window, the registry's
 * technique keys, x, Backspace. One key handler, for the tab's own element.
 * The two-digit and auto-advance timer is cleared on every move and on unmount.
 */
export function useTabCursor({ working, commit, autoAdvance, onPlay, onBlocked, onWrote }: Args) {
	const [rawCursor, setCursor] = useState<Cell>(START);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [pending, setPending] = useState<PendingDigit | null>(null);
	// Kept on the tab whatever an edit removed under it.
	const cursor = clampCell(working, rawCursor);

	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);
	useEffect(() => clearTimer, [clearTimer]);

	// The latest tab for the timer, which fires after the render that wrote the note.
	const workingRef = useRef(working);
	useEffect(() => {
		workingRef.current = working;
	});

	function moveTo(next: Cell, nextSelection: Selection | null = null) {
		clearTimer();
		setPending(null);
		setCursor(next);
		setSelection(nextSelection);
	}

	/** A click on the stave: the cursor there, or with Shift the run up to there. */
	function pick(cell: Cell, shift: boolean) {
		if (!shift) {
			moveTo(cell);
			return;
		}
		const next = selectTo(cursor, selection, cell);
		moveTo(next.cursor, next.selection);
	}

	function advance(from: Cell) {
		if (autoAdvance) setCursor(stepSlot(workingRef.current, from, 1));
	}

	/** A fret written at a cell (the keyboard's digits, the dock's frets). */
	function writeAt(cell: Cell, fret: number) {
		commit((p) => setFret(p, cell, fret));
		onWrote?.(cell, fret);
	}

	function typeAt(digit: number) {
		clearTimer();
		const typed = typeDigit(pending, cursor, digit, Date.now());
		writeAt(cursor, typed.fret);
		setPending(typed.pending);
		if (!typed.pending) {
			advance(cursor);
			return;
		}
		// A first digit waits for a second; when none comes it is the note.
		const at = cursor;
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			setPending(null);
			advance(at);
		}, TWO_DIGIT_WINDOW_MS);
	}

	function onKeyDown(e: React.KeyboardEvent) {
		const action = editorKeyAction(e);
		// ⌘Z is the page's, wherever focus is.
		if (!action || action.kind === "undo" || action.kind === "redo") return;
		e.preventDefault();
		switch (action.kind) {
			case "slot": {
				if (action.extend) {
					const next = extendSelection(working, cursor, selection, action.delta);
					moveTo(next.cursor, next.selection);
				} else moveTo(stepSlot(working, cursor, action.delta));
				return;
			}
			case "string":
				moveTo(stepString(cursor, action.delta), selection);
				return;
			case "digit":
				typeAt(action.digit);
				return;
			case "escape":
				clearTimer();
				setPending(null);
				// The selection goes first; then the tab lets go of the keys.
				if (selection) setSelection(null);
				else (e.currentTarget as HTMLElement).blur();
				return;
			case "play":
				onPlay(cursor);
				return;
			default: {
				clearTimer();
				setPending(null);
				const result = applyNoteEdit(working, cursor, selectedSlots(working, cursor, selection), action);
				if ("blocked" in result) onBlocked(result.blocked);
				else commit(() => result.pattern);
			}
		}
	}

	/** After the dock wrote at `cell`: the cursor on that string, and a slot on when advancing. */
	function wroteAt(cell: Cell, wroteNote: boolean) {
		moveTo(cell);
		if (wroteNote) advance(cell);
	}

	return { cursor, selection, pending, pick, writeAt, wroteAt, onKeyDown, moveTo };
}
