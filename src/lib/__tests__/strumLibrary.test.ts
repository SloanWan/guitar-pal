import { describe, it, expect } from "vitest";
import { libraryEmptyText, libraryPatterns } from "@/lib/strumLibrary";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";

const mine: StrumPattern[] = [
	{ id: "m1", name: "Folk Two", beats: [["D", ""]] },
	{ id: "m2", name: "Reggae", beats: [["", "U"]] },
];

describe("libraryPatterns", () => {
	it("lists the player's own before the presets", () => {
		const all = libraryPatterns(mine, [], "all", "");
		expect(all.slice(0, 2).map((p) => p.id)).toEqual(["m1", "m2"]);
		expect(all).toHaveLength(mine.length + PRESET_STRUM_PATTERNS.length);
	});

	it("keeps to the player's own under Mine", () => {
		expect(libraryPatterns(mine, [], "mine", "").map((p) => p.id)).toEqual(["m1", "m2"]);
	});

	it("keeps to favourites, presets included", () => {
		const fav = PRESET_STRUM_PATTERNS[2].id;
		expect(libraryPatterns(mine, ["m2", fav], "favs", "").map((p) => p.id)).toEqual(["m2", fav]);
	});

	it("narrows by name, whatever the case", () => {
		expect(libraryPatterns(mine, [], "all", "  folk ").map((p) => p.id)).toEqual(["m1"]);
	});
});

describe("libraryEmptyText", () => {
	it("says why the list is empty", () => {
		expect(libraryEmptyText("favs", "")).toMatch(/pick/);
		expect(libraryEmptyText("mine", "")).toMatch(/make or save/);
		expect(libraryEmptyText("all", "zz")).toBe("No pattern matches.");
	});
});
