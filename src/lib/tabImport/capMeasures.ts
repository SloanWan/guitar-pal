import type { Measure } from "@/lib/fingerpickTypes";

export const MAX_MEASURES = 128;

export function capMeasures(measures: Measure[]): {
	measures: Measure[];
	truncated: boolean;
} {
	if (measures.length <= MAX_MEASURES) {
		return { measures, truncated: false };
	}
	return { measures: measures.slice(0, MAX_MEASURES), truncated: true };
}
