import { describe, it, expect } from "vitest";

import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { fingerpickPatternToScheduleEvents } from "@/lib/fingerpickScheduler";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { stripV2, syncTechniqueFields } from "@/lib/fingerpickCompat";
import { migratePattern, validateFingerpickPattern } from "@/lib/tabImport";
import { normalizeLoadedPattern } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";

/**
 * The technique model v2 must not change what any existing pattern renders
 * or plays. Every preset goes through the migrator and must come out with
 * its v1 fields untouched (so the v1 readers see the same data), and the
 * converter and the scheduler must produce the same structures.
 */

function renderShape(pattern: FingerpickPattern) {
	return pattern.measures.map((m) => {
		const rd = fingerpickToVexFlow(m);
		return {
			notes: rd.notes.map((n) => n.getCategory()),
			modifiers: rd.notes.map((n) => n.getModifiers().map((mod) => mod.getCategory()).sort()),
			connectors: rd.connectors.map((c) => c.getCategory()),
			tuplets: rd.tuplets.length,
			chordLabels: rd.chordLabels,
			rolls: rd.rolls,
			brackets: rd.brackets,
			expression: rd.expression,
			noteStrings: rd.noteStrings,
			noteSlots: rd.noteSlots,
		};
	});
}

describe("technique model v2 — golden against every preset", () => {
	for (const preset of PRESET_FINGERPICK_PATTERNS) {
		describe(preset.name, () => {
			const migrated = migratePattern(structuredClone(preset)) as FingerpickPattern;

			it("keeps every v1 field exactly", () => {
				expect(stripV2(migrated)).toEqual(preset);
			});

			it("renders the same", () => {
				expect(renderShape(migrated)).toEqual(renderShape(preset));
			});

			it("schedules the same events", () => {
				expect(fingerpickPatternToScheduleEvents(migrated, preset.bpm)).toEqual(
					fingerpickPatternToScheduleEvents(preset, preset.bpm),
				);
			});

			it("survives the validator and the load-time fold unchanged", () => {
				const { pattern, errors } = validateFingerpickPattern(structuredClone(preset));
				expect(errors).toEqual([]);
				expect(pattern).not.toBeNull();
				expect(stripV2(pattern!)).toEqual({ ...preset, description: preset.description ?? "" });
				expect(normalizeLoadedPattern(structuredClone(preset))).toEqual(syncTechniqueFields(structuredClone(preset)));
			});
		});
	}
});
