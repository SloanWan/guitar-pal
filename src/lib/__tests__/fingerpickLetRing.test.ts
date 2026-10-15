import { describe, expect, it } from "vitest";

import { withLetRingAll } from "@/lib/fingerpickLetRing";
import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";

function makeSlot(overrides: Partial<BeatSlot> = {}): BeatSlot {
	const sf = (fret: number | null) =>
		({ fret, muted: false }) as BeatSlot["strings"][number];
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
	it("puts one let-ring span over every slot, first to last, keeping other spans", () => {
		const out = withLetRingAll({ ...makePattern(), spans: [{ id: "pm", kind: "palmMute", from: "slot", to: "s2" }, { id: "old", kind: "letRing", from: "s2", to: "s2" }] });
		expect(out.spans).toEqual([
			{ id: "pm", kind: "palmMute", from: "slot", to: "s2" },
			{ id: "letRing:slot", kind: "letRing", from: "slot", to: "s3" },
		]);
	});

	it("does not mutate the input pattern", () => {
		const input = makePattern();
		withLetRingAll(input);
		expect(input.spans).toBeUndefined();
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
