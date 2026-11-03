import { describe, expect, it } from "vitest";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import {
	compareItems,
	countStatuses,
	isDropped,
	isTabGoldCrop,
	isTabGoldSlug,
	modelPattern,
	neighbours,
	nextUnchecked,
	readReview,
	unplacedChords,
	type TabGoldItem,
} from "@/lib/tabGold";

const item = (id: string, status: TabGoldItem["status"] = "unchecked", page = 1): TabGoldItem => ({
	id,
	name: id,
	page,
	status,
});

describe("names", () => {
	it("takes what the seed writes and nothing a path could climb out of", () => {
		expect(isTabGoldSlug("sanyuetong-dense-tab")).toBe(true);
		expect(isTabGoldSlug("p0002-r1-1")).toBe(true);
		expect(isTabGoldSlug("../secrets")).toBe(false);
		expect(isTabGoldSlug("a/b")).toBe(false);
		expect(isTabGoldSlug("")).toBe(false);
		expect(isTabGoldCrop("p0002-r1-1.png")).toBe(true);
		expect(isTabGoldCrop("../p.png")).toBe(false);
		expect(isTabGoldCrop("p0002.json")).toBe(false);
	});
});

describe("readReview", () => {
	const gold = makeDefaultPattern();

	it("keeps a confirmed review's gold as a valid pattern", () => {
		const read = readReview({ status: "confirmed", gold, jianpu: true, note: "fine" });
		expect("review" in read && read.review.status).toBe("confirmed");
		expect("review" in read && read.review.gold?.measures.length).toBe(gold.measures.length);
		expect("review" in read && read.review.jianpu).toBe(true);
	});

	it("drops any gold from a review that has none", () => {
		const read = readReview({ status: "unusable", gold, jianpu: null, note: "" });
		expect("review" in read && read.review.gold).toBeNull();
	});

	it("refuses a corrected review without a valid tab", () => {
		expect("error" in readReview({ status: "corrected", gold: null, jianpu: null, note: "" })).toBe(true);
		expect("error" in readReview({ status: "corrected", gold: { measures: "x" }, jianpu: null })).toBe(true);
	});

	it("refuses an unknown status and a malformed jianpu or note", () => {
		expect("error" in readReview({ status: "done", gold: null, jianpu: null })).toBe(true);
		expect("error" in readReview({ status: "unusable", jianpu: "yes" })).toBe(true);
		expect("error" in readReview({ status: "unusable", jianpu: null, note: 3 })).toBe(true);
		expect("error" in readReview(null)).toBe(true);
	});
});

describe("modelPattern", () => {
	it("draws the stored draft, and says why when it cannot", () => {
		expect(modelPattern({ model: { source: "", draft: makeDefaultPattern(), warnings: [] } }).pattern).not.toBeNull();
		const broken = modelPattern({ model: { source: "", draft: { measures: [] }, warnings: [] } });
		expect(broken.pattern).toBeNull();
		expect(broken.errors.length).toBeGreaterThan(0);
	});
});

describe("isDropped", () => {
	it("is a record the parse cropped but made no draft for", () => {
		expect(isDropped({ model: { source: "", draft: null, warnings: [] } })).toBe(true);
		expect(isDropped({ model: { source: "", draft: makeDefaultPattern(), warnings: [] } })).toBe(false);
	});
});

describe("unplacedChords", () => {
	it("lists the names the model read when no slot carries a chord", () => {
		const draft = { ...makeDefaultPattern(), description: "C F  G7" };
		const record = { model: { source: "", draft, warnings: [] } };
		expect(unplacedChords(record, makeDefaultPattern())).toEqual(["C", "F", "G7"]);
	});

	it("is empty once a slot carries a chord, or when nothing was read", () => {
		const draft = { ...makeDefaultPattern(), description: "C F" };
		const placed = makeDefaultPattern();
		placed.measures[0].slots[0].chord = { root: "C", suffix: "major", voicingId: null };
		expect(unplacedChords({ model: { source: "", draft, warnings: [] } }, placed)).toEqual([]);
		expect(unplacedChords({ model: { source: "", draft: makeDefaultPattern(), warnings: [] } }, null)).toEqual([]);
	});
});

describe("ordering and progress", () => {
	it("sorts by page, then by the crop's own number", () => {
		const items = [item("p0002-r1-10", "unchecked", 2), item("p0002-r1-9", "unchecked", 2), item("p0001-1", "unchecked", 1)];
		expect(items.sort(compareItems).map((i) => i.id)).toEqual(["p0001-1", "p0002-r1-9", "p0002-r1-10"]);
	});

	it("counts every status", () => {
		expect(countStatuses([item("a"), item("b", "confirmed"), item("c", "confirmed"), item("d", "unusable")])).toEqual({
			unchecked: 1,
			confirmed: 2,
			corrected: 0,
			unusable: 1,
		});
	});

	it("moves on to the next unchecked, wrapping round, and stops when none is left", () => {
		const items = [item("a"), item("b", "confirmed"), item("c"), item("d", "corrected")];
		expect(nextUnchecked(items, "a")).toBe("c");
		expect(nextUnchecked(items, "c")).toBe("a");
		expect(nextUnchecked(items, "b")).toBe("c");
		expect(nextUnchecked([item("a", "confirmed"), item("b", "unusable")], "a")).toBeNull();
		expect(nextUnchecked([item("a")], "a")).toBeNull();
	});

	it("gives the neighbours in order", () => {
		const items = [item("a"), item("b"), item("c")];
		expect(neighbours(items, "a")).toEqual({ prev: null, next: "b" });
		expect(neighbours(items, "b")).toEqual({ prev: "a", next: "c" });
		expect(neighbours(items, "x")).toEqual({ prev: null, next: null });
	});
});
