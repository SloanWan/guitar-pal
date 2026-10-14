import type { Measure, Span } from "@/lib/fingerpickTypes";
import { indexPattern } from "@/lib/fingerpickIndex";
import { spanIdFor } from "@/lib/fingerpickCompat";
import type { RepeatDirective, ValidationIssue } from "./types";

export const MAX_REPEAT_TIMES = 128;

/** A copy with fresh ids, and the map from each old slot id to its copy's. */
function cloneMeasureWithFreshIds(measure: Measure, idMap: Map<string, string>): Measure {
	return {
		...structuredClone(measure),
		id: crypto.randomUUID(),
		slots: measure.slots.map((slot) => {
			const id = crypto.randomUUID();
			idMap.set(slot.id, id);
			return { ...structuredClone(slot), id };
		}),
	};
}

/**
 * The spans a copied segment carries with it: those whose every member lies
 * in the segment, anchored on the copy's slots. One that runs out of the
 * segment stays where it is (it covers notes the copy does not repeat).
 */
function copiedSpans(spans: readonly Span[], members: ReadonlyMap<string, readonly string[]>, idMap: ReadonlyMap<string, string>): Span[] {
	const out: Span[] = [];
	for (const span of spans) {
		const slots = members.get(span.id) ?? [];
		if (slots.length === 0 || !slots.every((id) => idMap.has(id))) continue;
		const from = idMap.get(span.from)!;
		out.push({ ...span, id: spanIdFor(span.kind, from), from, to: idMap.get(span.to)! });
	}
	return out;
}

/**
 * The measures with every repeated range written out. Given the pattern's
 * `spans`, the ones inside a repeated range are copied with it, so a palm
 * mute or let ring plays on every pass.
 */
export function expandRepeats(
	measures: Measure[],
	directives: RepeatDirective[],
	spans: readonly Span[] = [],
): { measures: Measure[]; warnings: ValidationIssue[]; spans: Span[] } {
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
		return { measures: [...measures], warnings, spans: [...spans] };
	}

	const members = spans.length > 0 ? indexPattern({ id: "", name: "", bpm: 0, timeSignature: [4, 4], measures, spans: [...spans] }).spanMembers : null;
	const outSpans: Span[] = [...spans];

	// Process from the back so earlier insertions don't shift later indices.
	const result: Measure[] = [...measures];
	const byDesc = [...accepted].sort((a, b) => b.range[0] - a.range[0]);

	for (const d of byDesc) {
		const [start, end] = d.range;
		const segment = result.slice(start, end + 1);
		const copies: Measure[] = [];
		for (let i = 1; i < d.times; i++) {
			const idMap = new Map<string, string>();
			copies.push(...segment.map((measure) => cloneMeasureWithFreshIds(measure, idMap)));
			if (members) outSpans.push(...copiedSpans(spans, members, idMap));
		}
		// Insert copies immediately after the range end.
		result.splice(end + 1, 0, ...copies);
	}

	return { measures: result, warnings, spans: outSpans };
}
