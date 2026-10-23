import { describe, expect, it } from "vitest";
import { NAV_ITEMS, TAB_ITEMS, navKeyForPath, tabKeyForPath } from "@/lib/navigation";
import { moduleForPath } from "@/lib/moduleForPath";

describe("navKeyForPath", () => {
	it.each([
		["/", "home"],
		["/home", "home"],
		["/strum", "strum"],
		["/fingerpick", "tab"],
		["/fingerpick/edit/abc", "tab"],
		["/chords/my", "chords"],
		["/fretboard", "fretboard"],
		["/books/sample", "books"],
	])("%s → %s", (path, key) => {
		expect(navKeyForPath(path)).toBe(key);
	});

	it("has no item for settings, auth, a share link or the docs", () => {
		for (const path of ["/settings", "/auth", "/p/xyz", "/docs/assistant-grammar"]) expect(navKeyForPath(path)).toBeNull();
	});

	it("matches a prefix only at a segment boundary", () => {
		expect(navKeyForPath("/strumming")).toBeNull();
		expect(navKeyForPath("/homepage")).toBeNull();
	});
});

describe("tabKeyForPath", () => {
	it.each([
		["/", "home"],
		["/strum", "strum"],
		["/fingerpick/edit/abc", "tab"],
		["/chords/all", "chords"],
		["/settings", "me"],
		["/auth", "me"],
		["/books", "more"],
		["/books/sample/chapter/3", "more"],
		["/fretboard", "more"],
	])("%s → %s", (path, key) => {
		expect(tabKeyForPath(path)).toBe(key);
	});

	it("leaves a share link without a tab", () => {
		expect(tabKeyForPath("/p/xyz")).toBeNull();
	});
});

describe("the items", () => {
	it("wear the module of the page they open", () => {
		for (const item of [...NAV_ITEMS, ...TAB_ITEMS.filter((t) => t.key !== "me")]) {
			expect(item.module).toBe(moduleForPath(item.href));
		}
	});
	it("put five tabs on the phone, without Books or Fretboard", () => {
		expect(TAB_ITEMS.map((t) => t.label)).toEqual(["Home", "Strum", "Tab", "Chords", "Me"]);
	});
});
