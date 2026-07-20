import type { RepeatDirective, NormalizeResult } from "./types";
import { validateFingerpickPattern } from "./validateFingerpickPattern";
import { expandRepeats } from "./expandRepeats";
import { capMeasures, MAX_MEASURES } from "./capMeasures";

export function normalizeImportedPattern(
	raw: unknown,
	repeats: RepeatDirective[] = [],
): NormalizeResult {
	const { pattern, errors, warnings } = validateFingerpickPattern(raw);

	if (pattern === null) {
		return { pattern: null, errors, warnings, truncated: false };
	}

	const { measures: expanded, warnings: expandWarnings } = expandRepeats(
		pattern.measures,
		repeats,
	);
	warnings.push(...expandWarnings);

	const expandedCount = expanded.length;
	const { measures: capped, truncated } = capMeasures(expanded);

	if (truncated) {
		warnings.push({
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
		warnings,
		truncated,
	};
}
