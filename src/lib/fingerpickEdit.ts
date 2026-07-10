import type {
	BeatSlot,
	Duration,
	FingerpickPattern,
	Measure,
	StringFret,
	Technique,
} from "./fingerpickTypes";

// ── Cell / target identity ───────────────────────────────────────────────────

export type Cell = {
	measureIndex: number;
	slotIndex: number;
	stringIndex: number;
};

export type SlotTarget = {
	measureIndex: number;
	slotIndex: number;
};

export type Direction = "up" | "down" | "left" | "right";

// String order top→bottom in the editor grid: e B G D A E (stringIndex 0–5).
export const STRING_LABELS = ["e", "B", "G", "D", "A", "E"] as const;

export const MIN_FRET = 0;
export const MAX_FRET = 24;

// Duration picker options exposed in the column popup, in display order.
export const DURATION_PICKER: { label: string; value: Duration }[] = [
	{ label: "W", value: "whole" },
	{ label: "H", value: "half" },
	{ label: "Q", value: "quarter" },
	{ label: "E", value: "eighth" },
	{ label: "S", value: "sixteenth" },
	{ label: "R", value: "rest" },
];

// ── Factories ────────────────────────────────────────────────────────────────

export function makeEmptyStringFret(): StringFret {
	return { fret: null, technique: null, tied: false, muted: false };
}

function makeStrings(): BeatSlot["strings"] {
	return [
		makeEmptyStringFret(),
		makeEmptyStringFret(),
		makeEmptyStringFret(),
		makeEmptyStringFret(),
		makeEmptyStringFret(),
		makeEmptyStringFret(),
	];
}

export function makeEmptySlot(duration: Duration = "quarter"): BeatSlot {
	return { id: crypto.randomUUID(), duration, strings: makeStrings() };
}

export function makeEmptyMeasure(): Measure {
	return {
		id: crypto.randomUUID(),
		slots: [
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
			makeEmptySlot("quarter"),
		],
	};
}

// Fresh 1-measure / 4-quarter-note pattern for the "new pattern from scratch" flow.
export function makeDefaultPattern(): FingerpickPattern {
	return {
		id: crypto.randomUUID(),
		name: "",
		description: "",
		bpm: 100,
		timeSignature: [4, 4],
		measures: [makeEmptyMeasure()],
	};
}

// Deep clone with regenerated ids so an edit session never mutates the source
// pattern (which may still be referenced by the library / selected pattern).
export function clonePatternForEdit(pattern: FingerpickPattern): FingerpickPattern {
	const cloned = structuredClone(pattern);
	return cloned;
}

function cloneSlotWithNewId(slot: BeatSlot): BeatSlot {
	return { ...structuredClone(slot), id: crypto.randomUUID() };
}

// ── StringFret-level edits ───────────────────────────────────────────────────

function updateStringFret(
	pattern: FingerpickPattern,
	measureIndex: number,
	slotIndex: number,
	stringIndex: number,
	updater: (sf: StringFret) => StringFret,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) =>
			mi !== measureIndex
				? measure
				: {
						...measure,
						slots: measure.slots.map((slot, si) =>
							si !== slotIndex
								? slot
								: {
										...slot,
										strings: slot.strings.map((sf, sti) =>
											sti !== stringIndex ? sf : updater(sf),
										) as BeatSlot["strings"],
									},
						),
					},
		),
	};
}

export function clampFret(fret: number): number {
	return Math.max(MIN_FRET, Math.min(MAX_FRET, fret));
}

// Set a fret value on a cell — activates the string and clears the muted flag.
export function setFret(pattern: FingerpickPattern, cell: Cell, fret: number): FingerpickPattern {
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, (sf) => ({
		...sf,
		fret: clampFret(fret),
		muted: false,
	}));
}

// Clear a cell back to inactive (string not in play for this slot).
export function setInactive(pattern: FingerpickPattern, cell: Cell): FingerpickPattern {
	return updateStringFret(
		pattern,
		cell.measureIndex,
		cell.slotIndex,
		cell.stringIndex,
		() => makeEmptyStringFret(),
	);
}

// Toggle the muted ("x") state on a cell. Muting clears any fret/technique.
export function toggleMuted(pattern: FingerpickPattern, cell: Cell): FingerpickPattern {
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, (sf) =>
		sf.muted
			? makeEmptyStringFret()
			: { fret: null, technique: null, tied: false, muted: true },
	);
}

export function setTechnique(
	pattern: FingerpickPattern,
	cell: Cell,
	technique: Technique,
): FingerpickPattern {
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, (sf) => ({
		...sf,
		technique,
	}));
}

// The StringFret occupying the same string in the slot immediately before `cell`
// (previous slot in the measure, or last slot of the previous measure). null at
// the very start of the pattern.
export function previousSlotFret(pattern: FingerpickPattern, cell: Cell): StringFret | null {
	const { measureIndex, slotIndex, stringIndex } = cell;
	if (slotIndex > 0) {
		return pattern.measures[measureIndex].slots[slotIndex - 1].strings[stringIndex];
	}
	if (measureIndex > 0) {
		const prevSlots = pattern.measures[measureIndex - 1].slots;
		return prevSlots[prevSlots.length - 1].strings[stringIndex];
	}
	return null;
}

// A technique (hammer-on / pull-off / slide) needs a sounding note on the same
// string in the previous slot to connect from.
export function hasPreviousNoteOnString(pattern: FingerpickPattern, cell: Cell): boolean {
	const sf = previousSlotFret(pattern, cell);
	return !!sf && sf.fret !== null && !sf.muted;
}

// ── Keyboard navigation ──────────────────────────────────────────────────────

// Move the focused cell one step. up/down clamp within the 6 strings; left/right
// wrap into the adjacent measure at a measure boundary.
export function moveCell(pattern: FingerpickPattern, cell: Cell, direction: Direction): Cell {
	const { measureIndex, slotIndex, stringIndex } = cell;
	const measures = pattern.measures;

	if (direction === "up") return { ...cell, stringIndex: Math.max(0, stringIndex - 1) };
	if (direction === "down") return { ...cell, stringIndex: Math.min(5, stringIndex + 1) };

	if (direction === "left") {
		if (slotIndex > 0) return { ...cell, slotIndex: slotIndex - 1 };
		if (measureIndex > 0) {
			const prevLen = measures[measureIndex - 1].slots.length;
			return { measureIndex: measureIndex - 1, slotIndex: prevLen - 1, stringIndex };
		}
		return cell;
	}

	// right
	const curLen = measures[measureIndex].slots.length;
	if (slotIndex < curLen - 1) return { ...cell, slotIndex: slotIndex + 1 };
	if (measureIndex < measures.length - 1) {
		return { measureIndex: measureIndex + 1, slotIndex: 0, stringIndex };
	}
	return cell;
}

// ── Slot / measure structural edits ─────────────────────────────────────────

function groupTargetsByMeasure(targets: SlotTarget[]): Map<number, Set<number>> {
	const map = new Map<number, Set<number>>();
	for (const t of targets) {
		if (!map.has(t.measureIndex)) map.set(t.measureIndex, new Set());
		map.get(t.measureIndex)!.add(t.slotIndex);
	}
	return map;
}

// Apply a duration to every targeted slot (across any number of measures).
export function setSlotsDuration(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
	duration: Duration,
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const selected = grouped.get(mi);
			if (!selected) return measure;
			return {
				...measure,
				slots: measure.slots.map((slot, si) =>
					selected.has(si) ? { ...slot, duration } : slot,
				),
			};
		}),
	};
}

// Insert a fresh quarter-note slot before/after each targeted slot.
export function insertSlots(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
	position: "before" | "after",
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const selected = grouped.get(mi);
			if (!selected) return measure;
			const newSlots: BeatSlot[] = [];
			measure.slots.forEach((slot, si) => {
				if (selected.has(si) && position === "before") newSlots.push(makeEmptySlot());
				newSlots.push(slot);
				if (selected.has(si) && position === "after") newSlots.push(makeEmptySlot());
			});
			return { ...measure, slots: newSlots };
		}),
	};
}

// Duplicate each targeted slot, placing the copy immediately after the original.
export function duplicateSlots(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const selected = grouped.get(mi);
			if (!selected) return measure;
			const newSlots: BeatSlot[] = [];
			measure.slots.forEach((slot, si) => {
				newSlots.push(slot);
				if (selected.has(si)) newSlots.push(cloneSlotWithNewId(slot));
			});
			return { ...measure, slots: newSlots };
		}),
	};
}

// Delete every targeted slot. A measure never drops below one slot — if a delete
// would empty it, a single fresh quarter slot is left behind.
export function deleteSlots(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const selected = grouped.get(mi);
			if (!selected) return measure;
			const remaining = measure.slots.filter((_, si) => !selected.has(si));
			return { ...measure, slots: remaining.length > 0 ? remaining : [makeEmptySlot()] };
		}),
	};
}

// Append a quarter-note slot (all strings inactive) to a measure.
export function addSlotToMeasure(
	pattern: FingerpickPattern,
	measureIndex: number,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) =>
			mi !== measureIndex ? measure : { ...measure, slots: [...measure.slots, makeEmptySlot()] },
		),
	};
}

export function addMeasure(pattern: FingerpickPattern): FingerpickPattern {
	return { ...pattern, measures: [...pattern.measures, makeEmptyMeasure()] };
}

// Remove a measure. No-op when only one measure remains (the pattern must keep at
// least one).
export function deleteMeasure(
	pattern: FingerpickPattern,
	measureIndex: number,
): FingerpickPattern {
	if (pattern.measures.length <= 1) return pattern;
	return { ...pattern, measures: pattern.measures.filter((_, mi) => mi !== measureIndex) };
}
