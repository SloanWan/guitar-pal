import type { Duration } from "@/lib/fingerpickTypes";
import { DURATION_TICKS } from "@/lib/fingerpickEdit";

/** Plain values, longest first, for writing a span of ticks as note values. */
const PLAIN_DURATIONS: readonly Duration[] = [
	"whole",
	"half",
	"dotted-quarter",
	"quarter",
	"dotted-eighth",
	"eighth",
	"sixteenth",
	"32nd",
];

/**
 * A span of ticks as plain note values, longest first: 30 ticks is a quarter
 * and a sixteenth. What is left under a 32nd is dropped — nothing can be
 * written that short.
 */
export function splitTicks(ticks: number): Duration[] {
	const out: Duration[] = [];
	let left = ticks;
	for (const d of PLAIN_DURATIONS) {
		while (left >= DURATION_TICKS[d]) {
			out.push(d);
			left -= DURATION_TICKS[d];
		}
	}
	return out;
}
