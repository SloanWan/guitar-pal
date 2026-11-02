import { describe, expect, it } from "vitest";
import { agreement, readPageReview, shownKind } from "../pageGold";

const answer = (over: Record<string, unknown> = {}) => ({
	decision: "answer",
	kind: "mixed",
	notation: ["tab", "jianpu"],
	exercises: 3,
	note: "",
	...over,
});

describe("readPageReview", () => {
	it("confirms the model's kind and corrects any other", () => {
		expect(readPageReview(answer(), "mixed")).toEqual({
			review: { status: "confirmed", kind: "mixed", notation: ["tab", "jianpu"], exercises: 3, note: "" },
		});
		expect(readPageReview(answer({ kind: "tab" }), "mixed")).toMatchObject({ review: { status: "corrected", kind: "tab" } });
		// A page the classifier failed on: any answer corrects it.
		expect(readPageReview(answer(), "error")).toMatchObject({ review: { status: "corrected" } });
	});

	it("needs a count when the page has tab, and gives none without", () => {
		expect(readPageReview(answer({ exercises: null }), "mixed")).toEqual({
			error: "A page with tab needs its exercise count, 0 to 40.",
		});
		expect(readPageReview(answer({ exercises: 2.5 }), "mixed")).toHaveProperty("error");
		expect(readPageReview(answer({ exercises: 41 }), "mixed")).toHaveProperty("error");
		expect(readPageReview(answer({ kind: "prose", notation: [], exercises: 7 }), "prose")).toMatchObject({
			review: { exercises: 0, notation: [] },
		});
	});

	it("keeps the notation in the list's order, each once", () => {
		const read = readPageReview(answer({ notation: ["staff", "tab", "staff"] }), "mixed");
		expect(read).toMatchObject({ review: { notation: ["tab", "staff"] } });
	});

	it("refuses what it does not know", () => {
		expect(readPageReview(answer({ kind: "poem" }), "mixed")).toEqual({ error: "Unknown kind: poem" });
		expect(readPageReview(answer({ notation: ["neumes"] }), "mixed")).toHaveProperty("error");
		expect(readPageReview(answer({ decision: "maybe" }), "mixed")).toEqual({ error: "Unknown decision: maybe" });
		expect(readPageReview(null, "mixed")).toHaveProperty("error");
	});

	it("sets a page aside or undoes its review with no answer", () => {
		expect(readPageReview({ decision: "unusable", note: "cut off" }, "tab")).toEqual({
			review: { status: "unusable", kind: null, notation: [], exercises: null, note: "cut off" },
		});
		expect(readPageReview({ decision: "unchecked" }, "tab")).toMatchObject({ review: { status: "unchecked" } });
	});
});

describe("shownKind", () => {
	it("is the answer once there is one, else the model's", () => {
		expect(shownKind({ kind: "tab", model: { kind: "mixed", regions: [], note: "", source: "" } })).toBe("tab");
		expect(shownKind({ kind: null, model: { kind: "mixed", regions: [], note: "", source: "" } })).toBe("mixed");
		expect(shownKind({ kind: null, model: { kind: "error", regions: [], note: "", source: "" } })).toBeNull();
	});
});

describe("agreement", () => {
	it("counts the answered pages that kept the model's kind", () => {
		const items = [{ status: "confirmed" }, { status: "corrected" }, { status: "unusable" }, { status: "unchecked" }] as const;
		expect(agreement(items)).toEqual({ kept: 1, answered: 2 });
	});
});
