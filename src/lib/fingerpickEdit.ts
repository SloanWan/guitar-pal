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

// ── Beat position labels ─────────────────────────────────────────────────────

// Rhythmic value of each Duration in ticks, where one whole note = 96 ticks. 96
// is divisible by 3, so triplet values stay integral. A rest carries no inherent
// length in the data model, so it is treated as a quarter-beat's worth of time.
const TICKS_PER_WHOLE = 96;

const DURATION_TICKS: Record<Duration, number> = {
	whole: 96,
	half: 48,
	quarter: 24,
	"dotted-quarter": 36,
	eighth: 12,
	"dotted-eighth": 18,
	"eighth-triplet": 8,
	sixteenth: 6,
	"sixteenth-triplet": 4,
	"32nd": 3,
	rest: 24,
};

// Standard counting syllables for a single beat subdivided into `subdivisions`
// equal parts. Index 0 is always the beat number itself. Unknown subdivision
// counts fall back to numbering only the downbeat.
function subdivisionSequence(subdivisions: number, beatLabel: string): string[] {
	switch (subdivisions) {
		case 1:
			return [beatLabel];
		case 2:
			return [beatLabel, "+"];
		case 3:
			return [beatLabel, "trip", "let"];
		case 4:
			return [beatLabel, "e", "+", "a"];
		case 6:
			return [beatLabel, "trip", "let", "+", "trip", "let"];
		case 8:
			return [beatLabel, "ta", "e", "ta", "+", "ta", "a", "ta"];
		default: {
			const seq = new Array<string>(subdivisions).fill("");
			seq[0] = beatLabel;
			return seq;
		}
	}
}

// Compute the beat-position label for every slot in a measure. The beat unit is
// derived from the time signature denominator (/4 → quarter, /8 → eighth). Slots
// are grouped by the beat their onset falls in: a lone slot in a beat is labelled
// with the beat number ("1", "2", …); a beat holding several onsets is subdivided
// to the finest value present and labelled with counting syllables (e.g. quarter
// → sixteenths gives "1 e + a"). A note spanning multiple beats is labelled with
// its starting beat number and simply leaves the beats it covers unlabelled.
//
// The returned array is always the same length as `slots` — exactly one label per
// slot — so callers can render one label under each column.
export function computeBeatLabels(
	slots: BeatSlot[],
	timeSignature: [number, number],
): string[] {
	const denominator = timeSignature[1];
	const beatTicks = TICKS_PER_WHOLE / denominator; // quarter = 24, eighth = 12

	const labels = new Array<string>(slots.length).fill("");

	// Assign each slot to the beat its onset (cumulative start tick) falls in.
	const beats = new Map<number, { slotIndex: number; startTick: number }[]>();
	let cursor = 0;
	slots.forEach((slot, i) => {
		const beatIndex = Math.floor(cursor / beatTicks);
		const group = beats.get(beatIndex);
		if (group) group.push({ slotIndex: i, startTick: cursor });
		else beats.set(beatIndex, [{ slotIndex: i, startTick: cursor }]);
		cursor += DURATION_TICKS[slot.duration];
	});

	for (const [beatIndex, group] of beats) {
		const beatLabel = String(beatIndex + 1);
		if (group.length === 1) {
			labels[group[0].slotIndex] = beatLabel;
			continue;
		}
		// Several onsets share this beat: subdivide to the finest value present.
		const beatStart = beatIndex * beatTicks;
		const smallest = Math.min(
			...group.map((g) => DURATION_TICKS[slots[g.slotIndex].duration]),
		);
		const subdivisions = Math.max(2, Math.round(beatTicks / smallest));
		const seq = subdivisionSequence(subdivisions, beatLabel);
		for (const g of group) {
			const idx = Math.round((g.startTick - beatStart) / smallest);
			labels[g.slotIndex] = idx >= 0 && idx < seq.length ? seq[idx] : "";
		}
	}

	return labels;
}

// Group slot indices by the beat their onset falls in, using the same beat unit
// as computeBeatLabels (time signature denominator: /4 → quarter, /8 → eighth).
// Each returned inner array lists the slot indices belonging to one beat, in
// order. Beats are returned in playing order and every slot appears in exactly
// one group, so the flattened result is [0, 1, …, slots.length - 1].
// Example: 4/4 [quarter, eighth, eighth, quarter, quarter] → [[0], [1, 2], [3], [4]].
export function computeBeatGroups(
	slots: BeatSlot[],
	timeSignature: [number, number],
): number[][] {
	const denominator = timeSignature[1];
	const beatTicks = TICKS_PER_WHOLE / denominator; // quarter = 24, eighth = 12

	const groups: number[][] = [];
	let current: number[] | null = null;
	let currentBeat = -1;
	let cursor = 0;
	slots.forEach((slot, i) => {
		const beatIndex = Math.floor(cursor / beatTicks);
		if (!current || beatIndex !== currentBeat) {
			current = [];
			groups.push(current);
			currentBeat = beatIndex;
		}
		current.push(i);
		cursor += DURATION_TICKS[slot.duration];
	});

	return groups;
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

// ── Duration arithmetic (capacity model) ─────────────────────────────────────
//
// Rhythmic value of each Duration measured in thirty-second notes (the common
// unit). A rest carries no inherent length in the data model, so — like the beat
// label logic — it is treated as a quarter's worth of time for capacity purposes.
// Triplet values are not integral in this unit; they are not offered by the
// split/merge UI but are given their exact fractional weight so sums stay honest.
export const DURATION_UNITS: Record<Duration, number> = {
	whole: 32,
	half: 16,
	quarter: 8,
	"dotted-quarter": 12,
	eighth: 4,
	"dotted-eighth": 6,
	"eighth-triplet": 8 / 3,
	sixteenth: 2,
	"sixteenth-triplet": 4 / 3,
	"32nd": 1,
	rest: 8,
};

// Total capacity of a measure in thirty-second-note units. 4/4 → 32, 3/4 → 24,
// 6/8 → 24 (numerator × 32/denominator).
export function measureCapacity(timeSignature: [number, number]): number {
	const [numerator, denominator] = timeSignature;
	return numerator * (32 / denominator);
}

export function slotDurationUnits(duration: Duration): number {
	return DURATION_UNITS[duration];
}

export function usedUnits(slots: BeatSlot[]): number {
	return slots.reduce((sum, slot) => sum + slotDurationUnits(slot.duration), 0);
}

export function remainingUnits(slots: BeatSlot[], timeSignature: [number, number]): number {
	return measureCapacity(timeSignature) - usedUnits(slots);
}

// A slot "has data" when any string is sounding (a fret) or muted. Techniques and
// ties never exist without an underlying fret, so a fret/mute test is sufficient.
export function slotHasStringData(slot: BeatSlot): boolean {
	return slot.strings.some((sf) => sf.fret !== null || sf.muted);
}

function cloneStrings(strings: BeatSlot["strings"]): BeatSlot["strings"] {
	return strings.map((sf) => ({ ...sf })) as BeatSlot["strings"];
}

// ── Split / merge / reset / remap (measure-level, immutable) ──────────────────

// Split a slot into N sub-slots of `targetDuration`. The first sub-slot inherits
// the original string data; the rest are empty. N is chosen to cover the original
// slot's duration; any extra units the sub-slots add beyond the original must fit
// in the measure's remaining capacity. Returns the measures unchanged when the
// target is not smaller than the current slot or capacity would be exceeded.
export function splitSlot(
	measures: Measure[],
	measureIndex: number,
	slotIndex: number,
	targetDuration: Duration,
	timeSignature: [number, number],
): Measure[] {
	const measure = measures[measureIndex];
	if (!measure) return measures;
	const slot = measure.slots[slotIndex];
	if (!slot) return measures;

	const currentUnits = slotDurationUnits(slot.duration);
	const targetUnits = slotDurationUnits(targetDuration);
	if (targetUnits >= currentUnits) return measures; // target must be smaller

	const count = Math.ceil(currentUnits / targetUnits);
	const extra = count * targetUnits - currentUnits;
	if (extra > remainingUnits(measure.slots, timeSignature)) return measures; // over capacity

	const subSlots: BeatSlot[] = [];
	for (let i = 0; i < count; i++) {
		if (i === 0) {
			subSlots.push({
				id: crypto.randomUUID(),
				duration: targetDuration,
				strings: cloneStrings(slot.strings),
			});
		} else {
			subSlots.push(makeEmptySlot(targetDuration));
		}
	}

	const newSlots = [
		...measure.slots.slice(0, slotIndex),
		...subSlots,
		...measure.slots.slice(slotIndex + 1),
	];
	return measures.map((m, mi) => (mi === measureIndex ? { ...m, slots: newSlots } : m));
}

export type MergeResult =
	| { type: "ok"; measures: Measure[] }
	| { type: "confirm"; affectedSlotCount: number; pendingMeasures: Measure[] };

// Merge the slot at `slotIndex` with the following slots whose durations sum
// exactly to `targetDuration`, into a single slot of that duration. The first
// slot's string data is kept; the rest is discarded. When any of the discarded
// slots carried data, the caller is asked to confirm (the merge is still computed
// and returned as `pendingMeasures`). Returns an unchanged `ok` result when the
// merge is not valid (not enough following slots, or durations don't line up).
export function mergeSlots(
	measures: Measure[],
	measureIndex: number,
	slotIndex: number,
	targetDuration: Duration,
	// Part of the shared split/merge/reset/remap signature; the merge validates
	// purely against the existing slot durations so capacity is not consulted here.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	timeSignature: [number, number],
): MergeResult {
	const measure = measures[measureIndex];
	if (!measure) return { type: "ok", measures };

	const targetUnits = slotDurationUnits(targetDuration);
	let sum = 0;
	let end = slotIndex;
	while (end < measure.slots.length && sum < targetUnits) {
		sum += slotDurationUnits(measure.slots[end].duration);
		end++;
	}
	const consumed = end - slotIndex;
	// Need an exact fit spanning at least the current slot plus one following slot.
	if (sum !== targetUnits || consumed < 2) return { type: "ok", measures };

	const first = measure.slots[slotIndex];
	const merged: BeatSlot = {
		id: crypto.randomUUID(),
		duration: targetDuration,
		strings: cloneStrings(first.strings),
	};
	const newSlots = [
		...measure.slots.slice(0, slotIndex),
		merged,
		...measure.slots.slice(end),
	];
	const pendingMeasures = measures.map((m, mi) =>
		mi === measureIndex ? { ...m, slots: newSlots } : m,
	);

	const discarded = measure.slots.slice(slotIndex + 1, end);
	const affectedSlotCount = discarded.filter(slotHasStringData).length;
	if (affectedSlotCount > 0) {
		return { type: "confirm", affectedSlotCount, pendingMeasures };
	}
	return { type: "ok", measures: pendingMeasures };
}

export type ResetResult =
	| { type: "ok"; measures: Measure[] }
	| { type: "confirm"; measures: Measure[] };

// Replace every slot in a measure with (capacity / targetDuration) fresh empty
// slots. When the measure already holds string data, the reset is returned as a
// `confirm` result so the caller can offer a keep-data (remap) alternative before
// clearing.
export function resetMeasure(
	measures: Measure[],
	measureIndex: number,
	targetDuration: Duration,
	timeSignature: [number, number],
): ResetResult {
	const measure = measures[measureIndex];
	if (!measure) return { type: "ok", measures };

	const count = Math.max(
		1,
		Math.round(measureCapacity(timeSignature) / slotDurationUnits(targetDuration)),
	);
	const newSlots = Array.from({ length: count }, () => makeEmptySlot(targetDuration));
	const newMeasures = measures.map((m, mi) =>
		mi === measureIndex ? { ...m, slots: newSlots } : m,
	);

	const hasData = measure.slots.some(slotHasStringData);
	return { type: hasData ? "confirm" : "ok", measures: newMeasures };
}

// Rebuild a measure at a new uniform duration while preserving existing string
// data by position in time. Each new slot is claimed by the first existing slot
// whose onset falls within it: on a split (target smaller) the leading sub-slot
// keeps the data and the rest are empty; on a merge (target larger) the first of
// the merged slots wins and the others are discarded.
export function remapMeasure(
	measures: Measure[],
	measureIndex: number,
	targetDuration: Duration,
	timeSignature: [number, number],
): Measure[] {
	const measure = measures[measureIndex];
	if (!measure) return measures;

	const targetUnits = slotDurationUnits(targetDuration);
	const count = Math.max(1, Math.round(measureCapacity(timeSignature) / targetUnits));
	const newSlots = Array.from({ length: count }, () => makeEmptySlot(targetDuration));

	const claimed = new Set<number>();
	let cursor = 0;
	for (const old of measure.slots) {
		const index = Math.floor(cursor / targetUnits);
		if (index < count && !claimed.has(index)) {
			if (slotHasStringData(old)) {
				newSlots[index] = { ...newSlots[index], strings: cloneStrings(old.strings) };
			}
			claimed.add(index);
		}
		cursor += slotDurationUnits(old.duration);
	}

	return measures.map((m, mi) => (mi === measureIndex ? { ...m, slots: newSlots } : m));
}
