import { describe, it, expect } from "vitest";
import { citedPage, openSide, sideKey, type SideView } from "@/components/books/book/useBookSide";
import type { OpenDraft } from "@/components/books/panel/DraftPanel";

const draft = {
	chapterId: "c1",
	exercise: { id: "e1", page: 62 },
	pattern: { name: "Exercise 3" },
	onTaken: () => {},
} as unknown as OpenDraft;

const source: SideView = {
	kind: "source",
	source: { chapterId: "c1", page: 62, pages: [62], title: "Exercise 3" },
	back: draft,
};

describe("openSide", () => {
	it("moves in from nothing, and only swaps what an open panel shows", () => {
		const first = openSide(null, { kind: "draft", draft });
		expect(first).toEqual({ view: { kind: "draft", draft }, entered: true });
		expect(openSide(first, source)).toEqual({ view: source, entered: false });
	});
});

describe("sideKey", () => {
	it("tells drafts, pages and text tabs apart, and pages by where they open", () => {
		expect(sideKey({ kind: "draft", draft })).toBe("draft:e1");
		expect(sideKey(source)).toBe("source:c1:Exercise 3:62");
		expect(sideKey({ kind: "textTab", page: 63 })).toBe("text-tab:63");
	});
});

describe("citedPage", () => {
	it("opens the one page an answer cited", () => {
		expect(citedPage({ bookId: "b1", chapterId: "c1", page: 61 })).toEqual({
			chapterId: "c1",
			page: 61,
			pages: [61],
			title: "p.61",
		});
	});
});
