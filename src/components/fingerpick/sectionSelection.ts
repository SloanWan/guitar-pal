/**
 * Section mode: the player picks the first and then the last measure of the
 * stretch to practise. Pure state transitions, kept out of the page.
 */

/** A chosen stretch of rendered measures, inclusive. */
export interface SectionRange {
	startMeasure: number;
	endMeasure: number;
}

export interface SectionSelection {
	/** The first pick, while the second is still to come. */
	pending: number | null;
	/** The completed pick. */
	range: SectionRange | null;
}

export const EMPTY_SELECTION: SectionSelection = { pending: null, range: null };

/**
 * A click on a measure. The first click marks the start; the second marks the
 * end (a measure before the start swaps them; the start again gives a
 * one-measure section); a third click starts a new selection.
 */
export function pickMeasure(selection: SectionSelection, measureIndex: number): SectionSelection {
	if (selection.pending === null) return { pending: measureIndex, range: null };
	const a = selection.pending;
	return {
		pending: null,
		range: { startMeasure: Math.min(a, measureIndex), endMeasure: Math.max(a, measureIndex) },
	};
}

/** The measures to highlight: the range, or the lone first pick. */
export function highlightedRange(selection: SectionSelection): SectionRange | null {
	if (selection.range) return selection.range;
	if (selection.pending !== null) {
		return { startMeasure: selection.pending, endMeasure: selection.pending };
	}
	return null;
}

/** What the header says while picking. */
export function sectionHint(selection: SectionSelection): string {
	if (selection.range) {
		const { startMeasure, endMeasure } = selection.range;
		return startMeasure === endMeasure
			? `Measure ${startMeasure + 1}`
			: `Measures ${startMeasure + 1}–${endMeasure + 1}`;
	}
	if (selection.pending !== null) return "Click last measure";
	return "Click first measure";
}
