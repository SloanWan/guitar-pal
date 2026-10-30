// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeEmptySlot } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { TWO_DIGIT_WINDOW_MS } from "@/lib/tabEditorCursor";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import { useTabCursor } from "../useTabCursor";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Cursor = ReturnType<typeof useTabCursor>;

function tab(): FingerpickPattern {
	return {
		id: "t",
		name: "T",
		bpm: 90,
		timeSignature: [4, 4],
		measures: [{ id: "m1", slots: [0, 1, 2, 3].map(() => makeEmptySlot("quarter")) }],
	};
}

let root: Root;
const result: { current: Cursor; tab: FingerpickPattern } = { current: null as unknown as Cursor, tab: tab() };
const onBlocked = vi.fn();

function Probe({ autoAdvance }: { autoAdvance: boolean }) {
	const [working, setWorking] = useState(tab);
	const commit: CommitPattern = (updater) => setWorking((p) => updater(p));
	const cursor = useTabCursor({ working, commit, autoAdvance, onPlay: () => {}, onBlocked });
	useEffect(() => {
		result.tab = working;
		result.current = cursor;
	});
	return null;
}

function render(autoAdvance: boolean) {
	root = createRoot(document.createElement("div"));
	act(() => root.render(<Probe autoAdvance={autoAdvance} />));
}

/** A key press on the tab, as React hands it to the handler. */
function press(key: string, mods: { shiftKey?: boolean } = {}) {
	const target = document.createElement("div");
	const event = {
		key,
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		...mods,
		preventDefault: () => {},
		currentTarget: target,
	} as unknown as React.KeyboardEvent;
	act(() => result.current.onKeyDown(event));
}

const fret = (slot: number, string: number) => result.tab.measures[0].slots[slot].strings[string].fret;

beforeEach(() => {
	vi.useFakeTimers();
	onBlocked.mockReset();
});
afterEach(() => {
	act(() => root.unmount());
	vi.useRealTimers();
});

describe("useTabCursor", () => {
	it("joins 1 then 2 into 12, and moves on once the fret is whole", () => {
		render(true);
		press("1");
		expect(fret(0, 0)).toBe(1);
		expect(result.current.pending?.digit).toBe(1);
		press("2");
		expect(fret(0, 0)).toBe(12);
		expect(result.current.pending).toBeNull();
		expect(result.current.cursor.slotIndex).toBe(1);
	});

	it("moves on after the window when no second digit comes, and not at all with auto-advance off", () => {
		render(true);
		press("2");
		expect(result.current.cursor.slotIndex).toBe(0);
		act(() => vi.advanceTimersByTime(TWO_DIGIT_WINDOW_MS));
		expect(result.current.pending).toBeNull();
		expect(result.current.cursor.slotIndex).toBe(1);
		act(() => root.unmount());

		render(false);
		press("7");
		press("ArrowDown");
		press("2");
		act(() => vi.advanceTimersByTime(TWO_DIGIT_WINDOW_MS));
		expect(result.current.cursor).toEqual({ measureIndex: 0, slotIndex: 0, stringIndex: 1 });
		expect(fret(0, 1)).toBe(2);
	});

	it("drops the pending digit on a move, and its timer with it", () => {
		render(true);
		press("1");
		press("ArrowRight");
		expect(result.current.pending).toBeNull();
		expect(vi.getTimerCount()).toBe(0);
		press("2");
		expect(fret(0, 0)).toBe(1);
		expect(fret(1, 0)).toBe(2);
	});

	it("clears its timer on unmount", () => {
		render(true);
		press("1");
		expect(vi.getTimerCount()).toBe(1);
		act(() => root.unmount());
		expect(vi.getTimerCount()).toBe(0);
		render(true);
	});

	it("says why a blocked key did nothing", () => {
		render(false);
		press("3");
		press("h");
		expect(onBlocked).toHaveBeenCalledWith("No previous note on this string");
	});

	it("selects with Shift, and Escape lets the selection go first", () => {
		render(false);
		press("ArrowRight", { shiftKey: true });
		press("ArrowRight", { shiftKey: true });
		expect(result.current.selection).toEqual({ anchor: { measureIndex: 0, slotIndex: 0 }, head: { measureIndex: 0, slotIndex: 2 } });
		press("Escape");
		expect(result.current.selection).toBeNull();
	});
});
