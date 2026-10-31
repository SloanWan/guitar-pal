import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useRhythmDraft } from "@/components/strum/useRhythmDraft";
import { useProgressionDraft } from "@/components/strum/useProgressionDraft";
import type { ChordProgression, StrumPattern } from "@/lib/strumPatterns";

// No testing-library in this project: a bare harness that renders the hook with
// props and hands its latest return value out through `result.current`.
function renderHook<P, T>(use: (props: P) => T, options?: { initialProps: P }) {
	const result = {} as { current: T };
	function Harness({ props }: { props: P }) {
		result.current = use(props);
		return null;
	}
	const root: Root = createRoot(document.createElement("div"));
	const render = (props: P) => act(() => root.render(<Harness props={props} />));
	render(options?.initialProps as P);
	return { result, rerender: render };
}

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const pattern: StrumPattern = { id: "p", name: "p", beats: [["D", ""], ["", ""]] };
const progression: ChordProgression = {
	id: "pr",
	patternId: "p",
	orderIndex: 0,
	bars: [
		{ beats: pattern.beats, chord: { root: "C", suffix: "major" } },
		{ beats: pattern.beats, chord: { root: "G", suffix: "major" } },
	],
};

describe("useRhythmDraft", () => {
	it("holds an edit until the pattern changes under it", () => {
		const { result, rerender } = renderHook(({ p }) => useRhythmDraft(p), { initialProps: { p: pattern } });
		expect(result.current.dirty).toBe(false);
		act(() => result.current.toggle(0, 1, 0));
		expect(result.current.rhythm[0][1]).toEqual(["D", ""]);
		expect(result.current.dirty).toBe(true);

		// Saved: the pattern now holds the edit, and the draft is let go.
		rerender({ p: { ...pattern, beats: result.current.rhythm[0] } });
		expect(result.current.dirty).toBe(false);
	});

	it("is left behind when another pattern opens, and reverts on request", () => {
		const { result, rerender } = renderHook(({ p }) => useRhythmDraft(p), { initialProps: { p: pattern } });
		act(() => result.current.toggle(0, 0, 0));
		rerender({ p: { ...pattern, id: "other" } });
		expect(result.current.dirty).toBe(false);
		rerender({ p: pattern });
		act(() => result.current.revert());
		expect(result.current.rhythm).toEqual([pattern.beats]);
	});
});

describe("useProgressionDraft", () => {
	it("applies chord, name and capo edits to what it hands back", () => {
		const { result } = renderHook(() => useProgressionDraft(progression));
		act(() => result.current.applyChord(1, { root: "A", suffix: "minor", voicingId: null }, "bar"));
		act(() => result.current.setName("Verse"));
		act(() => result.current.setCapo(3));
		const draft = result.current.progression!;
		expect(draft.bars[1].chord?.root).toBe("A");
		expect(draft.name).toBe("Verse");
		expect(draft.capo).toBe(3);
		expect(result.current.dirty).toBe(true);
	});

	it("adds a bar holding the last chord and says where it went", () => {
		const { result } = renderHook(() => useProgressionDraft(progression));
		let index = -1;
		act(() => {
			index = result.current.addBar();
		});
		expect(index).toBe(2);
		expect(result.current.progression!.bars[2].chord?.root).toBe("G");
		act(() => result.current.removeBar(2));
		expect(result.current.dirty).toBe(false);
	});

	it("keeps its edits when only the tempo is saved", () => {
		const { result, rerender } = renderHook(({ p }) => useProgressionDraft(p), { initialProps: { p: progression } });
		act(() => result.current.setName("Verse"));
		rerender({ p: { ...progression, bpm: 100 } });
		expect(result.current.progression!.name).toBe("Verse");
	});

	it("is nothing with nothing open", () => {
		const { result } = renderHook(() => useProgressionDraft(null));
		expect(result.current.progression).toBeNull();
		expect(result.current.dirty).toBe(false);
	});
});
