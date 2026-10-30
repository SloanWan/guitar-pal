/**
 * Where the reader's playhead stands while a measure opens with silence — before
 * the measure's first struck note sounds.
 *
 * A rest is drawn (a rest glyph, so it has a place on the stave) and an empty slot
 * is not. The playhead walks the measure by time: from the measure's left edge
 * when nothing is drawn at its start, through each drawn rest as that rest begins,
 * to the first struck note as it sounds — or to the measure's right edge when the
 * whole measure is silent. Between two such points it moves at an even speed.
 */

/** One slot of the measure, in order. */
export interface LeadInSlot {
	/** When the slot begins, in seconds. */
	start: number;
	/** Where it is drawn; null for a slot with nothing on the stave. */
	x: number | null;
	/** When its first note sounds (a rolled chord may lead its beat); null when nothing does. */
	soundsAt: number | null;
}

export interface LeadInMeasure {
	slots: readonly LeadInSlot[];
	/** When the next measure begins. */
	end: number;
	/** The measure's note area, left and right edges. */
	left: number;
	right: number;
}

interface Point {
	time: number;
	x: number;
}

function pathOf({ slots, end, left, right }: LeadInMeasure): Point[] {
	const points: Point[] = [];
	if (slots.length === 0 || slots[0].x === null) points.push({ time: slots[0]?.start ?? end, x: left });
	for (const slot of slots) {
		if (slot.x !== null) points.push({ time: slot.soundsAt ?? slot.start, x: slot.x });
		if (slot.soundsAt !== null) return points;
	}
	points.push({ time: end, x: right });
	return points;
}

/** The playhead's x `elapsed` seconds in, while the measure's opening silence lasts. */
export function leadInX(measure: LeadInMeasure, elapsed: number): number {
	const points = pathOf(measure);
	if (elapsed <= points[0].time) return points[0].x;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (elapsed < b.time) {
			const span = b.time - a.time;
			return span > 0 ? a.x + ((b.x - a.x) * (elapsed - a.time)) / span : b.x;
		}
	}
	return points[points.length - 1].x;
}
