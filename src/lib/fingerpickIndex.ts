import type { FingerpickPattern, Span } from "@/lib/fingerpickTypes";

/**
 * Lookups every consumer of a pattern shares, built once per pattern change:
 * where each slot is, and which spans cover it. O(N + Σ span length) to
 * build; everything after is O(1) per slot.
 */
export interface PatternIndex {
	/** Slot id → its place in the pattern. */
	slotPos: Map<string, { measure: number; slot: number }>;
	/** Slot ids in pattern order. */
	slotOrder: string[];
	/** Slot id → the spans that cover it. */
	spansAtSlot: Map<string, Span[]>;
	/** Per measure, the spans that touch it. */
	spansByMeasure: Span[][];
	/** Span id → the slot ids it covers, in order. Empty for a span whose anchors are missing or reversed. */
	spanMembers: Map<string, string[]>;
}

export function indexPattern(pattern: FingerpickPattern): PatternIndex {
	const slotPos = new Map<string, { measure: number; slot: number }>();
	const slotOrder: string[] = [];
	pattern.measures.forEach((measure, m) => {
		measure.slots.forEach((slot, s) => {
			slotPos.set(slot.id, { measure: m, slot: s });
			slotOrder.push(slot.id);
		});
	});

	const spansAtSlot = new Map<string, Span[]>();
	const spansByMeasure: Span[][] = pattern.measures.map(() => []);
	const spanMembers = new Map<string, string[]>();
	for (const span of pattern.spans ?? []) {
		const from = slotPos.get(span.from);
		const to = slotPos.get(span.to);
		const members: string[] = [];
		if (from && to) {
			const start = slotOrder.indexOf(span.from);
			const end = slotOrder.indexOf(span.to);
			if (start <= end) {
				const touched = new Set<number>();
				for (let i = start; i <= end; i++) {
					const id = slotOrder[i];
					members.push(id);
					const list = spansAtSlot.get(id);
					if (list) list.push(span);
					else spansAtSlot.set(id, [span]);
					touched.add(slotPos.get(id)!.measure);
				}
				for (const m of touched) spansByMeasure[m].push(span);
			}
		}
		spanMembers.set(span.id, members);
	}
	return { slotPos, slotOrder, spansAtSlot, spansByMeasure, spanMembers };
}

/** Whether `slotId` lies under a span of `kind` that covers `stringIndex`. */
/** A span's id from what it is: deterministic, so a migration is reproducible. */
export function spanIdFor(kind: Span["kind"], fromSlotId: string): string {
	return `${kind}:${fromSlotId}`;
}

/** Whether the note sits inside a slur span on its string, after the span's first note. */
export function slurredInside(index: PatternIndex, slotId: string, stringIndex: number): boolean {
	for (const span of index.spansAtSlot.get(slotId) ?? []) {
		if (span.kind !== "slur") continue;
		if (span.strings && !span.strings.includes(stringIndex)) continue;
		const members = index.spanMembers.get(span.id) ?? [];
		if (members[0] !== slotId) return true;
	}
	return false;
}

export function spanCovers(index: PatternIndex, slotId: string, kind: Span["kind"], stringIndex: number): boolean {
	const spans = index.spansAtSlot.get(slotId);
	if (!spans) return false;
	return spans.some((s) => s.kind === kind && (s.strings === undefined || s.strings.includes(stringIndex)));
}
