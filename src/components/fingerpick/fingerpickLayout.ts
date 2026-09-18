// Row layout for the fingerpick page: how many measures fit on each stave row
// and how wide each one is drawn. Pure functions over the pattern and the
// viewer width; nothing here touches the DOM.
//
// Lives beside TabStaveRow rather than in src/lib because the per-measure
// minimum width is the stave's own measurement (VexFlow formatting plus the
// row's glyph and padding constants), which src/lib must not depend on.

import type { Measure } from "@/lib/fingerpickTypes";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { computeMeasureMinWidth, CLEF_WIDTH } from "./TabStaveRow";

// Count hammer-on / pull-off connections in a measure (each arc needs extra clearance).
export function hoPoConnectorCount(measure: Measure): number {
	return measure.slots.reduce(
		(count, slot) =>
			count +
			slot.strings.filter((sf) => sf.technique === "hammer-on" || sf.technique === "pull-off")
				.length,
		0,
	);
}

// Gap between the last row's SVG right edge and the container edge — pure page-level visual choice.
export const ROW_TRAILING_PAD = 15;

// Greedy row packer: each measure's minimum width drives wrapping.
// Returns one inner array per row; each entry is the stretched stave width for that measure.
// Rows are scaled to fill exactly (containerWidth − CLEF_WIDTH − ROW_TRAILING_PAD).
export function computeAllMeasureWidths(
	measures: Measure[],
	containerWidth: number,
	chordDiagramWidth: number,
): number[][] {
	// Precompute render data once per measure to avoid double adapter calls.
	const renderData = measures.map((m) => fingerpickToVexFlow(m));
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const repeatBarlines = (m: Measure): number => (m.repeatStart ? 1 : 0) + (m.repeatEnd ? 1 : 0);
	const widthsFirst = renderData.map((rd, i) =>
		computeMeasureMinWidth(
			rd.notes,
			true,
			hoPoConnectorCount(measures[i]),
			repeatBarlines(measures[i]),
			rd.chordLabels.length,
			chordDiagramWidth,
			rd.rolls.length,
		),
	);
	const widthsNonFirst = renderData.map((rd, i) =>
		computeMeasureMinWidth(
			rd.notes,
			false,
			hoPoConnectorCount(measures[i]),
			repeatBarlines(measures[i]),
			rd.chordLabels.length,
			chordDiagramWidth,
			rd.rolls.length,
		),
	);

	const rows: number[][] = [];
	let i = 0;
	while (i < measures.length) {
		// Always include at least one measure per row.
		const rowWidths: number[] = [widthsFirst[i]];
		let rowWidth = widthsFirst[i];
		i++;
		// Pack subsequent measures until the next one would overflow the stave area.
		while (i < measures.length) {
			const w = widthsNonFirst[i];
			if (rowWidth + w > staveSpace) break;
			rowWidths.push(w);
			rowWidth += w;
			i++;
		}
		// Stretch widths proportionally so every row fills the container edge-to-edge.
		const scale = staveSpace / rowWidth;
		rows.push(rowWidths.map((w) => w * scale));
	}
	return rows;
}

export interface MeasureRow {
	measures: Measure[];
	/** 1-based number of the row's first measure, for the stave's measure labels. */
	startMeasureNumber: number;
	widths: number[];
}

// The rows the page renders: the packed widths paired with their measures.
// An unmeasured viewer (width 0, before the ResizeObserver fires) lays out nothing.
export function layoutMeasureRows(
	measures: Measure[],
	containerWidth: number,
	chordDiagramWidth: number,
): MeasureRow[] {
	if (containerWidth === 0) return [];
	const widthRows = computeAllMeasureWidths(measures, containerWidth, chordDiagramWidth);
	let offset = 0;
	return widthRows.map((rowWidths) => {
		const start = offset;
		const rowMeasures = measures.slice(start, start + rowWidths.length);
		offset += rowWidths.length;
		return { measures: rowMeasures, startMeasureNumber: start + 1, widths: rowWidths };
	});
}
