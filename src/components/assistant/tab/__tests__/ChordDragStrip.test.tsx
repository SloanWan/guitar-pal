import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ChordDragStrip from "@/components/assistant/tab/ChordDragStrip";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import { setSlotChord } from "@/lib/fingerpickChords";
import type { Measure } from "@/lib/fingerpickTypes";

/**
 * The strip reads the stave's note tags, so the stave is a stand-in here: a
 * tagged element per slot at a known x. jsdom lays nothing out, so each
 * element answers its own rect.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

const SLOT_X = [20, 60, 100, 140];

function fakeStave(): HTMLDivElement {
	const stave = document.createElement("div");
	stave.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 40, right: 200, bottom: 40, x: 0, y: 0, toJSON() {} });
	SLOT_X.forEach((x, slot) => {
		const note = document.createElementNS("http://www.w3.org/2000/svg", "g");
		note.setAttribute("data-measure-index", "0");
		note.setAttribute("data-slot-index", String(slot));
		note.getBoundingClientRect = () => ({ left: x - 5, top: 0, width: 10, height: 10, right: x + 5, bottom: 10, x: x - 5, y: 0, toJSON() {} });
		stave.appendChild(note);
	});
	return stave;
}

function measuresWith(chords: Record<number, { root: string; suffix: string }>): Measure[] {
	let pattern = makeDefaultPattern();
	for (const [slot, chord] of Object.entries(chords)) {
		pattern = setSlotChord(pattern, { measureIndex: 0, slotIndex: Number(slot) }, { ...chord, voicingId: null });
	}
	return pattern.measures;
}

let root: Root;
let host: HTMLDivElement;
let stave: HTMLDivElement;
beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	stave = fakeStave();
	document.body.appendChild(stave);
});

const chips = () => Array.from(host.querySelectorAll("button"));
const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, clientX, clientY: 5, pointerId: 1 });

describe("ChordDragStrip", () => {
	it("puts a chip under every chord mark, at its note's x", async () => {
		const measures = measuresWith({ 0: { root: "C", suffix: "major" }, 2: { root: "A", suffix: "minor" } });
		await act(async () => root.render(<ChordDragStrip measures={measures} staveRef={{ current: stave }} onMove={() => {}} />));
		expect(chips().map((c) => c.textContent)).toEqual(["C", "Am"]);
		expect(chips().map((c) => c.style.left)).toEqual(["20px", "100px"]);
	});

	it("renders nothing when no slot carries a chord", async () => {
		await act(async () => root.render(<ChordDragStrip measures={measuresWith({})} staveRef={{ current: stave }} onMove={() => {}} />));
		expect(host.innerHTML).toBe("");
	});

	it("drops a dragged chip on the nearest slot", async () => {
		const onMove = vi.fn();
		const measures = measuresWith({ 0: { root: "C", suffix: "major" } });
		await act(async () => root.render(<ChordDragStrip measures={measures} staveRef={{ current: stave }} onMove={onMove} />));
		const chip = chips()[0];
		await act(async () => {
			chip.dispatchEvent(pointer("pointerdown", 20));
		});
		await act(async () => {
			chip.dispatchEvent(pointer("pointermove", 95));
		});
		// In hand, the chip follows the slot under the pointer.
		expect(chips()[0].style.left).toBe("100px");
		await act(async () => {
			chip.dispatchEvent(pointer("pointerup", 95));
		});
		expect(onMove).toHaveBeenCalledWith({ measureIndex: 0, slotIndex: 0 }, { measureIndex: 0, slotIndex: 2 });
	});

	it("does not report a drop back on the same slot", async () => {
		const onMove = vi.fn();
		const measures = measuresWith({ 1: { root: "G", suffix: "major" } });
		await act(async () => root.render(<ChordDragStrip measures={measures} staveRef={{ current: stave }} onMove={onMove} />));
		const chip = chips()[0];
		await act(async () => {
			chip.dispatchEvent(pointer("pointerdown", 60));
			chip.dispatchEvent(pointer("pointermove", 62));
			chip.dispatchEvent(pointer("pointerup", 62));
		});
		expect(onMove).not.toHaveBeenCalled();
	});

	it("moves a chip a slot at a time with the arrow keys", async () => {
		const onMove = vi.fn();
		const measures = measuresWith({ 1: { root: "G", suffix: "major" } });
		await act(async () => root.render(<ChordDragStrip measures={measures} staveRef={{ current: stave }} onMove={onMove} />));
		const chip = chips()[0];
		await act(async () => {
			chip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		});
		expect(onMove).toHaveBeenLastCalledWith({ measureIndex: 0, slotIndex: 1 }, { measureIndex: 0, slotIndex: 2 });
		await act(async () => {
			chip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		});
		expect(onMove).toHaveBeenLastCalledWith({ measureIndex: 0, slotIndex: 1 }, { measureIndex: 0, slotIndex: 0 });
	});
});
