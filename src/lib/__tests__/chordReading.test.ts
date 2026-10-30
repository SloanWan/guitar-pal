import { describe, it, expect } from "vitest";
import { readQuery } from "@/lib/chordReading";
import { buildChordLookup } from "@/lib/chordBatchResolve";
import type { ChordIndexEntry } from "@/lib/chordSearch";

const index: ChordIndexEntry[] = [
	{ root: "C", suffix: "major" },
	{ root: "C", suffix: "maj7" },
	{ root: "A", suffix: "minor" },
	{ root: "F", suffix: "major" },
	{ root: "G", suffix: "major" },
];
const read = (q: string) => readQuery(q, index, buildChordLookup(index));

describe("readQuery", () => {
	it("reads nothing typed as empty", () => {
		expect(read("  ").kind).toBe("empty");
	});

	it("reads six frets, typed first string first, as a shape held low E first", () => {
		expect(read("01023x")).toEqual({ kind: "shape", frets: ["x", 3, 2, 0, 1, 0] });
	});

	it("reads several chords as a board", () => {
		const reading = read("C Am F G");
		expect(reading.kind).toBe("batch");
		if (reading.kind === "batch") expect(reading.tokens.map((t) => t.status)).toEqual(["resolved", "resolved", "resolved", "resolved"]);
	});

	it("reads a name as the chords it could be, best first", () => {
		const reading = read("Cmaj7");
		expect(reading.kind).toBe("names");
		if (reading.kind === "names") expect(reading.results[0]).toMatchObject({ root: "C", suffix: "maj7" });
	});

	it("offers a jump for a bare root", () => {
		const reading = read("C");
		expect(reading.kind).toBe("names");
		if (reading.kind === "names") expect(reading.shortcut).toEqual({ kind: "root", root: "C" });
	});

	it("says when nothing is called that", () => {
		expect(read("Hm7").kind).toBe("none");
	});
});
