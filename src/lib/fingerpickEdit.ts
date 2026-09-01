import type {
	BeatSlot,
	Duration,
	FingerpickPattern,
	Measure,
	StringFret,
	Stroke,
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

// Integer-weight note durations, largest → smallest by unit weight, used by the
// split/merge controls. Triplets are excluded (fractional weight — see the
// hasIntegerUnitWeight guard in splitSlot/mergeSlots).
export const NOTE_LADDER: Duration[] = [
	"whole", // 32
	"half", // 16
	"dotted-quarter", // 12
	"quarter", // 8
	"dotted-eighth", // 6
	"eighth", // 4
	"sixteenth", // 2
	"32nd", // 1
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
	// Technique and tied are mutually exclusive on a string+slot: setting a
	// technique clears any tie.
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, (sf) => ({
		...sf,
		technique,
		tied: technique !== null ? false : sf.tied,
	}));
}

// Toggle the tied flag on a cell. Tied and technique are mutually exclusive, so
// setting tied clears the technique. Clearing tied leaves the technique alone.
export function setTied(
	pattern: FingerpickPattern,
	cell: Cell,
	tied: boolean,
): FingerpickPattern {
	return updateStringFret(pattern, cell.measureIndex, cell.slotIndex, cell.stringIndex, (sf) => ({
		...sf,
		tied,
		technique: tied ? null : sf.technique,
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
// is divisible by 3, so triplet values stay integral. A rest is not a distinct
// duration — a silent slot keeps its real `duration`, so it needs no entry here.
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

// Group slot indices by the sixteenth-note (6-tick) window their onset falls in.
// This is one subdivision finer than computeBeatGroups and independent of the time
// signature (a sixteenth is a fixed tick value). It drives the editor's mid-level
// hover wash: when a beat is subdivided finer than a sixteenth — e.g. a quarter
// beat split into eight 32nd notes — the two 32nds that make up each sixteenth are
// highlighted together, sitting between the whole-beat wash and the per-cell tint.
// A note at least a sixteenth long occupies its window alone (the windows it spans
// have no onset and are skipped), so those groups are singletons and the caller can
// leave them un-washed. Every slot appears in exactly one group.
export function computeSixteenthGroups(slots: BeatSlot[]): number[][] {
	const windowTicks = DURATION_TICKS.sixteenth; // 6

	const groups: number[][] = [];
	let current: number[] | null = null;
	let currentWindow = -1;
	let cursor = 0;
	slots.forEach((slot, i) => {
		const windowIndex = Math.floor(cursor / windowTicks);
		if (!current || windowIndex !== currentWindow) {
			current = [];
			groups.push(current);
			currentWindow = windowIndex;
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

// Toggle the silent (rest) state on every targeted slot (across any number of
// measures). A rest keeps its rhythmic `duration` — so the measure total never
// changes — but produces no sound and renders as a rest glyph.
//
// Setting a rest is silence: clear the slot's note data (and any roll stroke) so a
// rest is a true rest, not a note that renders/schedules as silence downstream while
// its fret data lingers, orphaned, in the editor. Clearing it *omits* the isRest key
// (rather than storing `false`) so a slot returned to "note" stays byte-identical to
// one that was never a rest — the modal's dirty check compares serialized snapshots.
export function setSlotsRest(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
	isRest: boolean,
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const selected = grouped.get(mi);
			if (!selected) return measure;
			return {
				...measure,
				slots: measure.slots.map((slot, si) => {
					if (!selected.has(si)) return slot;
					if (isRest) {
						const { stroke: _stroke, ...rest } = slot;
						void _stroke;
						return { ...rest, isRest: true, strings: makeStrings() };
					}
					const { isRest: _wasRest, ...note } = slot;
					void _wasRest;
					return note;
				}),
			};
		}),
	};
}

// Set (or clear) the slot-level roll stroke on a single slot. Passing `undefined`
// removes the field entirely rather than storing `undefined`, so a slot returned to
// "no roll" stays byte-identical to one that never carried a stroke — the scheduler
// keys arpeggiation off `slot.stroke !== undefined`, and the modal's dirty check
// compares serialized snapshots, so a lingering `stroke: undefined` key would falsely
// read as an edit.
export function setStroke(
	pattern: FingerpickPattern,
	target: SlotTarget,
	stroke: Stroke | undefined,
): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			if (mi !== target.measureIndex) return measure;
			return {
				...measure,
				slots: measure.slots.map((slot, si) => {
					if (si !== target.slotIndex) return slot;
					if (stroke === undefined) {
						// Omit the key so JSON output matches a stroke-free slot.
						const { stroke: _dropped, ...rest } = slot;
						void _dropped;
						return rest;
					}
					return { ...slot, stroke };
				}),
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

// Deep-clone the measure at `measureIndex` and insert the copy immediately after
// it. The clone gets a fresh measure id and fresh ids for every slot so it never
// aliases the original. No-op when the index is out of range. Measure numbers are
// derived from position, so they update automatically for the caller.
export function cloneMeasure(measures: Measure[], measureIndex: number): Measure[] {
	const measure = measures[measureIndex];
	if (!measure) return measures;
	const cloned: Measure = {
		id: crypto.randomUUID(),
		slots: measure.slots.map(cloneSlotWithNewId),
	};
	return [
		...measures.slice(0, measureIndex + 1),
		cloned,
		...measures.slice(measureIndex + 1),
	];
}

// Swap the measures at `indexA` and `indexB`. No-op when the indices are equal or
// either falls outside the array (used by the reorder arrow buttons).
export function swapMeasures(measures: Measure[], indexA: number, indexB: number): Measure[] {
	if (
		indexA === indexB ||
		indexA < 0 ||
		indexB < 0 ||
		indexA >= measures.length ||
		indexB >= measures.length
	) {
		return measures;
	}
	const next = [...measures];
	[next[indexA], next[indexB]] = [next[indexB], next[indexA]];
	return next;
}

// ── Duration arithmetic (capacity model) ─────────────────────────────────────
//
// Rhythmic value of each Duration measured in thirty-second notes (the common
// unit). A rest is not a distinct duration — a silent slot keeps its real
// `duration` and thus its real weight — so it needs no entry here. Triplet values
// are not integral in this unit; they are not offered by the split/merge UI but
// are given their exact fractional weight so sums stay honest.
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

// True when a duration's unit weight is a whole number of thirty-second-note units.
// The triplet durations (8/3, 4/3) are fractional; split/merge produce exact-fit,
// integer-count subdivisions and cannot honour a fractional target, so they guard
// against one rather than relying on callers to never pass a triplet.
export function hasIntegerUnitWeight(duration: Duration): boolean {
	return Number.isInteger(DURATION_UNITS[duration]);
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
	// Reject fractional-weight targets (triplets): they can't tile a slot into an
	// integer number of exact sub-slots.
	if (!hasIntegerUnitWeight(targetDuration)) return measures;

	const currentUnits = slotDurationUnits(slot.duration);
	const targetUnits = slotDurationUnits(targetDuration);
	if (targetUnits >= currentUnits) return measures; // target must be smaller

	const count = Math.ceil(currentUnits / targetUnits);
	const extra = count * targetUnits - currentUnits;
	if (extra > remainingUnits(measure.slots, timeSignature)) return measures; // over capacity

	const subSlots: BeatSlot[] = [];
	for (let i = 0; i < count; i++) {
		if (i === 0) {
			// First sub-slot inherits the original string data, the roll stroke AND the
			// rest flag (splitting a rest keeps the head silent), consistent with the
			// "first sub-slot inherits" rule; the rest are empty notes.
			subSlots.push({
				id: crypto.randomUUID(),
				duration: targetDuration,
				strings: cloneStrings(slot.strings),
				...(slot.stroke !== undefined ? { stroke: slot.stroke } : {}),
				...(slot.isRest ? { isRest: true } : {}),
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
	// Reject fractional-weight targets (triplets): a merge must sum to the target
	// exactly, which a fractional unit weight can never do against integer sources.
	if (!hasIntegerUnitWeight(targetDuration)) return { type: "ok", measures };

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
	// The first slot's string data is kept, so its roll stroke and rest flag are kept
	// too. When both the first and a later merged slot carry a stroke, the first wins
	// (the later slots' data — stroke included — is discarded along with everything else).
	const merged: BeatSlot = {
		id: crypto.randomUUID(),
		duration: targetDuration,
		strings: cloneStrings(first.strings),
		...(first.stroke !== undefined ? { stroke: first.stroke } : {}),
		...(first.isRest ? { isRest: true } : {}),
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

// ── Split / merge option enumeration (drives the column popup buttons) ────────

// A split/merge target: the resulting note value and how many slots it spans (for a
// split, the number of sub-slots produced; for a merge, the number of slots consumed).
export type DurationTarget = { duration: Duration; count: number };

// Integer-weight note value keyed by its thirty-second-note unit weight, used to
// resolve a prefix-sum back to a duration when enumerating merge targets.
const DURATION_BY_UNITS: Map<number, Duration> = new Map(
	NOTE_LADDER.map((d) => [slotDurationUnits(d), d] as const),
);

// Smaller note values the slot at `slotIndex` can be split into: each must divide
// the slot evenly (integer sub-slot count) and the sub-slots must fit the measure's
// remaining capacity. Ordered largest → smallest by NOTE_LADDER.
export function splitTargetsForSlot(
	measure: Measure,
	slotIndex: number,
	timeSignature: [number, number],
): DurationTarget[] {
	const slot = measure.slots[slotIndex];
	if (!slot) return [];
	const currentUnits = slotDurationUnits(slot.duration);
	const remaining = remainingUnits(measure.slots, timeSignature);
	return NOTE_LADDER.flatMap((d) => {
		const targetUnits = slotDurationUnits(d);
		if (targetUnits >= currentUnits || currentUnits % targetUnits !== 0) return [];
		const count = currentUnits / targetUnits;
		const extra = count * targetUnits - currentUnits; // 0 for even splits
		if (extra > remaining) return [];
		return [{ duration: d, count }];
	});
}

// Larger note values the slot at `slotIndex` can be merged up to: walk the prefix
// sums of [current, ...following] and, for every run of ≥ 2 slots whose durations
// sum exactly to a supported integer-weight value, offer that value. A merge keeps
// the measure total (the sum equals the target), so capacity is never at issue.
// Ordered smallest → largest target by the run length that produces it.
export function mergeTargetsForSlot(measure: Measure, slotIndex: number): DurationTarget[] {
	const slots = measure.slots;
	const results: DurationTarget[] = [];
	let sum = 0;
	for (let end = slotIndex; end < slots.length; end++) {
		sum += slotDurationUnits(slots[end].duration);
		const count = end - slotIndex + 1;
		if (count < 2) continue;
		if (sum > 32) break; // past a whole note — no larger target exists
		const duration = DURATION_BY_UNITS.get(sum);
		if (duration) results.push({ duration, count });
	}
	return results;
}

// ── Legacy-pattern normalization ──────────────────────────────────────────────

// Older saved patterns encoded a rest as `duration: "rest"` (a fixed quarter-weight
// member of the Duration union). The model now represents a rest as a per-slot
// `isRest` flag that keeps the slot's real duration. Convert any legacy rest slot on
// load — quarter duration + isRest, string data cleared — matching the old fixed
// quarter weight so the measure total is unchanged. Runs on every load path
// (Supabase rows, localStorage, tab import); a no-op for already-migrated patterns.
export function normalizeLoadedPattern(pattern: FingerpickPattern): FingerpickPattern {
	let touched = false;
	const measures = pattern.measures.map((measure) => {
		let measureTouched = false;
		const slots = measure.slots.map((slot) => {
			if ((slot.duration as string) !== "rest") return slot;
			measureTouched = true;
			touched = true;
			const { stroke: _stroke, ...rest } = slot;
			void _stroke;
			return { ...rest, duration: "quarter" as Duration, isRest: true, strings: makeStrings() };
		});
		return measureTouched ? { ...measure, slots } : measure;
	});
	return touched ? { ...pattern, measures } : pattern;
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
				newSlots[index] = {
					...newSlots[index],
					strings: cloneStrings(old.strings),
					// Preserve the roll stroke on the slot that keeps this note's data.
					...(old.stroke !== undefined ? { stroke: old.stroke } : {}),
				};
			}
			claimed.add(index);
		}
		cursor += slotDurationUnits(old.duration);
	}

	return measures.map((m, mi) => (mi === measureIndex ? { ...m, slots: newSlots } : m));
}
