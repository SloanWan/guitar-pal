import { describe, it, expect } from "vitest";

import { TECHNIQUE_DEMOS } from "../demos";
import { TECHNIQUES } from "@/lib/techniqueRegistry";
import { validateFingerpickPattern } from "@/lib/tabImport";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { fingerpickPatternToScheduleEvents } from "@/lib/fingerpickScheduler";
import { indexPattern } from "@/lib/fingerpickIndex";

describe("technique gallery demos", () => {
	it("has one demo per registry kind, in the registry's order", () => {
		expect(TECHNIQUE_DEMOS.map((d) => d.def.kind)).toEqual(TECHNIQUES.map((t) => t.kind));
	});

	for (const demo of TECHNIQUE_DEMOS) {
		it(`${demo.def.kind}: a valid pattern that carries the kind, renders and schedules`, () => {
			const { errors, warnings, pattern } = validateFingerpickPattern(structuredClone(demo.pattern));
			expect(errors).toEqual([]);
			// The only warning a demo may carry is that its kind is not drawn yet.
			expect(warnings.filter((w) => w.code !== "UNSUPPORTED_TECHNIQUE")).toEqual([]);
			expect(JSON.stringify(pattern)).toContain(`"${demo.def.kind}"`);
			const context = { index: indexPattern(demo.pattern) };
			for (const measure of demo.pattern.measures) expect(() => fingerpickToVexFlow(measure, context)).not.toThrow();
			expect(fingerpickPatternToScheduleEvents(demo.pattern, demo.pattern.bpm).length).toBeGreaterThan(0);
			expect(demo.note.en).not.toBe("");
		});
	}
});
