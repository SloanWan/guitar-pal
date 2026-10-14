import type {
	EffectKind,
	FingerpickPattern,
	Link,
	LinkKind,
	NoteEffects,
	Percussion,
	Span,
	SpanKind,
	StringFret,
} from "./fingerpickTypes";
import {
	MAX_FRET,
	previousSlotFret,
	updateStringFret,
	type Cell,
	type SlotTarget,
} from "./fingerpickEdit";
import { indexPattern, spanIdFor } from "./fingerpickIndex";
import { techniqueDef, type AvailabilityBlock, type NoteContext } from "./techniqueRegistry";

/**
 * The editor's technique writes: a `link` on the note, an entry in its
 * `effects`, a `percussion` hit on the slot, a span over a run of slots.
 * Pure, like the rest of the edit library.
 */

// ── Availability ─────────────────────────────────────────────────────────────

function noteAt(pattern: FingerpickPattern, cell: Cell): StringFret | null {
	return pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex] ?? null;
}

/** The note in `cell` as the registry's availability rules see it; null when the cell does not exist. */
export function noteContext(pattern: FingerpickPattern, cell: Cell): NoteContext | null {
	const sf = noteAt(pattern, cell);
	if (!sf) return null;
	const prev = previousSlotFret(pattern, cell);
	return {
		fret: sf.fret,
		muted: sf.muted,
		prev: prev ? { fret: prev.fret, muted: prev.muted } : null,
		maxFret: MAX_FRET,
	};
}

/**
 * Why `kind` cannot go on the note in `cell`, or null when it can. A bend is
 * checked against the height it would write (`bendSemitones`), so a high note
 * can still take a quarter bend when a full one would leave the neck.
 */
export function techniqueBlock(
	pattern: FingerpickPattern,
	cell: Cell,
	kind: string,
	bendSemitones?: number,
): AvailabilityBlock | null {
	const ctx = noteContext(pattern, cell);
	if (!ctx) return "no-note";
	const def = techniqueDef(kind);
	const block = def?.available ? def.available(ctx) : null;
	if (block) return block;
	if (kind === "bend" && bendSemitones !== undefined && ctx.fret !== null) {
		return ctx.fret + Math.ceil(bendSemitones) <= MAX_FRET ? null : "off-neck";
	}
	return null;
}

// ── Links and effects on one note ────────────────────────────────────────────

function writeNote(
	pattern: FingerpickPattern,
	cell: Cell,
	updater: (sf: StringFret) => StringFret,
): FingerpickPattern {
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, updater);
}

/** Write (or with null, remove) the note's link. A note arrives one way, so this replaces any other link. */
export function setLink(pattern: FingerpickPattern, cell: Cell, link: Link | null): FingerpickPattern {
	return writeNote(pattern, cell, (sf) => {
		const { link: _old, ...rest } = sf;
		void _old;
		return link ? { ...rest, link } : rest;
	});
}

/** The link of `kind` on, or — when the note already has that kind — off. */
export function toggleLink(pattern: FingerpickPattern, cell: Cell, kind: LinkKind): FingerpickPattern {
	const current = noteAt(pattern, cell)?.link;
	if (current?.kind === kind) return setLink(pattern, cell, null);
	return setLink(pattern, cell, { kind } as Link);
}

/** Write (or with null, remove) one effect on the note; the others stay. */
export function setEffect<K extends EffectKind>(
	pattern: FingerpickPattern,
	cell: Cell,
	kind: K,
	params: NoteEffects[K] | null,
): FingerpickPattern {
	return writeNote(pattern, cell, (sf) => {
		const effects: NoteEffects = { ...sf.effects };
		if (params === null || params === undefined) delete effects[kind];
		else effects[kind] = params;
		const { effects: _old, ...rest } = sf;
		void _old;
		return Object.keys(effects).length > 0 ? { ...rest, effects } : rest;
	});
}

/** The note without its link and effects (spans and the slot's hit are not the note's). */
export function clearNoteMarks(pattern: FingerpickPattern, cell: Cell): FingerpickPattern {
	return writeNote(pattern, cell, (sf) => {
		const { link: _link, effects: _effects, ...rest } = sf;
		void _link;
		void _effects;
		return rest;
	});
}

// ── Keyboard cycles ──────────────────────────────────────────────────────────
// B steps a bend up through its heights and into a release and round again; V
// toggles vibrato and wide vibrato.

const BEND_CYCLE: readonly NonNullable<NoteEffects["bend"]>[] = [
	{ semitones: 0.5 },
	{ semitones: 1 },
	{ semitones: 2 },
	{ semitones: 2, release: true },
];

export function nextBend(current: NoteEffects["bend"] | undefined): NonNullable<NoteEffects["bend"]> {
	if (!current) return BEND_CYCLE[0];
	const i = BEND_CYCLE.findIndex(
		(b) => b.semitones === current.semitones && !!b.release === !!current.release && !current.pre,
	);
	return BEND_CYCLE[(i + 1) % BEND_CYCLE.length];
}

export function nextVibrato(current: NoteEffects["vibrato"] | undefined): NonNullable<NoteEffects["vibrato"]> {
	if (!current) return {};
	return current.wide ? {} : { wide: true };
}

// ── Percussion on a slot ─────────────────────────────────────────────────────

/** Write (or with undefined, remove) the slot's hit. A hit and a sweep cannot share a slot: the hit replaces the sweep. */
export function setPercussion(
	pattern: FingerpickPattern,
	target: SlotTarget,
	percussion: Percussion | undefined,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			if (mi !== target.measureIndex) return measure;
			return {
				...measure,
				slots: measure.slots.map((slot, si) => {
					if (si !== target.slotIndex) return slot;
					const { percussion: _hit, stroke: _stroke, ...rest } = slot;
					void _hit;
					void _stroke;
					if (!percussion) return _stroke !== undefined ? { ...rest, stroke: _stroke } : rest;
					return { ...rest, percussion };
				}),
			};
		}),
	};
}

// ── Spans over runs of slots ─────────────────────────────────────────────────

function slotIdAt(pattern: FingerpickPattern, target: SlotTarget): string | null {
	return pattern.measures[target.measureIndex]?.slots[target.slotIndex]?.id ?? null;
}

/** Whether a span of `kind` lies over the slot (on any of its strings). */
export function spanCoversSlot(pattern: FingerpickPattern, kind: SpanKind, target: SlotTarget): boolean {
	const id = slotIdAt(pattern, target);
	if (!id) return false;
	return (indexPattern(pattern).spansAtSlot.get(id) ?? []).some((span) => span.kind === kind);
}

/**
 * Spans of `kind` rewritten so that exactly the slots in `targets` change:
 * covered when `on`, bare otherwise. Runs are rebuilt from the coverage, so
 * extending a run beside an existing span lengthens that span and clearing a
 * slot inside one splits it; a span that keeps its first slot keeps its id.
 * Rebuilt spans cover every string of their slots. Other kinds are untouched;
 * the flags follow.
 */
export function setSpanOver(
	pattern: FingerpickPattern,
	kind: SpanKind,
	targets: readonly SlotTarget[],
	on: boolean,
): FingerpickPattern {
	const index = indexPattern(pattern);
	const order = index.slotOrder;
	const covered = order.map((id) => (index.spansAtSlot.get(id) ?? []).some((span) => span.kind === kind));
	let changed = false;
	for (const target of targets) {
		const id = slotIdAt(pattern, target);
		if (!id) continue;
		const at = order.indexOf(id);
		if (at >= 0 && covered[at] !== on) {
			covered[at] = on;
			changed = true;
		}
	}
	if (!changed) return pattern;
	const existingByFrom = new Map((pattern.spans ?? []).filter((s) => s.kind === kind).map((s) => [s.from, s]));
	const rebuilt: Span[] = [];
	let runStart = -1;
	for (let i = 0; i <= order.length; i++) {
		const isOn = i < order.length && covered[i];
		if (isOn && runStart < 0) runStart = i;
		if (!isOn && runStart >= 0) {
			const from = order[runStart];
			const to = order[i - 1];
			const kept = existingByFrom.get(from);
			rebuilt.push({ id: kept?.id ?? spanIdFor(kind, from), kind, from, to });
			runStart = -1;
		}
	}
	const others = (pattern.spans ?? []).filter((s) => s.kind !== kind);
	const spans = [...others, ...rebuilt];
	if (spans.length === 0) {
		const { spans: _none, ...rest } = pattern;
		void _none;
		return rest;
	}
	return { ...pattern, spans };
}

/** The span of `kind` off every target when all of them are under one, on otherwise. */
export function toggleSpanOver(
	pattern: FingerpickPattern,
	kind: SpanKind,
	targets: readonly SlotTarget[],
): FingerpickPattern {
	const all = targets.length > 0 && targets.every((t) => spanCoversSlot(pattern, kind, t));
	return setSpanOver(pattern, kind, targets, !all);
}

/** The slot a cell sits in. */
export function slotOf(cell: Cell): SlotTarget {
	return { measureIndex: cell.measureIndex, slotIndex: cell.slotIndex };
}

/** A span's slots as `SlotTarget`s, for callers that address by position. */
export function spanTargets(pattern: FingerpickPattern, span: Span): SlotTarget[] {
	const index = indexPattern(pattern);
	return (index.spanMembers.get(span.id) ?? []).flatMap((id) => {
		const pos = index.slotPos.get(id);
		return pos ? [{ measureIndex: pos.measure, slotIndex: pos.slot }] : [];
	});
}
