import type { RepeatDirective, NormalizeResult, ValidationIssue } from "./types";
import { validateFingerpickPattern } from "./validateFingerpickPattern";
import { expandRepeats } from "./expandRepeats";
import { capMeasures, MAX_MEASURES } from "./capMeasures";
import { remapWarningsAfterExpansion } from "./remapWarningsAfterExpansion";

export function normalizeImportedPattern(
	raw: unknown,
	repeats: RepeatDirective[] = [],
	/**
	 * Warnings computed against the PRE-expansion measures by an upstream layer
	 * (e.g. `draftFromToolOutput`'s model warnings). They are remapped onto the
	 * post-expansion positions exactly like validation warnings, so a caller
	 * cannot forget the remap. Defaults to empty — existing two-argument call
	 * sites are unaffected.
	 */
	modelWarnings: ValidationIssue[] = [],
): NormalizeResult {
	const { pattern, errors, warnings } = validateFingerpickPattern(raw);

	if (pattern === null) {
		return { pattern: null, errors, warnings, truncated: false };
	}

	const {
		measures: expanded,
		warnings: expandWarnings,
		sourceIndices,
	} = expandRepeats(pattern.measures, repeats);

	const expandedCount = expanded.length;
	const { measures: capped, truncated } = capMeasures(expanded);

	// Truncate the provenance array in lockstep with capMeasures, so remapping
	// resolves against the FINAL measure list. Warnings whose source measure was
	// dropped by the cap therefore fall away in remapWarningsAfterExpansion.
	const cappedSourceIndices = truncated
		? sourceIndices.slice(0, MAX_MEASURES)
		: sourceIndices;

	// validate + model warnings are computed against pre-expansion indices → remap.
	// expandRepeats' own warnings use repeat-directive paths ("repeats"), not
	// measure indices, so they are NOT remapped (they pass through untouched).
	const finalWarnings: ValidationIssue[] = [
		...remapWarningsAfterExpansion(warnings, cappedSourceIndices),
		...remapWarningsAfterExpansion(modelWarnings, cappedSourceIndices),
		...expandWarnings,
	];

	if (truncated) {
		// Appended AFTER capping and describes the whole-pattern truncation, so it
		// is intentionally not remapped.
		finalWarnings.push({
			code: "MEASURES_TRUNCATED",
			path: "measures",
			message: `Pattern has ${expandedCount} measures after expansion; truncated to ${MAX_MEASURES} (dropped ${expandedCount - MAX_MEASURES})`,
			original: expandedCount,
			repairedTo: MAX_MEASURES,
		});
	}

	return {
		pattern: { ...pattern, measures: capped },
		errors,
		warnings: finalWarnings,
		truncated,
	};
}
