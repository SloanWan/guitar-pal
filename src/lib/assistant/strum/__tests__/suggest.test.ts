import { describe, it, expect } from "vitest";
import { suggestFrom } from "@/lib/assistant/strum/suggest";
import { BLANK } from "@/lib/assistant/blank";
import { explainEditIntent } from "@/lib/assistant/strum/editIntent";
import { readPhrase } from "@/lib/assistant/strum/readPhrase";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

const PATTERNS = [
	{ id: "p-belief", name: "belief" },
	{ id: "p-2", name: "second" },
];

const suggest = (text: string) => suggestFrom(explainEditIntent(text, PATTERNS), readPhrase(text, INDEX));

describe("suggestFrom", () => {
	it("keeps read chords and blanks the missing target", () => {
		const g = suggest("add C G Am F somewhere nice");
		expect(g.text).toContain("C G Am F");
		expect(g.templates).toEqual([
			`add C G Am F to ${BLANK}`,
			`make a pattern called ${BLANK} with C G Am F`,
		]);
	});

	it("keeps a read target and blanks the missing chords", () => {
		const g = suggest("add something to belief please");
		expect(g.templates).toEqual([`add ${BLANK} to belief`]);
	});

	it("blanks both halves of an edit that named neither", () => {
		expect(suggest("add stuff").templates).toEqual([`add ${BLANK} to ${BLANK}`]);
	});

	it("tells a rename and a delete what they were missing", () => {
		expect(suggest("rename something").templates).toEqual([`rename ${BLANK} to ${BLANK}`]);
		expect(suggest("delete it").text).toContain("2");
		expect(suggest("delete it").templates).toEqual([`delete ${BLANK}`]);
	});

	it("turns chords in prose into the sentences that read them", () => {
		const g = suggest("C G Am F but make it dreamy");
		expect(g.templates).toContain("C G Am F");
		expect(g.templates).toContain("C G Am F, D DU UD");
		expect(g.templates).toContain(`add C G Am F to ${BLANK}`);
	});

	it("keeps a rhythm it read", () => {
		const g = suggest("D DU UD but groovier somehow");
		expect(g.text).toContain("D DU UD");
		expect(g.templates).toContain("D DU UD");
		expect(g.templates).toContain(`D DU UD in ${BLANK} bpm`);
	});

	it("keeps a style word it read and asks for the rest", () => {
		const g = suggest("something folk and slow like that song");
		expect(g.text).toContain("folk slow");
		expect(g.templates[0]).toContain("folk slow");
		expect(g.templates.every((t) => t.includes(BLANK))).toBe(true);
	});

	it("offers every kind of sentence when it read nothing at all", () => {
		const g = suggest("what a day");
		expect(g.templates.length).toBeGreaterThanOrEqual(5);
		expect(g.templates).toContain("C G Am F");
		expect(g.templates).toContain("D DU UD");
		expect(g.templates).toContain(`delete ${BLANK}`);
	});

	it("never offers the same sentence twice", () => {
		for (const text of ["C G Am F folk tune", "add C G to nowhere", "what a day"]) {
			const g = suggest(text);
			expect(new Set(g.templates).size, text).toBe(g.templates.length);
		}
	});
});
