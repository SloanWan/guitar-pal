import { describe, it, expect } from "vitest";
import { libraryEmptyText, libraryGroups } from "@/lib/patternLibrary";
import { PRESET_STRUM_PATTERNS, type StrumPattern } from "@/lib/strumPatterns";

const mine: StrumPattern[] = [
	{ id: "m1", name: "Folk Two", beats: [["D", ""]] },
	{ id: "m2", name: "Reggae", beats: [["", "U"]] },
];
const WORDS = { noun: "pattern", mine: "Patterns you make or save show up here." };

describe("libraryGroups", () => {
	it("holds the player's own and the presets apart, in their own order", () => {
		const groups = libraryGroups(mine, PRESET_STRUM_PATTERNS, [], "all", "");
		expect(groups.mine.map((p) => p.id)).toEqual(["m1", "m2"]);
		expect(groups.presets).toEqual(PRESET_STRUM_PATTERNS);
	});

	it("keeps both groups to favourites", () => {
		const fav = PRESET_STRUM_PATTERNS[2].id;
		const groups = libraryGroups(mine, PRESET_STRUM_PATTERNS, ["m2", fav], "favs", "");
		expect(groups.mine.map((p) => p.id)).toEqual(["m2"]);
		expect(groups.presets.map((p) => p.id)).toEqual([fav]);
	});

	it("narrows both by name, whatever the case", () => {
		const groups = libraryGroups(mine, PRESET_STRUM_PATTERNS, [], "all", "  folk ");
		expect(groups.mine.map((p) => p.id)).toEqual(["m1"]);
		expect(groups.presets.every((p) => p.name.toLowerCase().includes("folk"))).toBe(true);
	});
});

describe("libraryEmptyText", () => {
	it("says why a group is empty, in the library's own words", () => {
		expect(libraryEmptyText("mine", "all", "", WORDS)).toBe(WORDS.mine);
		expect(libraryEmptyText("mine", "favs", "", WORDS)).toBe("Tap the pick beside one of your patterns to keep it here.");
		expect(libraryEmptyText("presets", "favs", "", WORDS)).toBe("Tap the pick beside a preset to keep it here.");
		expect(libraryEmptyText("presets", "all", "zz", WORDS)).toBe("No pattern matches.");
	});
});
