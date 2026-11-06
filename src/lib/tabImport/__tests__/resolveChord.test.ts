import { describe, expect, it } from "vitest";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { hasChordNames, resolveChordName, resolveDraftChordNames } from "@/lib/tabImport";

/** A one-bar raw draft whose slots carry the given extra fields. */
function draft(...slots: Record<string, unknown>[]): { measures: { slots: Record<string, unknown>[] }[] } {
	const strings = Array.from({ length: 6 }, () => ({ fret: null, muted: false }));
	return { measures: [{ slots: slots.map((s) => ({ duration: "quarter", strings, ...s })) }] };
}

describe("resolveChordName", () => {
	it("reads a printed name exactly, then by the picker's best match", () => {
		expect(resolveChordName("Am", INDEX)).toEqual({ root: "A", suffix: "minor", voicingId: null });
		expect(resolveChordName(" G7 ", INDEX)).toEqual({ root: "G", suffix: "7", voicingId: null });
		expect(resolveChordName("C2", INDEX)).toMatchObject({ root: "C" });
	});

	it("keeps a chord of a known kind whose root the library has no shape for", () => {
		// The tables hold two power chords; the nearest match for E5 would be Emaj7#5.
		expect(INDEX.some((e) => e.root === "E" && e.suffix === "5")).toBe(false);
		expect(resolveChordName("E5", INDEX)).toEqual({ root: "E", suffix: "5", voicingId: null });
	});

	it("reads N.C. as the no-chord mark", () => {
		expect(resolveChordName("N.C.", INDEX)).toEqual({ root: "N.C.", suffix: "" });
		expect(resolveChordName("nc", INDEX)).toEqual({ root: "N.C.", suffix: "" });
	});

	it("names no chord for a bare number, an empty word or a word the library lacks", () => {
		expect(resolveChordName("5", INDEX)).toBeNull();
		expect(resolveChordName("  ", INDEX)).toBeNull();
		expect(resolveChordName("Zm", INDEX)).toBeNull();
	});
});

describe("resolveDraftChordNames", () => {
	it("puts the chord on the slot, drops the name and warns for one it cannot place", () => {
		const raw = draft({ chordName: "Am" }, {}, { chordName: "Zm" }, { chordName: "N.C." });
		expect(hasChordNames(raw)).toBe(true);
		const { draft: out, warnings } = resolveDraftChordNames(raw, INDEX);
		const slots = (out as ReturnType<typeof draft>).measures[0].slots;
		expect(slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
		expect(slots.every((s) => !("chordName" in s))).toBe(true);
		expect(slots[2].chord).toBeUndefined();
		expect(slots[3].chord).toEqual({ root: "N.C.", suffix: "" });
		expect(warnings).toEqual([
			expect.objectContaining({ code: "UNKNOWN_CHORD", path: "measures[0].slots[2].chordName", original: "Zm" }),
		]);
		expect(raw.measures[0].slots[0].chordName).toBe("Am"); // the input is left as it was
	});

	it("keeps a chord the slot already carries, and passes a draft without names through", () => {
		const held = { root: "C", suffix: "major", voicingId: "c1" };
		const { draft: out } = resolveDraftChordNames(draft({ chordName: "Am", chord: held }), INDEX);
		expect((out as ReturnType<typeof draft>).measures[0].slots[0].chord).toEqual(held);
		const plain = draft({});
		expect(hasChordNames(plain)).toBe(false);
		expect(resolveDraftChordNames(plain, INDEX).draft).toBe(plain);
		expect(hasChordNames({ measures: "nope" })).toBe(false);
	});
});
