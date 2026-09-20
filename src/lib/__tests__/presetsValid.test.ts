import { describe, it, expect } from "vitest";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { normalizeImportedPattern } from "@/lib/tabImport/normalizeImportedPattern";
import { measureCapacity, usedUnits } from "@/lib/fingerpickEdit";

describe("shipped fingerpick patterns", () => {
	for (const p of PRESET_FINGERPICK_PATTERNS) {
		it(`${p.name}: every bar fills its meter and the pattern validates`, () => {
			for (const [i, m] of p.measures.entries()) {
				expect(usedUnits(m.slots), `bar ${i + 1}`).toBe(measureCapacity(p.timeSignature));
			}
			const { pattern, errors } = normalizeImportedPattern(p);
			expect(errors).toEqual([]);
			expect(pattern).not.toBeNull();
			// Ids are unique across the pattern, the way the editor keys on them.
			const ids = p.measures.flatMap((m) => [m.id, ...m.slots.map((s) => s.id)]);
			expect(new Set(ids).size).toBe(ids.length);
		});
	}
});
