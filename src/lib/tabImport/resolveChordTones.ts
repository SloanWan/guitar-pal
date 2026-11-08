import { effectiveChords, isNoChord, type FretHint } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ValidationIssue } from "./types";

/**
 * A rhythm pattern's × written as frets (#439). A rhythm-pattern exercise
 * prints × on the tab lines where the frets go and leaves them to the chord
 * of the bar: the book service reads such a × as a string with no fret and
 * `chordTone: true`, and the validate route turns it into the fret the chord's
 * shape holds on that string — after the chord names are placed (#427), before
 * repeats are expanded. Under no chord, or N.C., the × is the open string.
 */

/** The shape of a chord, in the fingerpick string order (index 0 = high e); null when there is none. */
export type ChordShapeOf = (chord: ChordRef) => readonly FretHint[] | null;

type RawSlot = Record<string, unknown>;
type RawMeasure = { slots: RawSlot[] };

function isChordRef(value: unknown): value is ChordRef {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	return typeof v.root === "string" && typeof v.suffix === "string";
}

function cellsOf(slot: RawSlot): Record<string, unknown>[] {
	return Array.isArray(slot.strings)
		? slot.strings.filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
		: [];
}

function measuresOf(raw: unknown): RawMeasure[] {
	if (typeof raw !== "object" || raw === null) return [];
	const measures = (raw as { measures?: unknown }).measures;
	if (!Array.isArray(measures)) return [];
	return measures.map((m) => {
		const slots = typeof m === "object" && m !== null ? (m as { slots?: unknown }).slots : null;
		return {
			slots: Array.isArray(slots)
				? slots.filter((s): s is RawSlot => typeof s === "object" && s !== null)
				: [],
		};
	});
}

function chordsInEffect(measures: RawMeasure[]): (ChordRef | null)[][] {
	return effectiveChords(
		measures.map((m) => ({ slots: m.slots.map((s) => ({ chord: isChordRef(s.chord) ? s.chord : undefined })) })),
	);
}

const hasChordTone = (slot: RawSlot) => cellsOf(slot).some((c) => c.chordTone === true);

/** The chords a raw draft's × stand under, once each — what the route reads shapes for. */
export function chordToneChords(raw: unknown): ChordRef[] {
	const measures = measuresOf(raw);
	const inEffect = chordsInEffect(measures);
	const seen = new Map<string, ChordRef>();
	measures.forEach((m, mi) =>
		m.slots.forEach((slot, si) => {
			const chord = inEffect[mi][si];
			if (!chord || isNoChord(chord) || !hasChordTone(slot)) return;
			seen.set(`${chord.root} ${chord.suffix} ${chord.voicingId ?? ""}`, chord);
		}),
	);
	return [...seen.values()];
}

/**
 * A raw draft with every `chordTone` string fretted from the chord in effect
 * at its slot, and the key gone. A string the shape leaves out, or a chord
 * with no shape, is written open with a `TAB_CHORD_TONE` warning, one per
 * slot, so the reviewer sees where the page's × was not the shape's note.
 */
export function resolveDraftChordTones(
	raw: unknown,
	shapeOf: ChordShapeOf,
): { draft: unknown; warnings: ValidationIssue[] } {
	const measures = measuresOf(raw);
	if (!measures.some((m) => m.slots.some(hasChordTone))) {
		return { draft: raw, warnings: [] };
	}
	const inEffect = chordsInEffect(measures);
	const warnings: ValidationIssue[] = [];
	const resolved = measures.map((m, mi) => ({
		...(raw as { measures: Record<string, unknown>[] }).measures[mi],
		slots: m.slots.map((slot, si) => {
			if (!Array.isArray(slot.strings) || !hasChordTone(slot)) return slot;
			const chord = inEffect[mi][si];
			const shape = chord && !isNoChord(chord) ? shapeOf(chord) : null;
			const open: number[] = [];
			const strings = slot.strings.map((cell, index) => {
				if (typeof cell !== "object" || cell === null || (cell as Record<string, unknown>).chordTone !== true) return cell;
				const { chordTone: _, ...rest } = cell as Record<string, unknown>;
				const hint = shape?.[index];
				if (chord && !isNoChord(chord) && typeof hint !== "number") open.push(index + 1);
				return { ...rest, fret: typeof hint === "number" ? hint : 0, muted: false };
			});
			if (open.length > 0 && chord) {
				const name = `${chord.root} ${chord.suffix}`.trim();
				const which = open.length === 1 ? `string ${open[0]}` : `strings ${open.join(", ")}`;
				warnings.push({
					code: "TAB_CHORD_TONE",
					path: `measures[${mi}].slots[${si}]`,
					message: shape
						? `Bar ${mi + 1}: the ${name} shape does not sound ${which}; the × there was written as the open string.`
						: `Bar ${mi + 1}: no shape for ${name}; the × on ${which} was written as the open string.`,
				});
			}
			return { ...slot, strings };
		}),
	}));
	return { draft: { ...(raw as object), measures: resolved }, warnings };
}
