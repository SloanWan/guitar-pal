/**
 * Rewrites warning paths that reference PRE-expansion measure indices so they
 * point at POST-expansion measure positions.
 *
 * `validateFingerpickPattern` (and `draftFromToolOutput`'s model warnings) run
 * against the measures BEFORE `expandRepeats` clones repeated ranges, so a path
 * like `measures[1].slots[2].strings[3]` names a pre-expansion measure. The
 * pattern handed back to callers has the EXPANDED measures, so those paths are
 * stale wherever a repeat is present. This module remaps them using the
 * provenance array `expandRepeats` returns.
 *
 * Pure and DOM-free.
 */

import type { ValidationIssue } from "./types";

/** Matches a leading `measures[<n>]` prefix, capturing the index. */
const LEADING_MEASURE_INDEX = /^measures\[(\d+)\]/;

/**
 * @param warnings      Warnings whose `path` (if it starts with `measures[i]`)
 *                      refers to a PRE-expansion measure index.
 * @param sourceIndices Provenance from `expandRepeats`: for each post-expansion
 *                      position, the pre-expansion measure index it came from.
 *                      Must already be truncated in lockstep with the final,
 *                      capped measure list.
 * @returns             New warning objects with leading measure indices rewritten.
 *
 * Semantics:
 * - FAN-OUT: a warning on a pre-expansion measure that appears at several
 *   post-expansion positions becomes one warning per position, so every copy of
 *   a suspect measure is highlightable.
 * - Only the leading measure index is rewritten; the rest of the path is
 *   preserved verbatim.
 * - Paths that do not begin with a measure index (e.g. "", "measures", "bpm")
 *   pass through exactly once, unchanged — never fanned out.
 * - A warning whose source measure has no post-expansion position (dropped by
 *   `capMeasures`) is dropped.
 * - Warnings are copied, never mutated; output order is deterministic.
 */
export function remapWarningsAfterExpansion(
	warnings: ValidationIssue[],
	sourceIndices: number[],
): ValidationIssue[] {
	// Invert the provenance once: source measure -> ascending post-expansion
	// positions. Positions come out ascending because we scan left-to-right.
	const positionsBySource = new Map<number, number[]>();
	sourceIndices.forEach((source, position) => {
		const existing = positionsBySource.get(source);
		if (existing) existing.push(position);
		else positionsBySource.set(source, [position]);
	});

	const remapped: ValidationIssue[] = [];
	for (const warning of warnings) {
		const match = LEADING_MEASURE_INDEX.exec(warning.path);
		if (match === null) {
			// Not a measure-indexed path: pass through exactly once, unchanged.
			remapped.push({ ...warning });
			continue;
		}

		const sourceIdx = Number(match[1]);
		const suffix = warning.path.slice(match[0].length);
		const positions = positionsBySource.get(sourceIdx);
		if (positions === undefined) {
			// Source measure has no post-expansion position (dropped by capMeasures).
			continue;
		}

		for (const position of positions) {
			remapped.push({ ...warning, path: `measures[${position}]${suffix}` });
		}
	}
	return remapped;
}
