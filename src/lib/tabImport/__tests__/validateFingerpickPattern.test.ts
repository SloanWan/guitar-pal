import { describe, it, expect } from "vitest";
import { validateFingerpickPattern } from "../validateFingerpickPattern";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSf(overrides: Record<string, unknown> = {}) {
	return { fret: null, technique: null, tied: false, muted: false, ...overrides };
}

function makeStrings(overrides: Record<number, Record<string, unknown>> = {}) {
	return Array.from({ length: 6 }, (_, i) => makeSf(overrides[i] ?? {}));
}

function makeSlot(overrides: Record<string, unknown> = {}) {
	return { id: "s1", duration: "quarter", strings: makeStrings(), ...overrides };
}

function makeMeasure(slots: unknown[] = [makeSlot()], id = "m1") {
	return { id, slots };
}

function makePattern(overrides: Record<string, unknown> = {}) {
	return {
		id: "p1",
		name: "Test",
		bpm: 120,
		timeSignature: [4, 4],
		measures: [makeMeasure()],
		...overrides,
	};
}

// ─── Gross failures ───────────────────────────────────────────────────────────

describe("validateFingerpickPattern — gross failures", () => {
	it("returns pattern:null + error when input is not an object", () => {
		for (const bad of [null, 42, "string", true, [1, 2]]) {
			const { pattern, errors } = validateFingerpickPattern(bad);
			expect(pattern, String(bad)).toBeNull();
			expect(errors.some((e) => e.code === "NOT_AN_OBJECT"), String(bad)).toBe(true);
		}
	});

	it("returns pattern:null + error when measures is not an array", () => {
		const { pattern, errors } = validateFingerpickPattern({ measures: "bad" });
		expect(pattern).toBeNull();
		expect(errors[0].code).toBe("MEASURES_NOT_ARRAY");
	});

	it("returns pattern:null + error when measures array is empty", () => {
		const { pattern, errors } = validateFingerpickPattern({ measures: [] });
		expect(pattern).toBeNull();
		expect(errors[0].code).toBe("ZERO_MEASURES");
	});
});

// ─── Pattern-level defaults ───────────────────────────────────────────────────

describe("validateFingerpickPattern — pattern-level defaults", () => {
	it("defaults bpm to 80 when missing and adds a warning", () => {
		const { pattern, warnings } = validateFingerpickPattern(
			makePattern({ bpm: undefined }),
		);
		expect(pattern?.bpm).toBe(80);
		expect(warnings.some((w) => w.code === "INVALID_BPM")).toBe(true);
	});

	it("defaults bpm to 80 when negative", () => {
		const { pattern } = validateFingerpickPattern(makePattern({ bpm: -10 }));
		expect(pattern?.bpm).toBe(80);
	});

	it("defaults timeSignature to [4,4] when missing and warns", () => {
		const { pattern, warnings } = validateFingerpickPattern(
			makePattern({ timeSignature: undefined }),
		);
		expect(pattern?.timeSignature).toEqual([4, 4]);
		expect(warnings.some((w) => w.code === "INVALID_TIME_SIGNATURE")).toBe(true);
	});

	it("generates an id when missing", () => {
		const { pattern } = validateFingerpickPattern(makePattern({ id: undefined }));
		expect(typeof pattern?.id).toBe("string");
		expect(pattern?.id.length).toBeGreaterThan(0);
	});

	it("preserves valid pattern-level fields", () => {
		const raw = makePattern({ bpm: 140, timeSignature: [3, 4], name: "Waltz" });
		const { pattern } = validateFingerpickPattern(raw);
		expect(pattern?.bpm).toBe(140);
		expect(pattern?.timeSignature).toEqual([3, 4]);
		expect(pattern?.name).toBe("Waltz");
	});
});

// ─── Fret clamping ────────────────────────────────────────────────────────────

describe("validateFingerpickPattern — fret clamping", () => {
	it("clamps fret > 24 to 24 and warns", () => {
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings: makeStrings({ 0: { fret: 25 } }) })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[0].fret).toBe(24);
		expect(warnings.some((w) => w.code === "FRET_CLAMPED")).toBe(true);
	});

	it("clamps fret < 0 to 0 and warns", () => {
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings: makeStrings({ 2: { fret: -3 } }) })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[2].fret).toBe(0);
		expect(warnings.some((w) => w.code === "FRET_CLAMPED")).toBe(true);
	});

	it("passes fret values in [0, 24] through unchanged", () => {
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings: makeStrings({ 0: { fret: 0 }, 1: { fret: 12 }, 2: { fret: 24 } }) })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[0].fret).toBe(0);
		expect(pattern?.measures[0].slots[0].strings[1].fret).toBe(12);
		expect(pattern?.measures[0].slots[0].strings[2].fret).toBe(24);
		expect(warnings.filter((w) => w.code === "FRET_CLAMPED")).toHaveLength(0);
	});
});

// ─── Duration defaults ────────────────────────────────────────────────────────

describe("validateFingerpickPattern — duration defaults", () => {
	it("defaults an individual invalid duration to 'eighth' and warns", () => {
		const raw = makePattern({
			measures: [
				makeMeasure([
					makeSlot({ duration: "quarter" }),
					makeSlot({ duration: "bad-duration" }),
				]),
			],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[1].duration).toBe("eighth");
		expect(warnings.some((w) => w.code === "INVALID_DURATION")).toBe(true);
	});

	it("assigns uniform 'quarter' for 4 slots all missing duration in 4/4 and warns", () => {
		const slots = Array.from({ length: 4 }, (_, i) =>
			({ id: `s${i}`, strings: makeStrings() }),
		);
		const raw = makePattern({ measures: [{ id: "m1", slots }] });
		const { pattern, warnings } = validateFingerpickPattern(raw);
		for (const slot of pattern!.measures[0].slots) {
			expect(slot.duration).toBe("quarter");
		}
		expect(warnings.some((w) => w.code === "UNIFORM_DURATION_ASSIGNED")).toBe(true);
	});

	it("assigns uniform 'eighth' for 8 slots all missing duration in 4/4", () => {
		const slots = Array.from({ length: 8 }, (_, i) =>
			({ id: `s${i}`, strings: makeStrings() }),
		);
		const raw = makePattern({ measures: [{ id: "m1", slots }] });
		const { pattern } = validateFingerpickPattern(raw);
		for (const slot of pattern!.measures[0].slots) {
			expect(slot.duration).toBe("eighth");
		}
	});

	it("falls back to 'eighth' when slot count has no clean division", () => {
		// 5 slots in 4/4: 32 ticks / 5 = 6.4 — no clean Duration
		const slots = Array.from({ length: 5 }, (_, i) =>
			({ id: `s${i}`, strings: makeStrings() }),
		);
		const raw = makePattern({ measures: [{ id: "m1", slots }] });
		const { pattern } = validateFingerpickPattern(raw);
		for (const slot of pattern!.measures[0].slots) {
			expect(slot.duration).toBe("eighth");
		}
	});
});

// ─── Strings tuple normalization ──────────────────────────────────────────────

describe("validateFingerpickPattern — strings normalization", () => {
	it("truncates a 7-element strings array to 6 and warns", () => {
		const strings7 = [...makeStrings(), makeSf({ fret: 5 })];
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings: strings7 })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings).toHaveLength(6);
		expect(warnings.some((w) => w.code === "INVALID_STRINGS_TUPLE")).toBe(true);
	});

	it("pads a 3-element strings array with silent entries to 6 and warns", () => {
		const strings3 = makeStrings().slice(0, 3);
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings: strings3 })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings).toHaveLength(6);
		// Padded entries are silent
		for (let i = 3; i < 6; i++) {
			expect(pattern?.measures[0].slots[0].strings[i].fret).toBeNull();
		}
		expect(warnings.some((w) => w.code === "INVALID_STRINGS_TUPLE")).toBe(true);
	});

	it("does not warn when strings already has exactly 6 entries", () => {
		const raw = makePattern();
		const { warnings } = validateFingerpickPattern(raw);
		expect(warnings.filter((w) => w.code === "INVALID_STRINGS_TUPLE")).toHaveLength(0);
	});
});

// ─── Technique downgrade ──────────────────────────────────────────────────────

describe("validateFingerpickPattern — technique downgrade", () => {
	it("drops unsupported technique to null and warns", () => {
		const strings = makeStrings({ 0: { fret: 7, technique: "bend-full" } });
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[0].technique).toBeNull();
		expect(pattern?.measures[0].slots[0].strings[0].fret).toBe(7); // note preserved
		expect(warnings.some((w) => w.code === "UNSUPPORTED_TECHNIQUE")).toBe(true);
	});

	it("preserves render-supported techniques", () => {
		const strings = makeStrings({ 0: { fret: 5, technique: "hammer-on" } });
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings })])],
		});
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[0].technique).toBe("hammer-on");
		expect(warnings.filter((w) => w.code === "UNSUPPORTED_TECHNIQUE")).toHaveLength(0);
	});

	it("drops unknown technique strings to null silently", () => {
		const strings = makeStrings({ 1: { fret: 3, technique: "totally-fake" } });
		const raw = makePattern({
			measures: [makeMeasure([makeSlot({ strings })])],
		});
		const { pattern } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots[0].strings[1].technique).toBeNull();
	});
});

// ─── Measure and slot repair ──────────────────────────────────────────────────

describe("validateFingerpickPattern — measure/slot repair", () => {
	it("replaces a non-object measure entry with a rest measure and warns", () => {
		const raw = makePattern({ measures: ["not-a-measure"] });
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern).not.toBeNull();
		expect(pattern?.measures).toHaveLength(1);
		expect(warnings.some((w) => w.code === "INVALID_MEASURE")).toBe(true);
	});

	it("inserts a rest slot when slots is empty and warns", () => {
		const raw = makePattern({ measures: [{ id: "m1", slots: [] }] });
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots).toHaveLength(1);
		expect(pattern?.measures[0].slots[0].duration).toBe("rest");
		expect(warnings.some((w) => w.code === "EMPTY_SLOTS")).toBe(true);
	});

	it("replaces a null slot entry with a default slot and emits INVALID_SLOT", () => {
		const raw = makePattern({ measures: [makeMeasure([null])] });
		const { pattern, warnings } = validateFingerpickPattern(raw);
		expect(pattern?.measures[0].slots).toHaveLength(1);
		expect(warnings.some((w) => w.code === "INVALID_SLOT")).toBe(true);
	});

	it("preserves measure count (repeat indices stay valid)", () => {
		const raw = makePattern({
			measures: [
				makeMeasure([makeSlot()], "m1"),
				"broken",
				makeMeasure([makeSlot()], "m3"),
			],
		});
		const { pattern } = validateFingerpickPattern(raw);
		expect(pattern?.measures).toHaveLength(3);
	});
});
