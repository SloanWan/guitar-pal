import { describe, it, expect } from "vitest";
import { measureAtPoint, readMeasureGeometry, type MeasureRect } from "../useMeasureGeometry";

function rect(el: Element, r: { left: number; top: number; width: number; height: number }) {
	el.getBoundingClientRect = () =>
		({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r }) as DOMRect;
}

describe("readMeasureGeometry", () => {
	it("reads one box per measure from the row SVGs, in viewer content coordinates", () => {
		const viewer = document.createElement("div");
		const content = document.createElement("div");
		viewer.appendChild(content);
		// The viewer sits at (100, 50) on screen and is scrolled down 30px.
		rect(viewer, { left: 100, top: 50, width: 800, height: 400 });
		Object.defineProperty(viewer, "scrollTop", { value: 30, configurable: true });
		Object.defineProperty(viewer, "scrollLeft", { value: 0, configurable: true });
		const row0 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		row0.setAttribute("data-stave-0-x", "15");
		row0.setAttribute("data-stave-0-w", "300");
		row0.setAttribute("data-stave-1-x", "315");
		row0.setAttribute("data-stave-1-w", "400");
		rect(row0, { left: 100, top: 58, width: 800, height: 200 });
		const shapes = document.createElementNS("http://www.w3.org/2000/svg", "svg"); // a chord shape, not a row
		const row1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		row1.setAttribute("data-stave-2-x", "15");
		row1.setAttribute("data-stave-2-w", "700");
		rect(row1, { left: 100, top: 258, width: 800, height: 200 });
		content.append(row0, shapes, row1);

		const geometry = readMeasureGeometry(viewer, content);
		expect(geometry).toEqual<MeasureRect[]>([
			{ measureIndex: 0, left: 15, width: 300, top: 38, height: 200, rowIndex: 0 },
			{ measureIndex: 1, left: 315, width: 400, top: 38, height: 200, rowIndex: 0 },
			{ measureIndex: 2, left: 15, width: 700, top: 238, height: 200, rowIndex: 1 },
		]);
	});

	it("is empty before the staves have drawn", () => {
		const viewer = document.createElement("div");
		const content = document.createElement("div");
		rect(viewer, { left: 0, top: 0, width: 800, height: 400 });
		expect(readMeasureGeometry(viewer, content)).toEqual([]);
	});
});

describe("measureAtPoint", () => {
	const geometry: MeasureRect[] = [
		{ measureIndex: 0, left: 15, width: 300, top: 8, height: 200, rowIndex: 0 },
		{ measureIndex: 1, left: 315, width: 400, top: 8, height: 200, rowIndex: 0 },
		{ measureIndex: 2, left: 15, width: 700, top: 208, height: 200, rowIndex: 1 },
	];
	it("finds the measure under the point", () => {
		expect(measureAtPoint(geometry, 100, 100)).toBe(0);
		expect(measureAtPoint(geometry, 500, 100)).toBe(1);
		expect(measureAtPoint(geometry, 500, 300)).toBe(2);
	});
	it("clamps a point beside the measures to the nearest one in its row", () => {
		expect(measureAtPoint(geometry, 2, 100)).toBe(0);
		expect(measureAtPoint(geometry, 790, 100)).toBe(1);
	});
	it("picks the nearest row for a point between or beyond rows", () => {
		expect(measureAtPoint(geometry, 100, 206)).toBe(0);
		expect(measureAtPoint(geometry, 100, 210)).toBe(2);
		expect(measureAtPoint(geometry, 100, 900)).toBe(2);
	});
	it("is null without measures", () => {
		expect(measureAtPoint([], 1, 1)).toBeNull();
	});
});
