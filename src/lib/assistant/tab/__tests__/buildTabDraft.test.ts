import { describe, expect, it } from "vitest";
import { buildTabDraft, legalSlotsPerBar, type ProposedNote } from "@/lib/assistant/tab/buildTabDraft";
import { DURATION_TICKS, measureCapacity } from "@/lib/fingerpickEdit";
import type { Duration } from "@/lib/fingerpickTypes";

type DraftMeasure = { slots: { duration: Duration; isRest?: boolean; strings: { fret: number | null; muted: boolean }[] }[] };

function measures(result: ReturnType<typeof buildTabDraft>): DraftMeasure[] {
	if (!result.ok) throw new Error(`expected a draft, got: ${result.error}`);
	return result.draft.measures as DraftMeasure[];
}

const note = (string: number, fret: number, slot: number, rest: Partial<ProposedNote> = {}): ProposedNote => ({
	string,
	fret,
	slot,
	...rest,
});

describe("legalSlotsPerBar", () => {
	it("gives the grids that divide 4/4 into one note value each", () => {
		expect(legalSlotsPerBar([4, 4])).toEqual([1, 2, 4, 8, 16, 32]);
	});

	it("counts a compound meter in its own beats, like 3/4", () => {
		expect(legalSlotsPerBar([6, 8])).toEqual([2, 3, 4, 6, 12, 24]);
		expect(legalSlotsPerBar([6, 8])).toEqual(legalSlotsPerBar([3, 4]));
	});

	it("every grid it gives writes a bar of exactly that many slots", () => {
		for (const ts of [[4, 4], [3, 4], [6, 8]] as const) {
			for (const n of legalSlotsPerBar([...ts])) {
				const bar = measures(buildTabDraft({ slotsPerBar: n, bars: [{ notes: [] }], timeSignature: [...ts] }))[0];
				const ticks = bar.slots.reduce((sum, s) => sum + DURATION_TICKS[s.duration], 0);
				expect(ticks).toBe(measureCapacity([...ts]));
			}
		}
	});
});

describe("buildTabDraft", () => {
	it("puts a note on the slot it names, on the string a player would call it", () => {
		const bar = measures(
			buildTabDraft({
				slotsPerBar: 8,
				bars: [{ notes: [note(6, 5, 0), note(1, 8, 4)] }],
				timeSignature: [4, 4],
			}),
		)[0];
		// String 6 is the low E, stored last; string 1 the high e, stored first.
		expect(bar.slots[0].strings[5].fret).toBe(5);
		expect(bar.slots[1].strings[0].fret).toBe(8);
	});

	it("writes eight eighth notes when the grid is eight", () => {
		const notes = Array.from({ length: 8 }, (_, i) => note(3, 5 + i, i));
		const bar = measures(buildTabDraft({ slotsPerBar: 8, bars: [{ notes }], timeSignature: [4, 4] }))[0];
		expect(bar.slots).toHaveLength(8);
		expect(bar.slots.every((s) => s.duration === "eighth")).toBe(true);
		expect(bar.slots.flatMap((s) => s.strings.map((sf) => sf.fret)).filter((f) => f !== null)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
	});

	it("lets a note ring to the next one rather than cutting it to a slot", () => {
		const bar = measures(
			buildTabDraft({ slotsPerBar: 16, bars: [{ notes: [note(5, 0, 0), note(5, 2, 8)] }], timeSignature: [4, 4] }),
		)[0];
		// Two half-bars, not two sixteenths and a heap of rests.
		expect(bar.slots).toHaveLength(2);
		expect(bar.slots.map((s) => s.duration)).toEqual(["half", "half"]);
	});

	it("leads with a rest when nothing falls on the downbeat", () => {
		const bar = measures(
			buildTabDraft({ slotsPerBar: 8, bars: [{ notes: [note(4, 7, 4)] }], timeSignature: [4, 4] }),
		)[0];
		expect(bar.slots[0].isRest).toBe(true);
		expect(bar.slots[0].duration).toBe("half");
	});

	it("keeps two-digit frets whole and apart", () => {
		const bar = measures(
			buildTabDraft({ slotsPerBar: 8, bars: [{ notes: [note(6, 12, 0), note(6, 15, 1)] }], timeSignature: [4, 4] }),
		)[0];
		expect(bar.slots[0].strings[5].fret).toBe(12);
		expect(bar.slots[1].strings[5].fret).toBe(15);
	});

	it("carries a dead note with no fret on it", () => {
		const bar = measures(
			buildTabDraft({ slotsPerBar: 8, bars: [{ notes: [note(5, 0, 0, { muted: true })] }], timeSignature: [4, 4] }),
		)[0];
		expect(bar.slots[0].strings[4]).toMatchObject({ fret: null, muted: true });
	});

	it("writes an empty bar as a bar of rest", () => {
		const bar = measures(buildTabDraft({ slotsPerBar: 8, bars: [{ notes: [] }], timeSignature: [4, 4] }))[0];
		expect(bar.slots).toHaveLength(1);
		expect(bar.slots[0]).toMatchObject({ duration: "whole", isRest: true });
	});

	it("keeps the bars in the order they were written", () => {
		const built = measures(
			buildTabDraft({
				slotsPerBar: 8,
				bars: [{ notes: [note(6, 5, 0)] }, { notes: [note(6, 8, 0)] }, { notes: [note(6, 10, 0)] }],
				timeSignature: [4, 4],
			}),
		);
		expect(built.map((m) => m.slots[0].strings[5].fret)).toEqual([5, 8, 10]);
	});

	const refuses = (input: Parameters<typeof buildTabDraft>[0], match: RegExp) => {
		const r = buildTabDraft(input);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(match);
	};

	it("refuses a grid the meter cannot be divided into", () => {
		refuses({ slotsPerBar: 12, bars: [{ notes: [] }], timeSignature: [4, 4] }, /2, 4, 8, 16 or 32/);
		refuses({ slotsPerBar: 8, bars: [{ notes: [] }], timeSignature: [3, 4] }, /2, 3, 4, 6, 12 or 24/);
	});

	it("refuses a slot outside the bar", () => {
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(1, 0, 8)] }], timeSignature: [4, 4] }, /slot 8.*last one is 7/);
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(1, 0, -1)] }], timeSignature: [4, 4] }, /slot -1/);
	});

	it("refuses a string that is not on the guitar", () => {
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(7, 0, 0)] }], timeSignature: [4, 4] }, /string 7/);
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(0, 0, 0)] }], timeSignature: [4, 4] }, /string 0/);
	});

	it("refuses a fret off the neck", () => {
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(1, 25, 0)] }], timeSignature: [4, 4] }, /fret 25/);
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(1, -1, 0)] }], timeSignature: [4, 4] }, /fret -1/);
	});

	it("refuses two notes on one string at one slot", () => {
		refuses(
			{ slotsPerBar: 8, bars: [{ notes: [note(3, 5, 0), note(3, 7, 0)] }], timeSignature: [4, 4] },
			/two notes on string 3 at slot 0/,
		);
	});

	it("refuses a technique it cannot draw, and takes the ones it can", () => {
		refuses({ slotsPerBar: 8, bars: [{ notes: [note(1, 5, 0, { technique: "tapping" })] }], timeSignature: [4, 4] }, /not a technique/);
		const bar = measures(
			buildTabDraft({
				slotsPerBar: 8,
				bars: [{ notes: [note(3, 5, 0), note(3, 7, 1, { technique: "hammer-on" })] }],
				timeSignature: [4, 4],
			}),
		)[0];
		expect(bar.slots[1].strings[2]).toMatchObject({ fret: 7, technique: "hammer-on" });
	});

	it("refuses a pattern with no bars", () => {
		refuses({ slotsPerBar: 8, bars: [], timeSignature: [4, 4] }, /no bars/);
	});
});
