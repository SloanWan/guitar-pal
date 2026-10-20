import { describe, it, expect } from "vitest";

import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { FINGERPICK_SCHEMA_VERSION } from "@/lib/fingerpickTypes";
import { fingerpickPatternToScheduleEvents } from "@/lib/fingerpickScheduler";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { indexPattern } from "@/lib/fingerpickIndex";
import { migratePattern, validateFingerpickPattern } from "@/lib/tabImport";
import { normalizeLoadedPattern } from "@/lib/fingerpickEdit";

/**
 * Every preset is written in the technique model v2 and passes through every
 * read path unchanged: the migrator leaves it alone, the validator keeps it
 * whole, the load-time fold has nothing to fold, and the converter and the
 * scheduler read it without a word of v1 on any note.
 */

const V1_KEYS = ["technique", "tied", "bendTarget", "palmMute", "letRing", "staccato", "accent", "ghostNote", "tremoloPickingSpeed", "pickStroke"];

describe("technique model v2 — every preset", () => {
	for (const preset of PRESET_FINGERPICK_PATTERNS) {
		describe(preset.name, () => {
			it("is written in v2 with nothing of v1 on its notes", () => {
				expect(preset.schemaVersion).toBe(FINGERPICK_SCHEMA_VERSION);
				for (const measure of preset.measures) {
					for (const slot of measure.slots) {
						for (const sf of slot.strings) {
							for (const key of V1_KEYS) expect(key in sf, `${slot.id}.${key}`).toBe(false);
						}
					}
				}
			});

			it("passes the migrator untouched", () => {
				expect(migratePattern(preset)).toBe(preset);
			});

			it("survives the validator and the load-time fold whole", () => {
				const { pattern, errors, warnings } = validateFingerpickPattern(structuredClone(preset));
				expect(errors).toEqual([]);
				expect(warnings).toEqual([]);
				expect(pattern).toEqual({ ...preset, description: preset.description ?? "" });
				expect(normalizeLoadedPattern(structuredClone(preset))).toEqual(preset);
			});

			it("anchors every span on live slots", () => {
				const index = indexPattern(preset);
				for (const span of preset.spans ?? []) {
					expect(index.spanMembers.get(span.id)?.length, span.id).toBeGreaterThan(0);
				}
			});

			it("renders and schedules", () => {
				const context = { index: indexPattern(preset) };
				for (const measure of preset.measures) expect(() => fingerpickToVexFlow(measure, context)).not.toThrow();
				expect(fingerpickPatternToScheduleEvents(preset, preset.bpm).length).toBeGreaterThan(0);
			});
		});
	}
});
