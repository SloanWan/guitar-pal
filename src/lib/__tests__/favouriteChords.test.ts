import { describe, expect, it } from "vitest";
import { isFavourite, mergeFavourites, readFavourites, toggleFavourite } from "@/lib/favouriteChords";

describe("favourite chords", () => {
	it("toggles a chord on at the end, and off again", () => {
		const on = toggleFavourite([{ root: "C", suffix: "major" }], "A", "m7");
		expect(on).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "A", suffix: "m7" },
		]);
		expect(isFavourite(on, "A", "m7")).toBe(true);
		expect(toggleFavourite(on, "A", "m7")).toEqual([{ root: "C", suffix: "major" }]);
	});

	it("tells chords apart by root and suffix both", () => {
		const list = [{ root: "A", suffix: "minor" }];
		expect(isFavourite(list, "A", "major")).toBe(false);
		expect(isFavourite(list, "C", "minor")).toBe(false);
	});

	it("keeps an unnamed chord like any other", () => {
		expect(isFavourite(toggleFavourite([], "?", "uk-007707"), "?", "uk-007707")).toBe(true);
	});

	it("reads back only well-formed favourites, each once", () => {
		expect(
			readFavourites([
				{ root: "C", suffix: "major" },
				{ root: "C", suffix: "major" },
				{ root: "", suffix: "major" },
				{ root: "D" },
				"Am",
				null,
				{ root: "E", suffix: "7", extra: 1 },
			]),
		).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "E", suffix: "7" },
		]);
		expect(readFavourites("nope")).toEqual([]);
		expect(readFavourites(null)).toEqual([]);
	});

	it("adds a guest's favourites after the account's, without doubles", () => {
		expect(
			mergeFavourites(
				[{ root: "C", suffix: "major" }],
				[
					{ root: "G", suffix: "major" },
					{ root: "C", suffix: "major" },
				],
			),
		).toEqual([
			{ root: "C", suffix: "major" },
			{ root: "G", suffix: "major" },
		]);
	});
});
