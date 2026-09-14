import type { BeatSlot, FingerpickPattern, Measure } from "./fingerpickTypes";
import { setFret, setInactive, type SlotTarget } from "./fingerpickEdit";
import type { ChordRef } from "./strumPatterns";
import { chordAbbreviation, normalizeCapo } from "./strumProgressions";
import { decodeVoicingStrings, type ChordVoicing } from "./chordVoicingToVexChords";

/**
 * The chord in effect at every slot, index-aligned with `measures[i].slots[j]`.
 *
 * A mark holds until the next one, across measure boundaries — a lead sheet
 * writes a chord once and lets it run — so `null` only ever appears before the
 * first mark. This is the single read path for "which chord is this slot
 * under"; nothing else should walk the marks itself.
 */
export function effectiveChords(measures: readonly Measure[]): (ChordRef | null)[][] {
	let current: ChordRef | null = null;
	return measures.map((measure) =>
		measure.slots.map((slot) => {
			if (slot.chord) current = slot.chord;
			return current;
		}),
	);
}

/** Whether any slot carries a chord mark — what decides if a chord line is drawn at all. */
export function patternHasChords(measures: readonly Measure[]): boolean {
	return measures.some((measure) => measure.slots.some((slot) => slot.chord !== undefined));
}

/**
 * Put a chord change on a slot, or take it away (`null`). Removing a mark does
 * not silence the region: the previous chord simply runs on through it.
 */
export function setSlotChord(
	pattern: FingerpickPattern,
	target: SlotTarget,
	chord: ChordRef | null,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) =>
			mi !== target.measureIndex
				? measure
				: {
						...measure,
						slots: measure.slots.map((slot, si) => {
							if (si !== target.slotIndex) return slot;
							const { chord: _chord, ...rest } = slot;
							void _chord;
							return chord ? { ...rest, chord } : rest;
						}),
					},
		),
	};
}

/**
 * The symbol written above the stave for a chord: `C`, `Am`, `G7`, `F#m7b5` —
 * the lead-sheet spelling, without the space the browse pages put between root
 * and quality.
 */
export function chordSymbolLabel(chord: ChordRef): string {
	return chordAbbreviation(chord);
}

/** The capo a pattern is played behind — 0 when it carries none. Same range as strum. */
export function patternCapo(pattern: Pick<FingerpickPattern, "capo">): number {
	return normalizeCapo(pattern.capo);
}

/**
 * Put a capo on a pattern, or take it off (0). No capo leaves no key behind, so
 * a pattern returned to "no capo" is byte-identical to one that never had it —
 * the editor's dirty check compares serialized snapshots.
 */
export function setPatternCapo(pattern: FingerpickPattern, capo: number): FingerpickPattern {
	const { capo: _capo, ...rest } = pattern;
	void _capo;
	const normalized = normalizeCapo(capo);
	return normalized === 0 ? rest : { ...rest, capo: normalized };
}

/**
 * What a string plays in a chord shape: its fret, or `"/"` for a string the
 * shape leaves out. Not `"x"` — in the editor that is a struck dead note, a
 * different thing from a string that simply is not part of the chord.
 */
export type FretHint = number | "/";

/**
 * The fret each string plays in `voicing`, in the fingerpick string order —
 * index 0 = high e, as `BeatSlot.strings` and `STRING_LABELS` are laid out.
 * That is the reverse of the voicing tables, where index 0 is the low E; the
 * flip happens here and nowhere else. Absolute frets: `decodeVoicingStrings`
 * already folds in `start_fret`, so a barre shape at the eighth fret hints 8,
 * not 1. With a capo the TAB is written relative to it, so the shape's frets
 * are written as they are — there is nothing to add.
 */
export function chordFretHints(voicing: ChordVoicing): FretHint[] {
	return decodeVoicingStrings(voicing)
		.map(({ absoluteFret }): FretHint => (absoluteFret === "x" ? "/" : absoluteFret))
		.reverse();
}

/**
 * Write the shape's frets into a slot's empty cells. Cells that already hold a
 * fret or a dead note are left alone — the shape fills in around what the
 * player wrote, never over it — and strings the shape leaves out stay empty.
 */
export function fillColumnFromChord(
	pattern: FingerpickPattern,
	target: SlotTarget,
	voicing: ChordVoicing,
): FingerpickPattern {
	const slot = pattern.measures[target.measureIndex]?.slots[target.slotIndex];
	if (!slot) return pattern;
	return chordFretHints(voicing).reduce((p, hint, stringIndex) => {
		const cell = slot.strings[stringIndex];
		if (hint === "/" || cell.fret !== null || cell.muted) return p;
		return setFret(p, { ...target, stringIndex }, hint);
	}, pattern);
}

/**
 * Clear every note in a measure that sits on a string `voicing` leaves out,
 * across the slots where `chord` is in effect there. The complement of
 * `fillColumnFromChord`: a shape written over an older one leaves notes on
 * strings the new shape does not sound, and those are the ones to take away.
 * Dead notes on those strings go too — they were put there by the old shape.
 */
export function clearLeftOutStrings(
	pattern: FingerpickPattern,
	measureIndex: number,
	chord: ChordRef,
	voicing: ChordVoicing,
): FingerpickPattern {
	const measure = pattern.measures[measureIndex];
	if (!measure) return pattern;
	const leftOut = chordFretHints(voicing)
		.map((hint, stringIndex) => (hint === "/" ? stringIndex : -1))
		.filter((i) => i >= 0);
	if (leftOut.length === 0) return pattern;
	const inEffect = effectiveChords(pattern.measures)[measureIndex];
	return measure.slots.reduce((p, slot, slotIndex) => {
		const ref = inEffect[slotIndex];
		if (!ref || ref.root !== chord.root || ref.suffix !== chord.suffix) return p;
		return leftOut.reduce((q, stringIndex) => {
			const cell = slot.strings[stringIndex];
			if (cell.fret === null && !cell.muted) return q;
			return setInactive(q, { measureIndex, slotIndex, stringIndex });
		}, p);
	}, pattern);
}

/**
 * Empty one string — every slot of one measure, or of the whole pattern when
 * `measureIndex` is omitted. Frets, dead notes, ties and techniques all go:
 * the string is returned to "not in play".
 */
export function clearString(
	pattern: FingerpickPattern,
	stringIndex: number,
	measureIndex?: number,
): FingerpickPattern {
	return pattern.measures.reduce((p, measure, mi) => {
		if (measureIndex !== undefined && mi !== measureIndex) return p;
		return measure.slots.reduce((q, slot, slotIndex) => {
			const cell = slot.strings[stringIndex];
			if (!cell || (cell.fret === null && !cell.muted && !cell.tied)) return q;
			return setInactive(q, { measureIndex: mi, slotIndex, stringIndex });
		}, p);
	}, pattern);
}

/**
 * Strings the shape holds that nothing in `slots[from, to)` plucks — index 0 =
 * high e, the fingerpick order. Drawn faintly on a chord diagram, so the player
 * can tell the fingers the pattern actually sounds from the ones held only to
 * complete the chord. A dead note counts as plucked: the string is struck.
 * A string the shape leaves out is never reported — there is nothing to hold.
 */
export function heldButUnplucked(
	slots: readonly BeatSlot[],
	from: number,
	to: number,
	voicing: ChordVoicing,
): boolean[] {
	return chordFretHints(voicing).map((hint, stringIndex) => {
		if (hint === "/") return false;
		for (let i = Math.max(0, from); i < Math.min(to, slots.length); i++) {
			const cell = slots[i].strings[stringIndex];
			if (cell.fret !== null || cell.muted) return false;
		}
		return true;
	});
}

/**
 * Where a chord mark's region ends inside its measure: the next mark's slot,
 * or the measure's end. Pairs with `heldButUnplucked` for a diagram drawn at
 * the mark.
 */
export function chordRegionEnd(measure: Measure, slotIndex: number): number {
	for (let i = slotIndex + 1; i < measure.slots.length; i++) {
		if (measure.slots[i].chord) return i;
	}
	return measure.slots.length;
}

/**
 * Strings a slot plays outside the chord shape in effect — index list in
 * fingerpick order (0 = high e). A note is off the shape when its fret is not
 * the shape's fret for that string, or the shape does not sound that string at
 * all. Dead notes are never reported: a percussive mute is rhythm, not a
 * fingering. With no shape (`hints` null) nothing is reported either.
 */
export function offShapeStrings(slot: BeatSlot, hints: readonly FretHint[] | null): number[] {
	if (!hints) return [];
	return slot.strings.flatMap((sf, stringIndex) => {
		if (sf.fret === null || sf.muted) return [];
		const hint = hints[stringIndex];
		return hint === "/" || hint !== sf.fret ? [stringIndex] : [];
	});
}
