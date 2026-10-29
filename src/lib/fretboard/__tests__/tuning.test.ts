import { describe, it, expect } from "vitest";

import { TUNINGS, TUNING_OFFSET, parseTuning, stringNames } from "@/lib/fretboard/tuning";

describe("tunings", () => {
	it("tunes every string down by the same amount", () => {
		expect(TUNINGS.map((t) => TUNING_OFFSET[t])).toEqual([0, -1, -2]);
	});

	it("names the open strings in flats, the top one in lower case", () => {
		expect(stringNames("standard")).toEqual(["E", "A", "D", "G", "B", "e"]);
		expect(stringNames("halfDown")).toEqual(["Eb", "Ab", "Db", "Gb", "Bb", "eb"]);
		expect(stringNames("wholeDown")).toEqual(["D", "G", "C", "F", "A", "d"]);
	});

	it("reads back a stored tuning, anything else as standard", () => {
		expect(parseTuning("halfDown")).toBe("halfDown");
		expect(parseTuning(null)).toBe("standard");
		expect(parseTuning("dropD")).toBe("standard");
	});
});
