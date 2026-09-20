import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { makeDefaultPattern, setFret } from "@/lib/fingerpickEdit";
import FingerpickEditorMeasureHeader from "@/components/fingerpick/FingerpickEditorMeasureHeader";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The string-shift controls: live when the whole bar can move, and moving it through `commit`. */
describe("FingerpickEditorMeasureHeader string shifts", () => {
	function mount(pattern: FingerpickPattern) {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		let current = pattern;
		const commit = vi.fn((update: (p: FingerpickPattern) => FingerpickPattern) => {
			current = update(current);
		});
		act(() =>
			root.render(
				<FingerpickEditorMeasureHeader
					measure={pattern.measures[0]}
					measureIndex={0}
					measureCount={pattern.measures.length}
					commit={commit}
					hasChords={false}
					hints={undefined}
					onHighlight={() => {}}
					onNudge={() => {}}
				/>,
			),
		);
		const button = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
		return { button, current: () => current, cleanup: () => { act(() => root.unmount()); host.remove(); } };
	}

	it("moves the bar's notes a string down and keeps their frets", () => {
		let p = makeDefaultPattern();
		p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 0 }, 3);
		const { button, current, cleanup } = mount(p);
		expect(button("Move all notes up a string")?.disabled).toBe(true);
		expect(button("Move all notes down a string")?.disabled).toBe(false);
		act(() => button("Move all notes down a string")?.click());
		expect(current().measures[0].slots[0].strings[1].fret).toBe(3);
		expect(current().measures[0].slots[0].strings[0].fret).toBeNull();
		cleanup();
	});

	it("is off on an empty bar", () => {
		const { button, cleanup } = mount(makeDefaultPattern());
		expect(button("Move all notes up a string")?.disabled).toBe(true);
		expect(button("Move all notes down a string")?.disabled).toBe(true);
		cleanup();
	});
});
