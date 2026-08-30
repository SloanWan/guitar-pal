import { describe, expect, it } from "vitest";

import { withLetRingAll } from "@/lib/fingerpickLetRing";
import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";

function makeSlot(overrides: Partial<BeatSlot> = {}): BeatSlot {
	const sf = (fret: number | null) =>
		({ fret, technique: null, tied: false, muted: false }) as BeatSlot["strings"][number];
	return {
		id: "slot",
		duration: "quarter",
		strings: [sf(0), sf(null), sf(2), sf(null), sf(null), sf(3)],
		...overrides,
	};
}

function makePattern(): FingerpickPattern {
	return {
		id: "p1",
		name: "Test",
		description: "desc",
		bpm: 90,
		timeSignature: [4, 4],
		measures: [
			{ id: "m1", slots: [makeSlot(), makeSlot({ id: "s2", duration: "eighth" })] },
			{ id: "m2", slots: [makeSlot({ id: "s3" })] },
		],
	};
}

describe("withLetRingAll", () => {
	it("forces letRing on every string of every slot", () => {
		const out = withLetRingAll(makePattern());
		for (const measure of out.measures) {
			for (const slot of measure.slots) {
				for (const sf of slot.strings) {
					expect(sf.letRing).toBe(true);
				}
			}
		}
	});

	it("does not mutate the input pattern", () => {
		const input = makePattern();
		withLetRingAll(input);
		for (const measure of input.measures) {
			for (const slot of measure.slots) {
				for (const sf of slot.strings) {
					expect(sf.letRing).toBeUndefined();
				}
			}
		}
	});

	it("preserves all non-letRing fields (fret, duration, ids, meta)", () => {
		const input = makePattern();
		const out = withLetRingAll(input);
		expect(out.id).toBe(input.id);
		expect(out.name).toBe(input.name);
		expect(out.bpm).toBe(input.bpm);
		expect(out.timeSignature).toEqual(input.timeSignature);
		expect(out.measures.map((m) => m.id)).toEqual(input.measures.map((m) => m.id));
		expect(out.measures[0].slots[1].duration).toBe("eighth");
		expect(out.measures[0].slots[0].strings.map((sf) => sf.fret)).toEqual([0, null, 2, null, null, 3]);
	});

	it("keeps the 6-string tuple length on every slot", () => {
		const out = withLetRingAll(makePattern());
		for (const measure of out.measures) {
			for (const slot of measure.slots) {
				expect(slot.strings).toHaveLength(6);
			}
		}
	});
});
