import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { PlanSlot } from "@/lib/assistant/tab/types";

/**
 * The style words the tab assistant reads, each standing for one shipped
 * pattern. "travis picking in Am" is that preset's right-hand order laid over
 * Am's shape — the preset says which strings and when, the chord says which
 * frets. The song preset (斑马斑马) is a melody, not a style, and is not here.
 */
export interface TabStyleEntry {
	key: string;
	/** Lowercase; longest first so "travis picking" is read before "travis" inside it. */
	words: readonly string[];
	presetId: string;
	/** The name the proposal is given: "Travis in Am". */
	label: string;
}

export const TAB_STYLES: readonly TabStyleEntry[] = [
	{
		key: "travis",
		words: ["travis picking", "travis", "三指法", "交替低音"],
		presetId: "travis-picking",
		label: "Travis",
	},
	{
		key: "arpeggio",
		words: ["arpeggio", "arpeggios", "arpeggiated", "分解和弦", "琶音"],
		presetId: "arpeggio",
		label: "Arpeggio",
	},
	{
		key: "waltz",
		words: ["waltz", "华尔兹", "圆舞曲"],
		presetId: "waltz",
		label: "Waltz",
	},
	{
		key: "celtic",
		words: ["celtic fingerstyle", "celtic", "凯尔特"],
		presetId: "celtic-fingerstyle",
		label: "Celtic",
	},
];

export function stylePreset(
	style: TabStyleEntry,
	presets: readonly FingerpickPattern[] = PRESET_FINGERPICK_PATTERNS,
): FingerpickPattern | null {
	return presets.find((p) => p.id === style.presetId) ?? null;
}

/**
 * A measure's right-hand order, read off its frets: which strings each slot
 * plucks and for how long. The frets themselves are left behind — they were
 * the preset's chord, and the proposal will fret the plan from the player's.
 */
export function planFromMeasure(measure: Measure): PlanSlot[] {
	return measure.slots.map((slot) => {
		const strings = slot.strings
			.map((s, i) => (s.fret !== null || s.muted ? i : -1))
			.filter((i) => i >= 0);
		return {
			strings: slot.isRest || strings.length === 0 ? null : strings,
			duration: slot.duration,
		};
	});
}
