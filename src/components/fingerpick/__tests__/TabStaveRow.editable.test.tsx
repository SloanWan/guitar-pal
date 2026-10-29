// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TabStaveRow, { slotColumns, type StaveColumn } from "@/components/fingerpick/TabStaveRow";
import { makeEmptySlot, setFret } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("slotColumns", () => {
	it("gives each slot the stretch halfway to its neighbours, edge to edge", () => {
		expect(slotColumns([{ slotIndex: 0, x: 40 }, { slotIndex: 1, x: 80 }, { slotIndex: 3, x: 140 }], 20, 200)).toEqual([
			{ slotIndex: 0, left: 20, width: 40, noteX: 40 },
			{ slotIndex: 1, left: 60, width: 50, noteX: 80 },
			{ slotIndex: 3, left: 110, width: 90, noteX: 140 },
		]);
		expect(slotColumns([], 0, 100)).toEqual([]);
	});
});

// jsdom has no canvas: VexFlow warns about text metrics but still draws its SVG.
vi.spyOn(console, "warn").mockImplementation(() => {});

function fixture(): FingerpickPattern {
	let p: FingerpickPattern = {
		id: "f",
		name: "F",
		bpm: 90,
		timeSignature: [4, 4],
		measures: [{ id: "m1", slots: [0, 1, 2, 3].map(() => makeEmptySlot("quarter")) }],
	};
	p = setFret(p, { measureIndex: 0, slotIndex: 0, stringIndex: 4 }, 3);
	p = setFret(p, { measureIndex: 0, slotIndex: 1, stringIndex: 2 }, 0);
	p = setFret(p, { measureIndex: 0, slotIndex: 2, stringIndex: 1 }, 1);
	return p;
}

let roots: Root[] = [];
afterEach(() => {
	act(() => roots.forEach((r) => r.unmount()));
	roots = [];
	document.body.innerHTML = "";
});

async function draw(editable?: { renderColumn: (c: StaveColumn) => React.ReactNode }) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	roots.push(root);
	const p = fixture();
	act(() =>
		root.render(
			<TabStaveRow
				measures={p.measures}
				timeSignature={p.timeSignature}
				startMeasureNumber={1}
				startMeasureIndex={0}
				measureWidths={[400]}
				editable={editable}
			/>,
		),
	);
	await act(async () => {
		await new Promise((r) => requestAnimationFrame(() => r(null)));
	});
	return host;
}

describe("TabStaveRow editable", () => {
	it("draws the same stave with or without the editor's surface", async () => {
		const reader = await draw();
		const columns: StaveColumn[] = [];
		const editor = await draw({
			renderColumn: (c) => {
				columns.push(c);
				return <span data-col={`${c.measureIndex}:${c.slotIndex}`} />;
			},
		});
		// VexFlow numbers its elements from a global counter: the ids are the one difference.
		const svg = (host: HTMLElement) => host.querySelector("svg")?.outerHTML.replace(/vf-auto\d+/g, "vf-auto");
		expect(svg(reader)).toBeTruthy();
		expect(svg(editor)).toBe(svg(reader));
		// The reader gets no columns; the editor one per slot, with six string lines.
		expect(reader.querySelector("[data-col]")).toBeNull();
		expect(editor.querySelectorAll("[data-col]")).toHaveLength(4);
		const last = columns[columns.length - 1];
		expect(last.lineYs).toHaveLength(6);
		expect(last.lineYs[1]).toBeGreaterThan(last.lineYs[0]);
	});
});
