import { describe, expect, it } from "vitest";
import { makeEmptySlot, setFret } from "@/lib/fingerpickEdit";
import type { Duration, FingerpickPattern } from "@/lib/fingerpickTypes";
import { applyDuration, barFill, durationChoices, lengthInWords, tripletChoice } from "@/lib/tabEditorTools";

function tab(durations: Duration[], ts: [number, number] = [4, 4]): FingerpickPattern {
	return { id: "t", name: "T", bpm: 90, timeSignature: ts, measures: [{ id: "m", slots: durations.map((d) => makeEmptySlot(d)) }] };
}
const first = { measureIndex: 0, slotIndex: 0 };
const kinds = (p: FingerpickPattern, at = first) =>
	Object.fromEntries(durationChoices(p, at).map((c) => [c.duration, c.kind]));

describe("durationChoices", () => {
	it("splits a quarter down and merges it up with the quarters after it", () => {
		const k = kinds(tab(["quarter", "quarter", "quarter", "quarter"]));
		expect(k.quarter).toBe("current");
		expect(k.eighth).toBe("split");
		expect(k.sixteenth).toBe("split");
		expect(k.half).toBe("merge");
		expect(k.whole).toBe("merge");
		// 24 ticks do not split into 18s, nor do 24 + 24 make 36.
		expect(k["dotted-eighth"]).toBe("off");
		expect(k["dotted-quarter"]).toBe("off");
	});

	it("says why a value is out of reach", () => {
		const last = durationChoices(tab(["quarter", "quarter", "quarter", "quarter"]), { measureIndex: 0, slotIndex: 3 });
		const half = last.find((c) => c.duration === "half");
		expect(half).toMatchObject({ kind: "off" });
		expect(half && "reason" in half ? half.reason : "").toMatch(/don't add up/);
	});

	it("leaves a triplet to its own switch", () => {
		const p = tab(["eighth-triplet", "eighth-triplet", "eighth-triplet", "quarter", "half"]);
		expect(durationChoices(p, first).every((c) => c.kind === "off")).toBe(true);
	});
});

describe("tripletChoice", () => {
	it("offers a quarter's triplet, and the way back from a group's first note", () => {
		expect(tripletChoice(tab(["quarter", "quarter", "half"]), first)).toEqual({ kind: "on", duration: "eighth-triplet" });
		const group = tab(["eighth-triplet", "eighth-triplet", "eighth-triplet", "quarter", "half"]);
		expect(tripletChoice(group, first)).toEqual({ kind: "off", duration: "quarter" });
		expect(tripletChoice(group, { measureIndex: 0, slotIndex: 1 }).kind).toBe("blocked");
	});

	it("is hidden in a compound meter, where the beat already divides in three", () => {
		expect(tripletChoice(tab(["dotted-quarter", "dotted-quarter"], [6, 8]), first)).toEqual({ kind: "hidden" });
	});
});

describe("applyDuration", () => {
	it("splits a quarter into two eighths, the first keeping the note", () => {
		const p = setFret(tab(["quarter", "quarter", "half"]), { ...first, stringIndex: 2 }, 5);
		const out = applyDuration(p, first, "eighth", "split");
		if (out.type !== "ok") throw new Error("asked");
		expect(out.pattern.measures[0].slots.map((s) => s.duration)).toEqual(["eighth", "eighth", "quarter", "half"]);
		expect(out.pattern.measures[0].slots[0].strings[2].fret).toBe(5);
	});

	it("merges silently over empty slots, and asks before dropping notes", () => {
		const empty = applyDuration(tab(["quarter", "quarter", "half"]), first, "half", "merge");
		expect(empty.type).toBe("ok");
		const full = setFret(tab(["quarter", "quarter", "half"]), { measureIndex: 0, slotIndex: 1, stringIndex: 0 }, 3);
		const asked = applyDuration(full, first, "half", "merge");
		expect(asked).toMatchObject({ type: "confirm", dropped: 1 });
		expect(asked.pattern.measures[0].slots.map((s) => s.duration)).toEqual(["half", "half"]);
	});
});

describe("barFill", () => {
	it("says a bar is full, short or over, in note values", () => {
		expect(barFill(tab(["half", "half"]).measures[0], [4, 4])).toEqual({ kind: "full", text: "Full" });
		expect(barFill(tab(["half", "quarter", "eighth"]).measures[0], [4, 4])).toEqual({ kind: "short", text: "Short by an eighth" });
		expect(barFill(tab(["whole", "quarter"]).measures[0], [3, 4]).text).toBe("Over by a half");
		expect(lengthInWords(36)).toBe("a quarter and an eighth");
	});
});
