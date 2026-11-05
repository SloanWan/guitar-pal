import type { EffectKind, FingerpickPattern, LinkKind, PercussionKind, SpanKind, Stroke } from "@/lib/fingerpickTypes";
import { setInactive, setStroke, slotHasStringData, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import { chordFretHints, fillColumnFromChord, offShapeStrings } from "@/lib/fingerpickChords";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { setEffect, spanCoversSlot, techniqueBlock } from "@/lib/fingerpickTechniqueEdit";
import { EFFECT_DEFS, LINK_DEFS, PERCUSSION_DEFS, SPAN_DEFS, type TechniqueDef } from "@/lib/techniqueRegistry";
import { BLOCK_REASON } from "@/lib/tabEditorCursor";

/**
 * The editor's inspector (#361), as data: every list is the technique
 * registry's, each option with whether it is on and, when the note cannot take
 * it, why. A new registry entry appears here without the inspector changing.
 */

export interface InspectorOption<K extends string> {
	kind: K;
	label: string;
	/** The registry's shortcut, when it has one. */
	key?: string;
	on: boolean;
	/** Why it cannot go on, in full; null when it can. */
	reason: string | null;
}

/** Effects the app draws or plays: the ones worth offering. */
export const INSPECTOR_EFFECTS: readonly TechniqueDef[] = EFFECT_DEFS.filter((t) => t.render || t.audio);
export const INSPECTOR_SPANS: readonly TechniqueDef[] = SPAN_DEFS.filter((t) => t.render || t.audio);
export const INSPECTOR_LINKS: readonly TechniqueDef[] = LINK_DEFS;
export const INSPECTOR_HITS: readonly TechniqueDef[] = PERCUSSION_DEFS;

function noteAt(pattern: FingerpickPattern, cell: Cell) {
	return pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex];
}

function reasonFor(pattern: FingerpickPattern, cell: Cell, kind: string): string | null {
	const block = techniqueBlock(pattern, cell, kind);
	return block ? BLOCK_REASON[block] : null;
}

/** How the note at the cursor is reached from the one before. */
export function linkOptions(pattern: FingerpickPattern, cursor: Cell): InspectorOption<LinkKind>[] {
	const current = noteAt(pattern, cursor)?.link?.kind;
	return INSPECTOR_LINKS.map((t) => {
		const kind = t.kind as LinkKind;
		const on = current === kind;
		return { kind, label: t.label.en, key: t.key, on, reason: on ? null : reasonFor(pattern, cursor, kind) };
	});
}

/** The effects on the note at the cursor. */
export function effectOptions(pattern: FingerpickPattern, cursor: Cell): InspectorOption<EffectKind>[] {
	const effects = noteAt(pattern, cursor)?.effects ?? {};
	return INSPECTOR_EFFECTS.map((t) => {
		const kind = t.kind as EffectKind;
		const on = effects[kind] !== undefined;
		return { kind, label: t.label.en, key: t.key, on, reason: on ? null : reasonFor(pattern, cursor, kind) };
	});
}

/** The spans over the run: on when every slot of it is under one. */
export function spanOptions(pattern: FingerpickPattern, slots: readonly SlotTarget[]): InspectorOption<SpanKind>[] {
	return INSPECTOR_SPANS.map((t) => {
		const kind = t.kind as SpanKind;
		const on = slots.length > 0 && slots.every((s) => spanCoversSlot(pattern, kind, s));
		return { kind, label: t.label.en, key: t.key, on, reason: null };
	});
}

/** What a run of slots shares: one value, none, or a mix. */
export type Shared<T> = { kind: "one"; value: T } | { kind: "mixed" };

function shared<T>(values: readonly T[]): Shared<T> {
	const first = values[0];
	return values.every((v) => v === first) ? { kind: "one", value: first } : { kind: "mixed" };
}

function slotsOf(pattern: FingerpickPattern, targets: readonly SlotTarget[]) {
	return targets.flatMap((t) => {
		const slot = pattern.measures[t.measureIndex]?.slots[t.slotIndex];
		return slot ? [slot] : [];
	});
}

/** The run's sweep, "none" for none. */
export function strokeOf(pattern: FingerpickPattern, targets: readonly SlotTarget[]): Shared<Stroke | "none"> {
	return shared(slotsOf(pattern, targets).map((s) => s.stroke ?? "none"));
}

/** The run's hit, "none" for none, and whether it is accented. */
export function hitOf(
	pattern: FingerpickPattern,
	targets: readonly SlotTarget[],
): { hit: Shared<PercussionKind | "none">; accent: Shared<boolean> } {
	const slots = slotsOf(pattern, targets);
	return {
		hit: shared(slots.map((s) => s.percussion?.kind ?? "none")),
		accent: shared(slots.filter((s) => s.percussion).map((s) => s.percussion?.accent === true)),
	};
}

export type PickDirection = "down" | "up";

/** The strings of a slot that sound: a fret or an x, the slot not a rest. */
function soundingStrings(pattern: FingerpickPattern, target: SlotTarget): number[] {
	const slot = pattern.measures[target.measureIndex]?.slots[target.slotIndex];
	if (!slot || slot.isRest) return [];
	return slot.strings.flatMap((sf, i) => (sf.fret !== null || sf.muted ? [i] : []));
}

/**
 * The run's pick stroke (⊓ / V, #440). It is a column's mark: a slot takes the
 * direction any of its sounding notes carries, and the stave draws it once over
 * the column. Slots with nothing sounding are left out; "none" when no slot sounds.
 */
export function pickOf(pattern: FingerpickPattern, targets: readonly SlotTarget[]): Shared<PickDirection | "none"> {
	const values = targets.flatMap((t): (PickDirection | "none")[] => {
		const strings = soundingStrings(pattern, t);
		if (strings.length === 0) return [];
		const slot = pattern.measures[t.measureIndex].slots[t.slotIndex];
		const marked = strings.map((i) => slot.strings[i].effects?.pick?.direction).find((d) => d !== undefined);
		return [marked ?? "none"];
	});
	return values.length > 0 ? shared(values) : { kind: "one", value: "none" };
}

/** Whether any slot of the run sounds, so a pick stroke has a note to go on. */
export function runSounds(pattern: FingerpickPattern, targets: readonly SlotTarget[]): boolean {
	return targets.some((t) => soundingStrings(pattern, t).length > 0);
}

/** The pick stroke on every sounding note of each slot of the run, or off with null. */
export function applyPick(
	pattern: FingerpickPattern,
	targets: readonly SlotTarget[],
	direction: PickDirection | null,
): FingerpickPattern {
	return targets.reduce(
		(p, t) =>
			soundingStrings(p, t).reduce(
				(q, stringIndex) => setEffect(q, { ...t, stringIndex }, "pick", direction ? { direction } : null),
				p,
			),
		pattern,
	);
}

export type InspectorTab = "note" | "effects" | "slot" | "bar";

/**
 * What the inspector can edit for the run: a run is several slots at once, so
 * the one-note parts (the note, its link and effects) wait for a single slot;
 * spans, the slot's tools and the bar take the whole run.
 */
export function sectionsFor(runLength: number): { note: boolean; effects: boolean; spans: boolean } {
	const one = runLength <= 1;
	return { note: one, effects: one, spans: true };
}

/** The shape in effect at a slot, or null with no chord (or its shapes not here yet). */
export type VoicingAt = (target: SlotTarget) => ChordVoicing | null;

function fillFromShape(pattern: FingerpickPattern, target: SlotTarget, voicingAt: VoicingAt): FingerpickPattern {
	const voicing = voicingAt(target);
	return voicing ? fillColumnFromChord(pattern, target, voicing) : pattern;
}

/**
 * A sweep over the run. A roll or a brush is a chord being sounded, so an empty
 * slot is filled from the shape in effect there; a slot holding notes outside
 * the shape is left as it is and returned in `offShape`, for the player to say
 * whether the shape should replace them. Turning the sweep off changes only the sweep.
 */
export function applySweep(
	pattern: FingerpickPattern,
	targets: readonly SlotTarget[],
	stroke: Stroke | undefined,
	voicingAt: VoicingAt,
): { pattern: FingerpickPattern; offShape: SlotTarget[] } {
	const offShape: SlotTarget[] = [];
	const next = targets.reduce((p, t) => {
		const swept = setStroke(p, t, stroke);
		if (!stroke) return swept;
		const slot = swept.measures[t.measureIndex]?.slots[t.slotIndex];
		const voicing = voicingAt(t);
		if (!slot || !voicing) return swept;
		if (!slotHasStringData(slot)) return fillColumnFromChord(swept, t, voicing);
		if (offShapeStrings(slot, chordFretHints(voicing)).length > 0) offShape.push(t);
		return swept;
	}, pattern);
	return { pattern: next, offShape };
}

/** The slots' notes replaced by the shape in effect at each: the "Overwrite" of a sweep's question. */
export function replaceWithShape(
	pattern: FingerpickPattern,
	targets: readonly SlotTarget[],
	voicingAt: VoicingAt,
): FingerpickPattern {
	return targets.reduce((p, t) => {
		let cleared = p;
		for (let stringIndex = 0; stringIndex < 6; stringIndex++) cleared = setInactive(cleared, { ...t, stringIndex });
		return fillFromShape(cleared, t, voicingAt);
	}, pattern);
}

