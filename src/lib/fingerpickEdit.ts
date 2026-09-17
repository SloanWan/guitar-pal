import type {
	BeatSlot,
	Duration,
	FingerpickPattern,
	Measure,
	StringFret,
	Stroke,
	Technique,
} from "./fingerpickTypes";
import { rescaleBpmForMeter } from "./strumBars";
import { isCompound, type Meter } from "./strumMeter";
import { normalizeCapo } from "./strumProgressions";

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

// ── Rhythmic scale ───────────────────────────────────────────────────────────

// Rhythmic value of each Duration in ticks, where one whole note = 96 ticks. 96
// is divisible by 3, so triplet values stay integral and measure totals compare
// exactly. This is the one scale every piece of editor bookkeeping (capacity,
// split/merge, remap, chord carry, beat labels, Pick) sums in. A rest is not a
// distinct duration — a silent slot keeps its real `duration` — so it needs no
// entry here.
export const TICKS_PER_WHOLE = 96;

export const DURATION_TICKS: Record<Duration, number> = {
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

export type TripletDuration = "eighth-triplet" | "sixteenth-triplet";

export function isTripletDuration(duration: Duration): duration is TripletDuration {
	return duration === "eighth-triplet" || duration === "sixteenth-triplet";
}

// The plain value three of a triplet add up to, and the triplet a plain value
// splits into three of. Only the quarter and the eighth have a triplet.
export function tripletPlainValue(duration: TripletDuration): Duration {
	return duration === "eighth-triplet" ? "quarter" : "eighth";
}

// The note a triplet member is written as: three eighths under a `3` bracket.
export function tripletWrittenValue(duration: TripletDuration): Duration {
	return duration === "eighth-triplet" ? "eighth" : "sixteenth";
}

export function tripletForPlainValue(duration: Duration): TripletDuration | null {
	if (duration === "quarter") return "eighth-triplet";
	if (duration === "eighth") return "sixteenth-triplet";
	return null;
}

// ── Triplet groups ───────────────────────────────────────────────────────────
//
// A triplet is three notes under one `3` bracket; a lone triplet slot is not a
// note. Consecutive slots of the same triplet value are chunked in threes from
// the start of the run — the same rule the stave uses to place its brackets —
// and a leftover one or two at the end of a run belong to no group. The editor
// never produces a leftover (structural edits act on the whole group, below);
// imported data can, and simply renders unbracketed.

export type TripletGroup = { start: number; duration: TripletDuration };

export const TRIPLET_GROUP_SIZE = 3;

export function tripletGroups(slots: readonly BeatSlot[]): TripletGroup[] {
	const groups: TripletGroup[] = [];
	let i = 0;
	while (i < slots.length) {
		const duration = slots[i].duration;
		if (!isTripletDuration(duration)) {
			i++;
			continue;
		}
		let end = i;
		while (end < slots.length && slots[end].duration === duration) end++;
		for (let start = i; start + TRIPLET_GROUP_SIZE <= end; start += TRIPLET_GROUP_SIZE) {
			groups.push({ start, duration });
		}
		i = end;
	}
	return groups;
}

// The group the slot at `slotIndex` belongs to, or null for a plain slot or a
// leftover triplet.
export function tripletGroupAt(slots: readonly BeatSlot[], slotIndex: number): TripletGroup | null {
	return (
		tripletGroups(slots).find(
			(g) => slotIndex >= g.start && slotIndex < g.start + TRIPLET_GROUP_SIZE,
		) ?? null
	);
}

// Grow a set of slot indices so that selecting any member of a triplet group
// selects the whole group.
export function expandTripletGroups(
	slots: readonly BeatSlot[],
	selected: ReadonlySet<number>,
): Set<number> {
	const out = new Set(selected);
	for (const g of tripletGroups(slots)) {
		const members = [g.start, g.start + 1, g.start + 2];
		if (members.some((m) => selected.has(m))) members.forEach((m) => out.add(m));
	}
	return out;
}

// Plain and dotted note values, largest → smallest, used by the split/merge
// controls. Triplets are not on the ladder: they only exist as a group of three
// under one bracket, so they are offered through their own targets rather than
// as a rung a slot can be tiled with.
export const NOTE_LADDER: Duration[] = [
	"whole", // 96
	"half", // 48
	"dotted-quarter", // 36
	"quarter", // 24
	"dotted-eighth", // 18
	"eighth", // 12
	"sixteenth", // 6
	"32nd", // 3
];

// ── Meter ────────────────────────────────────────────────────────────────────
//
// The meter model is strum's (`strumMeter.ts`): a compound meter (6/8, 12/8) is
// counted in dotted-quarter beats of three eighths, not in eighths. Everything
// here that needs "the beat" reads it from `beatTicks`; nothing reads the
// denominator on its own.

/** The time signatures the fingerpick editor offers, in menu order. */
export const FINGERPICK_TIME_SIGNATURES: readonly [number, number][] = [
	[4, 4],
	[3, 4],
	[2, 4],
	[6, 8],
	[12, 8],
];

/** Ticks in one beat: a quarter (24) in a simple meter, a dotted quarter (36) in a compound one. */
export function beatTicks(timeSignature: Meter): number {
	return isCompound(timeSignature) ? 36 : TICKS_PER_WHOLE / timeSignature[1];
}

/** How many notes a beat divides into at the first level: two in a simple meter, three in a compound one. */
export function beatDivision(timeSignature: Meter): number {
	return isCompound(timeSignature) ? 3 : 2;
}

/**
 * The note value a fresh bar is filled with: quarters in a simple meter, eighths
 * in a compound one (six in 6/8), which is also how the "All" row fills them.
 */
export function defaultFillDuration(timeSignature: Meter): Duration {
	return isCompound(timeSignature) ? "eighth" : "quarter";
}

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

// A fresh bar of the meter's default fill: four quarters in 4/4, three in 3/4,
// six eighths in 6/8.
export function makeEmptyMeasure(timeSignature: Meter = [4, 4]): Measure {
	const duration = defaultFillDuration(timeSignature);
	const count = measureCapacity(timeSignature) / slotDurationUnits(duration);
	return {
		id: crypto.randomUUID(),
		slots: Array.from({ length: count }, () => makeEmptySlot(duration)),
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

// A duplicate placed right after its original is still under the same chord, so
// carrying the mark across would only write the same symbol twice.
function cloneSlotWithoutChord(slot: BeatSlot): BeatSlot {
	const { chord: _chord, ...rest } = cloneSlotWithNewId(slot);
	void _chord;
	return rest;
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

// Which connecting markers are musically valid for the note in `cell`, given the
// note it connects from (same string, previous slot). A technique/tie needs a
// sounding note on both ends; the fret relationship then dictates the direction:
// ascending (hammer-on / slide-up), descending (pull-off / slide-down), or same
// pitch (tie). Anything else is disabled so the UI can only offer what makes
// sense — e.g. prev fret 1 → current fret 5 allows only hammer-on and slide-up.
export interface TechniqueAvailability {
	"hammer-on": boolean;
	"pull-off": boolean;
	"slide-up": boolean;
	"slide-down": boolean;
	tied: boolean;
}

export function availableTechniques(
	pattern: FingerpickPattern,
	cell: Cell,
): TechniqueAvailability {
	const none: TechniqueAvailability = {
		"hammer-on": false,
		"pull-off": false,
		"slide-up": false,
		"slide-down": false,
		tied: false,
	};
	const prev = previousSlotFret(pattern, cell);
	const curr =
		pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[
			cell.stringIndex
		] ?? null;
	if (!prev || !curr) return none;
	if (prev.fret === null || curr.fret === null || prev.muted || curr.muted) {
		return none;
	}
	const ascending = curr.fret > prev.fret;
	const descending = curr.fret < prev.fret;
	return {
		"hammer-on": ascending,
		"pull-off": descending,
		"slide-up": ascending,
		"slide-down": descending,
		tied: curr.fret === prev.fret,
	};
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

// Standard counting syllables for a single beat subdivided into `subdivisions`
// equal parts, or null when there is no counting for that many. Index 0 is
// always the beat number itself. A compound beat counts its three eighths
// "1 + a" (so three parts are the beat's own division, not a triplet) and its
// sixteenths with the same "ta" in-betweens the simple 32nds use.
function subdivisionSequence(subdivisions: number, beatLabel: string, compound: boolean): string[] | null {
	if (compound) {
		switch (subdivisions) {
			case 1:
				return [beatLabel];
			case 2:
				return [beatLabel, "+"]; // a duplet: two dotted eighths
			case 3:
				return [beatLabel, "+", "a"];
			case 6:
				return [beatLabel, "ta", "+", "ta", "a", "ta"];
			default:
				return null;
		}
	}
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
		default:
			return null;
	}
}

// Compute the beat-position label for every slot in a measure. The beat is the
// meter's (`beatTicks`: a quarter, or a dotted quarter in 6/8). Slots are grouped
// by the beat their onset falls in: a slot on the beat is labelled with the
// beat number ("1", "2", …); a beat holding several onsets is subdivided to the
// finest value present and labelled with counting syllables (quarter →
// sixteenths gives "1 e + a"; a 6/8 beat of eighths "1 + a 2 + a"), and a lone
// off-beat onset gets its syllable the same way. A note spanning multiple beats
// is labelled with its starting beat number and simply leaves the beats it
// covers unlabelled.
//
// In a compound meter the "eighths" style counts the eighths 1–6 instead, the
// way a beginner is often taught 6/8; a simple meter has only the one style.
//
// The returned array is always the same length as `slots` — exactly one label per
// slot — so callers can render one label under each column.
export type BeatLabelStyle = "beats" | "eighths";

export function computeBeatLabels(
	slots: BeatSlot[],
	timeSignature: [number, number],
	style: BeatLabelStyle = "beats",
): string[] {
	const countEighths = style === "eighths" && isCompound(timeSignature);
	const beat = countEighths ? TICKS_PER_WHOLE / 8 : beatTicks(timeSignature);
	const compound = countEighths ? false : isCompound(timeSignature);

	const labels = new Array<string>(slots.length).fill("");

	// Assign each slot to the beat its onset (cumulative start tick) falls in.
	const beats = new Map<number, { slotIndex: number; startTick: number }[]>();
	let cursor = 0;
	slots.forEach((slot, i) => {
		const beatIndex = Math.floor(cursor / beat);
		const group = beats.get(beatIndex);
		if (group) group.push({ slotIndex: i, startTick: cursor });
		else beats.set(beatIndex, [{ slotIndex: i, startTick: cursor }]);
		cursor += DURATION_TICKS[slot.duration];
	});

	for (const [beatIndex, group] of beats) {
		const beatLabel = String(beatIndex + 1);
		const beatStart = beatIndex * beat;
		if (group.length === 1 && group[0].startTick === beatStart) {
			labels[group[0].slotIndex] = beatLabel;
			continue;
		}
		// Several onsets share this beat (or its one onset is off the beat):
		// subdivide to the finest value present. A mix with no counting of its
		// own (a hemiola quarter in 6/8, a dotted eighth's sixteenth) falls back
		// to the beat's plain grid — the sixteenths of a simple beat, the eighths
		// of a compound one — and labels only the onsets that land on it.
		const smallest = Math.min(
			...group.map((g) => DURATION_TICKS[slots[g.slotIndex].duration]),
		);
		const exact =
			beat % smallest === 0 ? subdivisionSequence(beat / smallest, beatLabel, compound) : null;
		const fallbackCount = compound ? 3 : 4;
		const seq = exact ?? subdivisionSequence(fallbackCount, beatLabel, compound)!;
		const unit = exact ? smallest : beat / fallbackCount;
		for (const g of group) {
			const offset = g.startTick - beatStart;
			if (offset % unit !== 0) continue;
			const idx = offset / unit;
			labels[g.slotIndex] = idx >= 0 && idx < seq.length ? seq[idx] : "";
		}
	}

	return labels;
}

// Group slot indices by the beat their onset falls in, using the same beat as
// computeBeatLabels (`beatTicks`: a quarter, or a dotted quarter in 6/8). Each
// returned inner array lists the slot indices belonging to one beat, in order.
// Beats are returned in playing order and every slot appears in exactly one
// group, so the flattened result is [0, 1, …, slots.length - 1].
// Example: 4/4 [quarter, eighth, eighth, quarter, quarter] → [[0], [1, 2], [3], [4]].
export function computeBeatGroups(
	slots: BeatSlot[],
	timeSignature: [number, number],
): number[][] {
	const beat = beatTicks(timeSignature);

	const groups: number[][] = [];
	let current: number[] | null = null;
	let currentBeat = -1;
	let cursor = 0;
	slots.forEach((slot, i) => {
		const beatIndex = Math.floor(cursor / beat);
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

// One node of a beat's binary subdivision tree (see computeSubBeatGroups). A `leaf`
// is a single note filling its window; a `split` is a window cleanly bisected at its
// midpoint into two halves; a `flat` window can't be bisected on a binary boundary
// (syncopation / triplets), so its notes never group; `empty` covers a window with no
// onset (e.g. under a note tied over from an earlier beat).
type SubBeatNode =
	| { kind: "leaf"; index: number }
	| { kind: "flat"; indices: number[] }
	| { kind: "split"; left: SubBeatNode; right: SubBeatNode }
	| { kind: "empty" };

// Group slot indices for the editor's mid-level hover wash by reconstructing, per
// beat, the binary tree the split/merge edits imply — then collapsing each subtree to
// the level that reads as one rhythmic unit. This sits between the whole-beat wash
// (L1) and the per-cell tint (L2), and is strictly finer than a beat: the beat itself
// is the top window and its two halves are never merged into one group (L1 covers
// that), so a note at the beat's own subdivision (an eighth in 4/4, a sixteenth in
// 6/8) stays a singleton.
//
// A subdivided half collapses into a single group only when it is *uniform* (all its
// leaves the same note value) AND either its sibling is a single plain note — then the
// half is "that note's worth, subdivided" (e.g. an eighth beside four 32nds groups all
// four; beside two sixteenths groups both) — OR the half is the finest binary pair
// (both its halves are leaves, e.g. two 32nds filling a sixteenth). A mixed half
// descends instead: a sixteenth followed by two 32nds ("2 e ta") keeps the sixteenth
// "2" on its own and pairs only the equal-value 32nds "[e, ta]". Likewise a beat
// evenly filled with 32nds descends to its readable pairs rather than collapsing
// wholesale. Non-binary rhythms never bisect on a midpoint onset, so triplets and
// syncopations fall out as singletons. A compound beat is never bisected: its three
// eighths are the windows, and the binary tree runs inside each of them. Every slot
// appears in exactly one group; the flattened result is [0, 1, …, slots.length - 1].
export function computeSubBeatGroups(
	slots: BeatSlot[],
	timeSignature: [number, number],
): number[][] {
	// The largest window that may still be bisected: the beat, or in a compound
	// meter each of its three eighths.
	const windowTicks = isCompound(timeSignature) ? beatTicks(timeSignature) / 3 : beatTicks(timeSignature);

	// Onset (cumulative start tick) of every slot.
	const onsets: { index: number; onset: number }[] = [];
	let cursor = 0;
	slots.forEach((slot, i) => {
		onsets.push({ index: i, onset: cursor });
		cursor += DURATION_TICKS[slot.duration];
	});
	const totalTicks = cursor;

	const groups: number[][] = [];

	// Build the subdivision tree for a tick window, following the actual note onsets.
	function build(start: number, end: number): SubBeatNode {
		const inRange = onsets.filter((o) => o.onset >= start && o.onset < end);
		if (inRange.length === 0) return { kind: "empty" };
		if (inRange.length === 1) return { kind: "leaf", index: inRange[0].index };
		const mid = (start + end) / 2;
		// No onset exactly at the midpoint ⇒ the window can't be cleanly halved on a
		// binary boundary (a note straddles it, or it's a triplet): keep its notes flat.
		if (!inRange.some((o) => o.onset === mid))
			return { kind: "flat", indices: inRange.map((o) => o.index) };
		return { kind: "split", left: build(start, mid), right: build(mid, end) };
	}

	function leavesOf(node: SubBeatNode): number[] {
		if (node.kind === "leaf") return [node.index];
		if (node.kind === "flat") return node.indices;
		if (node.kind === "split") return [...leavesOf(node.left), ...leavesOf(node.right)];
		return [];
	}

	// Emit groups for one child of a split, given its sibling.
	function handleChild(child: SubBeatNode, sibling: SubBeatNode): void {
		if (child.kind === "leaf") {
			groups.push([child.index]);
		} else if (child.kind === "flat") {
			child.indices.forEach((i) => groups.push([i]));
		} else if (child.kind === "split") {
			const childLeaves = leavesOf(child);
			// Only a *uniform* subtree (all leaves the same note value) collapses into a
			// single group. A mixed half — e.g. a sixteenth followed by two 32nds ("2 e
			// ta") — descends instead, so the sixteenth "2" stays on its own and only the
			// equal-value 32nds "[e, ta]" pair up, rather than the whole half fusing.
			const uniform = childLeaves.every((i) => slots[i].duration === slots[childLeaves[0]].duration);
			const siblingIsLeaf = sibling.kind === "leaf";
			const bothHalvesLeaves = child.left.kind === "leaf" && child.right.kind === "leaf";
			if (uniform && (siblingIsLeaf || bothHalvesLeaves)) groups.push(childLeaves);
			else walk(child);
		}
	}

	// Emit the groups under a window node, halves in playing order.
	function walk(node: SubBeatNode): void {
		if (node.kind === "split") {
			handleChild(node.left, node.right);
			handleChild(node.right, node.left);
		} else if (node.kind === "leaf") {
			groups.push([node.index]);
		} else if (node.kind === "flat") {
			node.indices.forEach((i) => groups.push([i]));
		}
	}

	// One window at a time, so nothing groups across a beat (or compound-eighth) boundary.
	for (let start = 0; start < totalTicks; start += windowTicks) {
		walk(build(start, start + windowTicks));
	}

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

// Insert a fresh quarter-note slot before/after each targeted slot. Nothing is
// inserted inside a triplet group: a target in one puts the new slot before the
// group's first or after its last member, once per group however many of its
// members were targeted.
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
			const anchors = new Set<number>();
			for (const si of selected) {
				const group = tripletGroupAt(measure.slots, si);
				if (!group) anchors.add(si);
				else anchors.add(position === "before" ? group.start : group.start + TRIPLET_GROUP_SIZE - 1);
			}
			const newSlots: BeatSlot[] = [];
			measure.slots.forEach((slot, si) => {
				if (anchors.has(si) && position === "before") newSlots.push(makeEmptySlot());
				newSlots.push(slot);
				if (anchors.has(si) && position === "after") newSlots.push(makeEmptySlot());
			});
			return { ...measure, slots: newSlots };
		}),
	};
}

// Duplicate each targeted slot, placing the copy immediately after the original.
// A triplet group duplicates as a unit — the copy of the group follows the
// group, so the copies never interleave with the originals.
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
			const groups = tripletGroups(measure.slots);
			const newSlots: BeatSlot[] = [];
			let si = 0;
			while (si < measure.slots.length) {
				const group = groups.find((g) => g.start === si);
				if (group) {
					const members = measure.slots.slice(si, si + TRIPLET_GROUP_SIZE);
					newSlots.push(...members);
					if (members.some((_, k) => selected.has(si + k))) {
						newSlots.push(...members.map(cloneSlotWithoutChord));
					}
					si += TRIPLET_GROUP_SIZE;
					continue;
				}
				newSlots.push(measure.slots[si]);
				if (selected.has(si)) newSlots.push(cloneSlotWithoutChord(measure.slots[si]));
				si++;
			}
			return { ...measure, slots: newSlots };
		}),
	};
}

// Delete every targeted slot; a target in a triplet group deletes the whole
// group. A measure never drops below one slot — if a delete would empty it, a
// single fresh quarter slot is left behind.
export function deleteSlots(
	pattern: FingerpickPattern,
	targets: SlotTarget[],
): FingerpickPattern {
	const grouped = groupTargetsByMeasure(targets);
	return {
		...pattern,
		measures: pattern.measures.map((measure, mi) => {
			const picked = grouped.get(mi);
			if (!picked) return measure;
			const selected = expandTripletGroups(measure.slots, picked);
			// A deleted slot's chord mark moves to the next slot that survives, so the
			// region it opened is not lost with the note. Of several deleted in a row,
			// the last mark is the one in effect where the survivor begins, so it is
			// the one carried. A surviving slot with a mark of its own keeps it — that
			// mark was about to take over anyway. With nothing left after it, the mark
			// is dropped: the previous chord runs on, and later measures are untouched.
			const remaining: BeatSlot[] = [];
			let carried: BeatSlot["chord"] | undefined;
			measure.slots.forEach((slot, si) => {
				if (selected.has(si)) {
					carried = slot.chord ?? carried;
					return;
				}
				if (carried !== undefined && slot.chord === undefined) {
					remaining.push({ ...slot, chord: carried });
				} else {
					remaining.push(slot);
				}
				carried = undefined;
			});
			if (remaining.length > 0) return { ...measure, slots: remaining };
			const fresh = makeEmptySlot();
			return { ...measure, slots: [carried !== undefined ? { ...fresh, chord: carried } : fresh] };
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
	return { ...pattern, measures: [...pattern.measures, makeEmptyMeasure(pattern.timeSignature)] };
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
// Deep-clone the measure at `measureIndex` and append the copy at the end of the
// array (the last position), with fresh measure and slot ids. `newId` lets the
// caller pre-generate the clone's id so it can highlight the newly added box;
// omitting it falls back to a generated id.
export function cloneMeasure(
	measures: Measure[],
	measureIndex: number,
	newId?: string,
): Measure[] {
	const measure = measures[measureIndex];
	if (!measure) return measures;
	const cloned: Measure = {
		id: newId ?? crypto.randomUUID(),
		slots: measure.slots.map(cloneSlotWithNewId),
	};
	return [...measures, cloned];
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
// Every helper here measures rhythm in `DURATION_TICKS` (96 per whole note), so a
// triplet weighs an exact 8 or 4 and a bar of twelve eighth-triplets is exactly
// full. Nothing sums fractions.

// Total capacity of a measure in ticks: numerator × (96 / denominator). 4/4 → 96,
// 3/4 → 72, 6/8 → 72.
export function measureCapacity(timeSignature: Meter): number {
	const [numerator, denominator] = timeSignature;
	return numerator * (TICKS_PER_WHOLE / denominator);
}

export function slotDurationUnits(duration: Duration): number {
	return DURATION_TICKS[duration];
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
// in the measure's remaining capacity. A triplet target is a split into exactly
// three — a quarter into eighth-triplets, an eighth into sixteenth-triplets — and
// nothing else. Returns the measures unchanged when the target is not smaller
// than the current slot or capacity would be exceeded.
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
	if (isTripletDuration(targetDuration) && tripletForPlainValue(slot.duration) !== targetDuration) {
		return measures;
	}
	// A triplet slot is not split further: its group is the unit.
	if (isTripletDuration(slot.duration)) return measures;

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
				// The chord changes where the note began, so the head keeps the mark.
				...(slot.chord !== undefined ? { chord: slot.chord } : {}),
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
// and returned as `pendingMeasures`). A triplet group merges back to its plain
// value from its first member and in no other way. Returns an unchanged `ok`
// result when the merge is not valid (not enough following slots, or durations
// don't line up).
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
	// A triplet is never a merge target: 8 + 4 ticks is not an "eighth".
	if (isTripletDuration(targetDuration)) return { type: "ok", measures };

	const first = measure.slots[slotIndex];
	if (!first) return { type: "ok", measures };
	let end: number;
	if (isTripletDuration(first.duration)) {
		// Only a whole group, from its first member, back to its plain value.
		const group = tripletGroupAt(measure.slots, slotIndex);
		if (!group || group.start !== slotIndex || tripletPlainValue(first.duration) !== targetDuration) {
			return { type: "ok", measures };
		}
		end = slotIndex + TRIPLET_GROUP_SIZE;
	} else {
		// Walk the following plain slots until they sum to the target. A run that
		// reaches a triplet slot never merges.
		const targetUnits = slotDurationUnits(targetDuration);
		let sum = 0;
		end = slotIndex;
		while (end < measure.slots.length && sum < targetUnits) {
			if (isTripletDuration(measure.slots[end].duration)) return { type: "ok", measures };
			sum += slotDurationUnits(measure.slots[end].duration);
			end++;
		}
		const consumed = end - slotIndex;
		// Need an exact fit spanning at least the current slot plus one following slot.
		if (sum !== targetUnits || consumed < 2) return { type: "ok", measures };
	}

	// The first slot's string data is kept, so its roll stroke and rest flag are kept
	// too. When both the first and a later merged slot carry a stroke, the first wins
	// (the later slots' data — stroke included — is discarded along with everything else).
	// A chord mark is a point in time rather than note data, so it is not
	// discarded with the later slots: the earliest mark in the run starts the
	// merged note. Later marks in the run have nowhere to go — the next mark
	// after the merge takes over from there anyway.
	const mergedChord = measure.slots.slice(slotIndex, end).find((s) => s.chord)?.chord;
	const merged: BeatSlot = {
		id: crypto.randomUUID(),
		duration: targetDuration,
		strings: cloneStrings(first.strings),
		...(first.stroke !== undefined ? { stroke: first.stroke } : {}),
		...(first.isRest ? { isRest: true } : {}),
		...(mergedChord !== undefined ? { chord: mergedChord } : {}),
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

// Ladder note value keyed by its tick weight, used to resolve a prefix-sum back
// to a duration when enumerating merge targets.
const DURATION_BY_UNITS: Map<number, Duration> = new Map(
	NOTE_LADDER.map((d) => [slotDurationUnits(d), d] as const),
);

// Smaller note values the slot at `slotIndex` can be split into: each must divide
// the slot evenly (integer sub-slot count) and the sub-slots must fit the measure's
// remaining capacity, plus the slot's triplet (three of it) when it has one and
// the meter is simple — a compound beat already divides in three, so a triplet
// there names nothing. Ordered by sub-slot count, fewest first. A triplet slot
// offers nothing: its group is the unit.
export function splitTargetsForSlot(
	measure: Measure,
	slotIndex: number,
	timeSignature: [number, number],
): DurationTarget[] {
	const slot = measure.slots[slotIndex];
	if (!slot || isTripletDuration(slot.duration)) return [];
	const currentUnits = slotDurationUnits(slot.duration);
	const remaining = remainingUnits(measure.slots, timeSignature);
	const targets = NOTE_LADDER.flatMap((d) => {
		const targetUnits = slotDurationUnits(d);
		if (targetUnits >= currentUnits || currentUnits % targetUnits !== 0) return [];
		const count = currentUnits / targetUnits;
		const extra = count * targetUnits - currentUnits; // 0 for even splits
		if (extra > remaining) return [];
		return [{ duration: d, count }];
	});
	const triplet = tripletForPlainValue(slot.duration);
	if (triplet && !isCompound(timeSignature)) {
		targets.push({ duration: triplet, count: TRIPLET_GROUP_SIZE });
	}
	return targets.sort((a, b) => a.count - b.count);
}

// Larger note values the slot at `slotIndex` can be merged up to: walk the prefix
// sums of [current, ...following] and, for every run of ≥ 2 slots whose durations
// sum exactly to a ladder value, offer that value. The walk stops at a triplet
// slot — a run mixing triplets and plain values is never a note. The first
// member of a triplet group offers its plain value instead; the other members
// offer nothing. A merge keeps the measure total (the sum equals the target), so
// capacity is never at issue. Ordered smallest → largest target by the run
// length that produces it.
export function mergeTargetsForSlot(measure: Measure, slotIndex: number): DurationTarget[] {
	const slots = measure.slots;
	const slot = slots[slotIndex];
	if (!slot) return [];
	if (isTripletDuration(slot.duration)) {
		const group = tripletGroupAt(slots, slotIndex);
		return group && group.start === slotIndex
			? [{ duration: tripletPlainValue(slot.duration), count: TRIPLET_GROUP_SIZE }]
			: [];
	}
	const results: DurationTarget[] = [];
	let sum = 0;
	for (let end = slotIndex; end < slots.length; end++) {
		if (isTripletDuration(slots[end].duration)) break;
		sum += slotDurationUnits(slots[end].duration);
		const count = end - slotIndex + 1;
		if (count < 2) continue;
		if (sum > TICKS_PER_WHOLE) break; // past a whole note — no larger target exists
		const duration = DURATION_BY_UNITS.get(sum);
		if (duration) results.push({ duration, count });
	}
	return results;
}

// ── Time signature change ─────────────────────────────────────────────────────

// Plain values a bar is padded out with, largest first, by meter — a compound
// bar pads with its dotted beat and eighths, never a plain quarter.
const SIMPLE_PAD_LADDER: readonly Duration[] = ["quarter", "eighth", "sixteenth", "32nd"];
const COMPOUND_PAD_LADDER: readonly Duration[] = ["dotted-quarter", "eighth", "sixteenth", "32nd"];

// Empty slots that exactly fill `ticks`, largest values first.
function padSlots(ticks: number, timeSignature: Meter): BeatSlot[] {
	const ladder = isCompound(timeSignature) ? COMPOUND_PAD_LADDER : SIMPLE_PAD_LADDER;
	const out: BeatSlot[] = [];
	let left = ticks;
	for (const duration of ladder) {
		const unit = slotDurationUnits(duration);
		while (left >= unit) {
			out.push(makeEmptySlot(duration));
			left -= unit;
		}
	}
	return out;
}

// Cut one measure to the new capacity: slots whose onset reaches or straddles
// the bar's end are dropped, and the bar is padded out to full. A dropped slot
// with string data is what the caller confirms. Chord marks travel by onset.
function fitMeasure(
	measure: Measure,
	timeSignature: Meter,
): { measure: Measure; losesData: boolean } {
	const capacity = measureCapacity(timeSignature);
	const kept: BeatSlot[] = [];
	let losesData = false;
	let cursor = 0;
	for (const slot of measure.slots) {
		const end = cursor + slotDurationUnits(slot.duration);
		if (end <= capacity) kept.push(slot);
		else if (slotHasStringData(slot)) losesData = true;
		cursor = end;
	}
	const filled = usedUnits(kept);
	const slots = filled < capacity ? [...kept, ...padSlots(capacity - filled, timeSignature)] : kept;
	return {
		measure: { ...measure, slots: carryChordMarks(measure.slots, slots) },
		losesData,
	};
}

// Cut every measure into `parts` equal bars of the new length. Only possible
// when no slot straddles a cut; null otherwise. The first piece keeps the
// repeat-start barline, the last the repeat-end and its play count; a chord in
// effect carries into the later pieces by the lead-sheet rule on its own.
function splitMeasures(measures: readonly Measure[], timeSignature: Meter, parts: number): Measure[] | null {
	const capacity = measureCapacity(timeSignature);
	const out: Measure[] = [];
	for (const measure of measures) {
		const pieces: BeatSlot[][] = Array.from({ length: parts }, () => []);
		let cursor = 0;
		for (const slot of measure.slots) {
			const end = cursor + slotDurationUnits(slot.duration);
			const piece = Math.floor(cursor / capacity);
			if (piece >= parts || end > (piece + 1) * capacity) return null;
			pieces[piece].push(slot);
			cursor = end;
		}
		pieces.forEach((slots, i) => {
			const filled = usedUnits(slots);
			const full = filled < capacity ? [...slots, ...padSlots(capacity - filled, timeSignature)] : slots;
			const { repeatStart, repeatEnd, repeatTimes, ...rest } = measure;
			const piece: Measure = { ...rest, id: i === 0 ? measure.id : crypto.randomUUID(), slots: full };
			if (i === 0 && repeatStart) piece.repeatStart = repeatStart;
			if (i === parts - 1) {
				if (repeatEnd) piece.repeatEnd = repeatEnd;
				if (repeatTimes !== undefined) piece.repeatTimes = repeatTimes;
			}
			out.push(piece);
		});
	}
	return out;
}

export interface TimeSignatureChange {
	/** The pattern in the new meter: overlong bars cut and every bar padded to full. */
	fitted: FingerpickPattern;
	/** `fitted`, with every bar that lost string data reset to the meter's default fill instead. */
	cleared: FingerpickPattern;
	/**
	 * Each bar cut into equal bars of the new length — what a player means by
	 * "4/4 → 2/4" — when the old bar is a whole number of new ones and no note
	 * crosses a cut; null otherwise.
	 */
	split: FingerpickPattern | null;
	/** Indices of the bars that lose string data under `fitted`. Empty means `fitted` needs no confirmation. */
	affectedMeasures: number[];
}

// Rewrite a pattern for a new time signature. Per bar, slots whose onset
// reaches or straddles the new capacity are dropped and the bar is padded with
// empty plain values; chord marks are carried by onset. Bars with room (2/4 →
// 3/4) simply grow. 3/4 ↔ 6/8 share a capacity and keep their slots as they
// are — a quarter then crosses the 3+3 grouping (a hemiola), which is left to
// the player rather than re-notated with ties. BPM counts the beat, so between
// a simple and a compound meter the tempo is rescaled (`rescaleBpmForMeter`)
// to hold the eighth note still; the caller clamps it to its range.
export function changeTimeSignature(
	pattern: FingerpickPattern,
	timeSignature: [number, number],
): TimeSignatureChange {
	const affectedMeasures: number[] = [];
	const fittedMeasures = pattern.measures.map((measure, i) => {
		const { measure: fitted, losesData } = fitMeasure(measure, timeSignature);
		if (losesData) affectedMeasures.push(i);
		return fitted;
	});
	const bpm = Math.round(rescaleBpmForMeter(pattern.bpm, pattern.timeSignature, timeSignature));
	const fitted: FingerpickPattern = { ...pattern, timeSignature, bpm, measures: fittedMeasures };
	const cleared: FingerpickPattern = {
		...fitted,
		measures: fittedMeasures.map((m, i) =>
			affectedMeasures.includes(i) ? { ...m, slots: makeEmptyMeasure(timeSignature).slots } : m,
		),
	};
	const oldCapacity = measureCapacity(pattern.timeSignature);
	const newCapacity = measureCapacity(timeSignature);
	const parts = oldCapacity / newCapacity;
	const splitMeasuresOrNull =
		Number.isInteger(parts) && parts >= 2 ? splitMeasures(pattern.measures, timeSignature, parts) : null;
	const split = splitMeasuresOrNull
		? { ...pattern, timeSignature, bpm, measures: splitMeasuresOrNull }
		: null;
	return { fitted, cleared, split, affectedMeasures };
}

// ── Legacy-pattern normalization ──────────────────────────────────────────────

// Older saved patterns encoded a rest as `duration: "rest"` (a fixed quarter-weight
// member of the Duration union). The model now represents a rest as a per-slot
// `isRest` flag that keeps the slot's real duration. Convert any legacy rest slot on
// load — quarter duration + isRest, string data cleared — matching the old fixed
// quarter weight so the measure total is unchanged. Runs on every load path
// (Supabase rows, localStorage, tab import); a no-op for already-migrated patterns.
export function normalizeLoadedPattern(pattern: FingerpickPattern): FingerpickPattern {
	// A capo is kept only when it is a real fret: out-of-range or junk values are
	// folded to "no capo" so a stored pattern never carries a capo the UI can't show.
	const capo = normalizeCapo(pattern.capo);
	if (capo !== (pattern.capo ?? 0)) {
		const { capo: _capo, ...rest } = pattern;
		void _capo;
		pattern = capo === 0 ? rest : { ...rest, capo };
	}
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

// Re-home the chord marks of `oldSlots` onto `newSlots` (a uniform rebuild of the
// same measure) by onset: each mark lands on the new slot whose span contains the
// time it was written at. A mark is a point in the measure, not note data, so it
// survives a rhythm change that clears every note; when two marks fall into the
// same new slot the earlier one wins, as the later has no slot of its own left.
export function carryChordMarks(
	oldSlots: readonly BeatSlot[],
	newSlots: readonly BeatSlot[],
): BeatSlot[] {
	const result = newSlots.map((slot) => ({ ...slot }));
	if (result.length === 0) return result;
	const onsets: number[] = [];
	let cursor = 0;
	for (const slot of result) {
		onsets.push(cursor);
		cursor += slotDurationUnits(slot.duration);
	}
	let oldCursor = 0;
	for (const old of oldSlots) {
		if (old.chord !== undefined) {
			let index = 0;
			while (index + 1 < onsets.length && onsets[index + 1] <= oldCursor) index++;
			if (result[index].chord === undefined) result[index] = { ...result[index], chord: old.chord };
		}
		oldCursor += slotDurationUnits(old.duration);
	}
	return result;
}

// How many slots of `duration` fill a bar of `timeSignature` (see resetMeasure).
function slotCountForFill(duration: Duration, timeSignature: [number, number]): number {
	return Math.max(1, Math.floor(measureCapacity(timeSignature) / slotDurationUnits(duration)));
}

export type ResetResult =
	| { type: "ok"; measures: Measure[] }
	| { type: "confirm"; measures: Measure[] };

// Replace every slot in a measure with (capacity / targetDuration) fresh empty
// slots. Every offered target divides the bar exactly; one that does not fills
// as many whole slots as fit (never more than one when even one is too long).
// When the measure already holds string data, the reset is returned as a
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

	const count = slotCountForFill(targetDuration, timeSignature);
	const newSlots = carryChordMarks(
		measure.slots,
		Array.from({ length: count }, () => makeEmptySlot(targetDuration)),
	);
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
	const count = slotCountForFill(targetDuration, timeSignature);
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

	return measures.map((m, mi) =>
		mi === measureIndex ? { ...m, slots: carryChordMarks(measure.slots, newSlots) } : m,
	);
}
