import type { FingerpickPattern } from "./fingerpickTypes";
import { DURATION_UNITS, measureCapacity } from "./fingerpickEdit";

/**
 * A fingerpick pattern laid out on the landing page's background TAB strip —
 * the same 1600×90 geometry (additional-components §8), so a real preset can
 * scroll behind a page in place of the hand-placed notes the mockup shipped.
 *
 * Decoration, not notation: fret numbers on six lines and a barline per
 * measure. Durations only decide where a note sits within its bar; techniques,
 * ties and rolls are not drawn.
 */

/** One fret number: x, text baseline y, and what to print. */
export type TabStripNote = readonly [x: number, y: number, fret: string];

export interface TabStripSpec {
	barlines: readonly number[];
	notes: readonly TabStripNote[];
}

export const TAB_STRIP_WIDTH = 1600;
export const TAB_STRIP_HEIGHT = 90;
/** The six string lines, high e at the top, as TAB is read. */
export const TAB_STRIP_LINE_Y = [10, 24, 38, 52, 66, 80] as const;
/** A 12px mono digit sits on its line when its baseline is this far below it. */
const BASELINE_OFFSET = 4;
/** Space inside each bar before the first note and after the last. */
const BAR_INSET = 12;

export function fingerpickToTabStrip(
	pattern: FingerpickPattern,
	width: number = TAB_STRIP_WIDTH,
): TabStripSpec {
	const { measures } = pattern;
	if (measures.length === 0) return { barlines: [width - 1], notes: [] };

	const barWidth = width / measures.length;
	const capacity = measureCapacity(pattern.timeSignature);
	const span = barWidth - BAR_INSET * 2;
	const barlines: number[] = [];
	const notes: TabStripNote[] = [];

	measures.forEach((measure, m) => {
		const barX = m * barWidth;
		// The closing barline; the last one is pulled in a pixel so a 1px stroke
		// at x = width is not clipped, as on the landing page.
		barlines.push(m === measures.length - 1 ? width - 1 : Math.round(barX + barWidth));

		let elapsed = 0;
		for (const slot of measure.slots) {
			const x = Math.round(barX + BAR_INSET + (elapsed / capacity) * span);
			slot.strings.forEach((s, stringIndex) => {
				if (s.fret === null || s.tied) return;
				const y = TAB_STRIP_LINE_Y[stringIndex] + BASELINE_OFFSET;
				notes.push([x, y, s.muted ? "x" : String(s.fret)]);
			});
			elapsed += DURATION_UNITS[slot.duration];
		}
	});

	return { barlines, notes };
}
