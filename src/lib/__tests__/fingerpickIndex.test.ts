import { describe, it, expect } from "vitest";

import type { BeatSlot, FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import { indexPattern, spanCovers } from "@/lib/fingerpickIndex";

const silent = (): StringFret => ({ fret: null, muted: false });
const slot = (id: string): BeatSlot => ({
	id,
	duration: "quarter",
	strings: [silent(), silent(), silent(), silent(), silent(), silent()],
});
const pattern = (measures: string[][], spans: FingerpickPattern["spans"]): FingerpickPattern => ({
	id: "p",
	name: "t",
	bpm: 80,
	timeSignature: [4, 4],
	measures: measures.map((ids, i) => ({ id: `m${i}`, slots: ids.map(slot) })),
	spans,
});

describe("indexPattern", () => {
	const p = pattern(
		[
			["a", "b"],
			["c", "d"],
		],
		[
			{ id: "pm", kind: "palmMute", from: "b", to: "c" },
			{ id: "lr", kind: "letRing", from: "a", to: "d", strings: [0] },
			{ id: "bad", kind: "slur", from: "d", to: "a" },
			{ id: "gone", kind: "slur", from: "a", to: "zzz" },
		],
	);
	const index = indexPattern(p);

	it("places every slot", () => {
		expect(index.slotPos.get("c")).toEqual({ measure: 1, slot: 0 });
		expect(index.slotOrder).toEqual(["a", "b", "c", "d"]);
	});

	it("lists the spans at each slot and per measure, skipping reversed or dangling ones", () => {
		expect(index.spansAtSlot.get("b")?.map((s) => s.id)).toEqual(["pm", "lr"]);
		expect(index.spansAtSlot.get("d")?.map((s) => s.id)).toEqual(["lr"]);
		expect(index.spansByMeasure.map((spans) => spans.map((s) => s.id))).toEqual([
			["pm", "lr"],
			["pm", "lr"],
		]);
		expect(index.spanMembers.get("pm")).toEqual(["b", "c"]);
		expect(index.spanMembers.get("bad")).toEqual([]);
		expect(index.spanMembers.get("gone")).toEqual([]);
	});

	it("spanCovers honours the span's string list", () => {
		expect(spanCovers(index, "a", "letRing", 0)).toBe(true);
		expect(spanCovers(index, "a", "letRing", 3)).toBe(false);
		expect(spanCovers(index, "c", "palmMute", 5)).toBe(true);
		expect(spanCovers(index, "a", "palmMute", 5)).toBe(false);
	});
});
