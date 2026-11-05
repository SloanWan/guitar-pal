import { describe, expect, it } from "vitest";
import {
	MIN_SIZE,
	boxChange,
	boxFromDrag,
	countChanges,
	edgeShift,
	inPageOrder,
	isCropGoldSlug,
	modelBoxes,
	moveBox,
	nextAddedId,
	nextUncheckedPage,
	normalizeBox,
	pageId,
	pageNeighbours,
	readCropReview,
	resizeBox,
	type Box,
	type CropBox,
} from "@/lib/cropGold";

const close = (box: Box, expected: number[]) => box.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));

const cropBox = (id: string, box: Box, extra: Partial<CropBox> = {}): CropBox => ({
	id,
	origin: id,
	box,
	heading: id,
	exercise: true,
	...extra,
});

describe("names", () => {
	it("takes what the segment script writes and nothing a path could climb out of", () => {
		expect(isCropGoldSlug("batch1")).toBe(true);
		expect(isCropGoldSlug("sample-text-tab-3p-p003")).toBe(true);
		expect(isCropGoldSlug("add-2")).toBe(true);
		expect(isCropGoldSlug("../x")).toBe(false);
		expect(isCropGoldSlug("a/b")).toBe(false);
		expect(isCropGoldSlug("")).toBe(false);
		expect(pageId("syt", 39)).toBe("syt-p039");
	});
});

describe("box geometry", () => {
	it("orders corners, keeps a box on the page and never thinner than the minimum", () => {
		close(normalizeBox([0.8, 0.9, 0.2, 0.1]), [0.2, 0.1, 0.8, 0.9]);
		close(normalizeBox([-0.1, 0.2, 1.3, 0.4]), [0, 0.2, 1, 0.4]);
		close(normalizeBox([0.5, 0.5, 0.5, 0.5]), [0.5, 0.5, 0.5 + MIN_SIZE, 0.5 + MIN_SIZE]);
		close(normalizeBox([1, 1, 1, 1]), [1 - MIN_SIZE, 1 - MIN_SIZE, 1, 1]);
	});

	it("moves a box whole and stops it at the page's edge", () => {
		close(moveBox([0.1, 0.1, 0.3, 0.2], 0.1, 0.05), [0.2, 0.15, 0.4, 0.25]);
		close(moveBox([0.1, 0.1, 0.3, 0.2], -0.5, 0.9), [0, 0.9, 0.2, 1]);
	});

	it("drags only the handle's edges, and an edge never crosses its opposite", () => {
		close(resizeBox([0.1, 0.1, 0.5, 0.5], "s", 0.3, 0.1), [0.1, 0.1, 0.5, 0.6]);
		close(resizeBox([0.1, 0.1, 0.5, 0.5], "nw", -0.05, -0.2), [0.05, 0, 0.5, 0.5]);
		close(resizeBox([0.1, 0.1, 0.5, 0.5], "e", -0.9, 0), [0.1, 0.1, 0.1 + MIN_SIZE, 0.5]);
		close(resizeBox([0.1, 0.1, 0.5, 0.5], "n", 0, 0.9), [0.1, 0.5 - MIN_SIZE, 0.5, 0.5]);
	});

	it("draws a box from a drag in any direction", () => {
		close(boxFromDrag([0.6, 0.7], [0.2, 0.3]), [0.2, 0.3, 0.6, 0.7]);
	});

	it("says how far each edge moved, outward positive", () => {
		const shift = edgeShift([0.1, 0.2, 0.9, 0.5], [0.1, 0.17, 0.9, 0.55]);
		expect(shift.top).toBeCloseTo(0.03);
		expect(shift.bottom).toBeCloseTo(0.05);
		expect(shift.left).toBeCloseTo(0);
		expect(shift.right).toBeCloseTo(0);
	});
});

describe("what the review changed", () => {
	const model = [cropBox("e-1", [0.1, 0.1, 0.9, 0.3]), cropBox("e-2", [0.1, 0.4, 0.9, 0.6])];

	it("tells kept, adjusted, added and removed boxes apart", () => {
		expect(boxChange(cropBox("e-1", [0.1, 0.101, 0.9, 0.3]), model)).toBe("kept");
		expect(boxChange(cropBox("e-1", [0.1, 0.1, 0.9, 0.35]), model)).toBe("adjusted");
		expect(boxChange(cropBox("add-1", [0.1, 0.7, 0.9, 0.9], { origin: null }), model)).toBe("added");
		expect(boxChange(cropBox("e-2", [0.1, 0.4, 0.9, 0.6], { exercise: false }), model)).toBe("removed");
	});

	it("counts them for the index", () => {
		const boxes = [
			cropBox("e-1", [0.1, 0.1, 0.9, 0.35]),
			cropBox("e-2", [0.1, 0.4, 0.9, 0.6], { exercise: false }),
			cropBox("add-1", [0.1, 0.7, 0.9, 0.9], { origin: null }),
		];
		expect(countChanges(boxes, model)).toEqual({ kept: 0, adjusted: 1, added: 1, removed: 1 });
	});

	it("starts from the segmenter's padded boxes", () => {
		const boxes = modelBoxes({
			set: "syt",
			page: 118,
			gold_exercises: 2,
			exercises: [{ id: "syt-p118-1", heading: "旋律", staves: 2, crop_box: [0.9, 0.3, 0.1, 0.1] }],
		});
		expect(boxes).toEqual([
			{ id: "syt-p118-1", origin: "syt-p118-1", box: [0.1, 0.1, 0.9, 0.3], heading: "旋律", exercise: true },
		]);
	});

	it("names a drawn box after the ones already there", () => {
		expect(nextAddedId([cropBox("add-1", [0, 0, 1, 1]), cropBox("add-3", [0, 0, 1, 1])])).toBe("add-2");
		expect(nextAddedId([])).toBe("add-1");
	});

	it("puts boxes in reading order, side by side ones left to right", () => {
		const order = inPageOrder([
			cropBox("low", [0.1, 0.6, 0.9, 0.8]),
			cropBox("right", [0.55, 0.1, 0.9, 0.3]),
			cropBox("left", [0.1, 0.12, 0.45, 0.3]),
		]).map((b) => b.id);
		expect(order).toEqual(["left", "right", "low"]);
	});
});

describe("readCropReview", () => {
	const box = { id: "syt-p118-1", origin: "syt-p118-1", box: [0.1, 0.1, 0.9, 0.3], heading: "旋律", exercise: true };

	it("keeps a sound review, its boxes normalized", () => {
		const read = readCropReview({ status: "reviewed", boxes: [{ ...box, box: [0.9, 0.3, 0.1, 0.1] }], note: "ok" });
		expect(read).toEqual({ review: { status: "reviewed", boxes: [box], note: "ok" } });
	});

	it("refuses what a page should never send", () => {
		expect(readCropReview(null)).toHaveProperty("error");
		expect(readCropReview({ status: "done", boxes: [] })).toHaveProperty("error");
		expect(readCropReview({ status: "reviewed", boxes: [{ ...box, box: [0, 0, 1] }] })).toHaveProperty("error");
		expect(readCropReview({ status: "reviewed", boxes: [{ ...box, id: "../x" }] })).toHaveProperty("error");
		expect(readCropReview({ status: "reviewed", boxes: [{ ...box, exercise: "yes" }] })).toHaveProperty("error");
		expect(readCropReview({ status: "reviewed", boxes: [box, box] })).toHaveProperty("error");
	});
});

describe("moving through a batch", () => {
	const items = [
		{ id: "a", status: "reviewed" as const },
		{ id: "b", status: "unchecked" as const },
		{ id: "c", status: "reviewed" as const },
	];

	it("goes to the next unchecked page, wrapping round", () => {
		expect(nextUncheckedPage(items, "c")).toBe("b");
		expect(nextUncheckedPage(items, "b")).toBe(null);
	});

	it("has neighbours for the arrows", () => {
		expect(pageNeighbours(items, "b")).toEqual({ prev: "a", next: "c" });
		expect(pageNeighbours(items, "x")).toEqual({ prev: null, next: null });
	});
});
