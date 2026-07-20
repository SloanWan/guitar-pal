import type { Measure } from "@/lib/fingerpickTypes";
import type { RepeatDirective, ValidationIssue } from "./types";

export const MAX_REPEAT_TIMES = 128;

function cloneMeasureWithFreshIds(measure: Measure): Measure {
	return {
		...structuredClone(measure),
		id: crypto.randomUUID(),
		slots: measure.slots.map((slot) => ({
			...structuredClone(slot),
			id: crypto.randomUUID(),
		})),
	};
}

export function expandRepeats(
	measures: Measure[],
	directives: RepeatDirective[],
): { measures: Measure[]; warnings: ValidationIssue[] } {
	const warnings: ValidationIssue[] = [];
	const n = measures.length;

	// Validate and de-overlap directives (keep the first of any overlapping pair).
	// Sort by startIdx so we can sweep left-to-right for overlap detection.
	const sorted = [...directives].sort((a, b) => a.range[0] - b.range[0]);
	const accepted: RepeatDirective[] = [];

	for (const d of sorted) {
		const [start, end] = d.range;

		if (
			start < 0 || end < start || end >= n ||
			!Number.isInteger(start) || !Number.isInteger(end) ||
			d.times < 1 || !Number.isInteger(d.times) ||
			d.times > MAX_REPEAT_TIMES
		) {
			warnings.push({
				code: "INVALID_REPEAT_DIRECTIVE",
				path: "repeats",
				message: `Repeat directive {range:[${start},${end}], times:${d.times}} is out of bounds or invalid (measures length ${n}), skipped`,
				original: d,
			});
			continue;
		}

		// Overlap check against already-accepted directives.
		const overlaps = accepted.some(
			(a) => Math.max(a.range[0], start) <= Math.min(a.range[1], end),
		);
		if (overlaps) {
			warnings.push({
				code: "OVERLAPPING_REPEAT_DIRECTIVE",
				path: "repeats",
				message: `Repeat directive {range:[${start},${end}], times:${d.times}} overlaps a prior directive, skipped`,
				original: d,
			});
			continue;
		}

		accepted.push(d);
	}

	if (accepted.length === 0) {
		return { measures: [...measures], warnings };
	}

	// Process from the back so earlier insertions don't shift later indices.
	const result: Measure[] = [...measures];
	const byDesc = [...accepted].sort((a, b) => b.range[0] - a.range[0]);

	for (const d of byDesc) {
		const [start, end] = d.range;
		const segment = result.slice(start, end + 1);
		const copies: Measure[] = [];
		for (let i = 1; i < d.times; i++) {
			copies.push(...segment.map(cloneMeasureWithFreshIds));
		}
		// Insert copies immediately after the range end.
		result.splice(end + 1, 0, ...copies);
	}

	return { measures: result, warnings };
}
