import { beforeEach, describe, expect, it } from "vitest";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import {
	clearEditorDraft,
	editorHref,
	isEditorDirty,
	readEditorDraft,
	readEditorEntry,
	returnHref,
	stashEditorDraft,
	type EditorDraft,
} from "@/lib/tabEditorEntry";

function draft(): EditorDraft {
	const pattern = { ...makeDefaultPattern(), name: "Travis in C" };
	return { pattern, notice: { title: "Check this tab", text: "Made from what you asked for.", warnings: ["Bar 1 was short."] } };
}

describe("editorHref / readEditorEntry", () => {
	it("round-trips every entry through the editor's address", () => {
		const entries = [
			{ kind: "new" },
			{ kind: "edit", id: "a1b2" },
			{ kind: "draft", token: "t-1" },
			{ kind: "draft", token: "t-2", from: "/books/b9" },
			{ kind: "edit", id: "a1b2", from: "/books/b9" },
		] as const;
		for (const entry of entries) {
			const url = new URL(editorHref(entry), "https://x.test");
			const id = url.pathname.split("/").pop()!;
			expect(readEditorEntry(id, url.searchParams)).toEqual({ from: undefined, ...entry });
		}
	});

	it("leaves the reader out of the address, since it is where the editor goes back to anyway", () => {
		expect(editorHref({ kind: "new", from: "/fingerpick" })).toBe("/fingerpick/edit/new");
		expect(editorHref({ kind: "edit", id: "x" })).toBe("/fingerpick/edit/x");
		expect(editorHref({ kind: "draft", token: "t" })).toBe("/fingerpick/edit/new?draft=t");
	});
});

describe("returnHref", () => {
	it("goes back to the reader by default, opened on what was saved", () => {
		expect(returnHref(undefined)).toBe("/fingerpick");
		expect(returnHref(undefined, "p-7")).toBe("/fingerpick?pattern=p-7");
	});

	it("goes back to a book's page as it was, saved or not", () => {
		expect(returnHref("/books/b9")).toBe("/books/b9");
		expect(returnHref("/books/b9", "p-7")).toBe("/books/b9");
	});

	it("never leaves the site", () => {
		expect(returnHref("//evil.test")).toBe("/fingerpick");
		expect(returnHref("https://evil.test")).toBe("/fingerpick");
		expect(returnHref("/\\evil.test", "p")).toBe("/fingerpick?pattern=p");
	});
});

describe("isEditorDirty", () => {
	it("is clean until something differs from what was opened", () => {
		const opened = makeDefaultPattern();
		const pristine = JSON.stringify(opened);
		expect(isEditorDirty(pristine, opened)).toBe(false);
		expect(isEditorDirty(pristine, { ...opened })).toBe(false);
		expect(isEditorDirty(pristine, { ...opened, name: "x" })).toBe(true);
		expect(isEditorDirty(pristine, { ...opened, measures: [...opened.measures, opened.measures[0]] })).toBe(true);
	});
});

describe("the draft stash", () => {
	beforeEach(() => sessionStorage.clear());

	it("hands a draft over under its token and keeps it for a reload", () => {
		const d = draft();
		const token = stashEditorDraft(d, "tok");
		expect(token).toBe("tok");
		const read = readEditorDraft("tok");
		expect(read?.pattern.id).toBe(d.pattern.id);
		expect(read?.pattern.name).toBe("Travis in C");
		expect(read?.notice).toEqual(d.notice);
		expect(readEditorDraft("tok")).not.toBeNull();
	});

	it("carries a book's page", () => {
		stashEditorDraft({ ...draft(), book: { bookId: "b", exerciseId: "e", cropPath: null, page: 37 } }, "tok");
		expect(readEditorDraft("tok")?.book).toEqual({ bookId: "b", exerciseId: "e", cropPath: null, page: 37 });
	});

	it("reads nothing for another token, a broken stash or a pattern the validator refuses", () => {
		stashEditorDraft(draft(), "tok");
		expect(readEditorDraft("other")).toBeNull();
		sessionStorage.setItem("guitarpal:tabEditorDraft", "{not json");
		expect(readEditorDraft("tok")).toBeNull();
		sessionStorage.setItem(
			"guitarpal:tabEditorDraft",
			JSON.stringify({ token: "tok", draft: { pattern: { measures: [] }, notice: { title: "t", text: "x" } } }),
		);
		expect(readEditorDraft("tok")).toBeNull();
	});

	it("is gone once cleared, and a new draft replaces the old", () => {
		stashEditorDraft(draft(), "one");
		stashEditorDraft(draft(), "two");
		expect(readEditorDraft("one")).toBeNull();
		expect(readEditorDraft("two")).not.toBeNull();
		clearEditorDraft();
		expect(readEditorDraft("two")).toBeNull();
	});
});
