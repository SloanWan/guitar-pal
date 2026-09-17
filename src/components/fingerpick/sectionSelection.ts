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

/** One continuous band of the selection on a stave row. */
export interface SectionBand {
	rowIndex: number;
	left: number;
	width: number;
	top: number;
	height: number;
	/** The section's first measure is on this row: draw the opening edge. */
	startsSection: boolean;
	/** The section's last measure is on this row: draw the closing edge. */
	endsSection: boolean;
}

/**
 * The selection as one band per row, from the first selected measure's left
 * to the last one's right. Drawing per measure would leave the barline
 * padding between neighbours uncovered — the measure boxes are note areas.
 */
export function sectionBands(
	geometry: readonly { measureIndex: number; left: number; width: number; top: number; height: number; rowIndex: number }[],
	range: SectionRange,
): SectionBand[] {
	const rows = new Map<number, SectionBand>();
	for (const r of geometry) {
		if (r.measureIndex < range.startMeasure || r.measureIndex > range.endMeasure) continue;
		const right = r.left + r.width;
		const band = rows.get(r.rowIndex);
		if (!band) {
			rows.set(r.rowIndex, {
				rowIndex: r.rowIndex,
				left: r.left,
				width: r.width,
				top: r.top,
				height: r.height,
				startsSection: r.measureIndex === range.startMeasure,
				endsSection: r.measureIndex === range.endMeasure,
			});
			continue;
		}
		const left = Math.min(band.left, r.left);
		band.width = Math.max(band.left + band.width, right) - left;
		band.left = left;
		band.startsSection ||= r.measureIndex === range.startMeasure;
		band.endsSection ||= r.measureIndex === range.endMeasure;
	}
	return [...rows.values()].sort((a, b) => a.rowIndex - b.rowIndex);
}
