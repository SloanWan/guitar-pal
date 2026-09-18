import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import type { BeatSlot, Duration, FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	DURATION_TICKS,
	makeDefaultPattern,
	makeEmptySlot,
	measureCapacity,
} from "@/lib/fingerpickEdit";
import { chordFretHints, chordSymbolLabel } from "@/lib/fingerpickChords";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { tokenStrings, type PickToken } from "@/lib/fingerpickPickSequence";
import type { NoteToken } from "@/lib/tabAssistant/parseStringFret";
import type { ChordRef } from "@/lib/strumPatterns";
import { clampBpmToMeter } from "@/lib/strumBars";
import { normalizeCapo } from "@/lib/strumProgressions";
import type { ValidationIssue } from "@/lib/tabImport";
import { TAB_STYLES, planFromMeasure, stylePreset, type TabStyleEntry } from "@/lib/tabAssistant/styles";
import { splitTicks } from "@/lib/tabAssistant/ticks";
import type { ChordWord, PlanSlot, TabProposal } from "@/lib/tabAssistant/types";

/**
 * Turns what was read — chord words and a right-hand plan — into a pattern
 * the editor can open.
 *
 * Frets come from the chord tables, never from the sentence: the player names
 * a chord and an order, and the frets are the voicing's. That is the
 * fingerpick counterpart of strum's "the model returns notation and chord
 * words, the client expands them", and it holds for every path in here — a
 * written order, a style word, or the default when only chords were named.
 */

/** The order used when only chords were named: one bar of the arpeggio preset. */
const DEFAULT_STYLE_KEY = "arpeggio";

/** The note value an order is written in when none was named. */
const DEFAULT_ORDER_DURATION: Duration = "eighth";

export interface BuildTabProposalInput {
	chordWords: readonly ChordWord[];
	/** Notes written as string-and-fret pairs, one group per bar; frets as written, at `duration`. */
	notes?: readonly (readonly NoteToken[])[] | null;
	/** A written order; the plan is these at `duration`. */
	order?: readonly PickToken[] | null;
	duration?: Duration | null;
	/** A style word; the plan is its preset's first bar. */
	style?: TabStyleEntry | null;
	timeSignature?: [number, number] | null;
	bpm?: number | null;
	name?: string | null;
	capo?: number | null;
	/** The shape a chord is held in, or null when the library has none. */
	voicingFor: (ref: ChordRef) => ChordVoicing | null;
	presets?: readonly FingerpickPattern[];
}

export type BuildTabProposalResult =
	| { ok: true; proposal: TabProposal }
	| { ok: false; error: string };

function planTicks(plan: readonly PlanSlot[]): number {
	return plan.reduce((sum, slot) => sum + DURATION_TICKS[slot.duration], 0);
}

/**
 * The plan laid into bars of the meter. An order shorter than a bar that
 * divides it evenly is repeated to fill it — `5 3 2 1` is the arpeggio, not
 * half a bar of it — and anything else is padded with rests where it ends.
 */
function barsFromPlan(
	plan: readonly PlanSlot[],
	capacity: number,
	repeatToFill: boolean,
): { bars: PlanSlot[][]; padded: boolean } {
	const total = planTicks(plan);
	const times = repeatToFill && total > 0 && total < capacity && capacity % total === 0 ? capacity / total : 1;
	const slots = Array.from({ length: times }, () => plan).flat();

	const bars: PlanSlot[][] = [];
	let bar: PlanSlot[] = [];
	let used = 0;
	let padded = false;
	const close = () => {
		if (used < capacity) {
			padded = true;
			for (const duration of splitTicks(capacity - used)) bar.push({ strings: null, duration });
		}
		bars.push(bar);
		bar = [];
		used = 0;
	};
	for (const slot of slots) {
		const ticks = DURATION_TICKS[slot.duration];
		if (used + ticks > capacity) close();
		bar.push(slot);
		used += ticks;
		if (used === capacity) close();
	}
	if (bar.length > 0) close();
	return { bars, padded };
}

/** One bar written from the plan over one chord. */
function writeBar(
	bar: readonly PlanSlot[],
	word: ChordWord | null,
	voicingFor: BuildTabProposalInput["voicingFor"],
	leftOut: (label: string, stringNumber: number) => void,
): Measure {
	const ref = word?.chord ?? null;
	const voicing = ref ? voicingFor(ref) : null;
	const hints = voicing ? chordFretHints(voicing) : null;
	const slots: BeatSlot[] = bar.map((planSlot) => {
		const slot = makeEmptySlot(planSlot.duration);
		// A chord word the library has nothing for keeps its bar's place and
		// sounds nothing, the way an unknown chord holds its bar in strum.
		if (planSlot.strings === null || (word !== null && ref === null && !planSlot.frets)) {
			return { ...slot, isRest: true };
		}
		// A root token is the chord's root string in this bar: C sits on
		// string 5 and G on 6, so one order follows the change.
		const strings = planSlot.root
			? tokenStrings({ strings: planSlot.strings, root: true }, ref, voicing)
			: planSlot.strings;
		strings.forEach((stringIndex, i) => {
			// A fret written in the sentence is the fret; the chord only marks the bar.
			const written = planSlot.frets?.[i];
			if (written !== undefined) {
				slot.strings[stringIndex] =
					written === "x"
						? { fret: null, technique: null, tied: false, muted: true }
						: { fret: written, technique: null, tied: false, muted: false };
				return;
			}
			const hint = hints ? hints[stringIndex] : 0;
			if (hint === "/") {
				slot.strings[stringIndex] = { fret: null, technique: null, tied: false, muted: true };
				leftOut(chordSymbolLabel(ref as ChordRef), stringIndex + 1);
			} else {
				slot.strings[stringIndex] = { fret: hint, technique: null, tied: false, muted: false };
			}
		});
		return slot;
	});
	return { id: crypto.randomUUID(), slots };
}

export function buildTabProposal(input: BuildTabProposalInput): BuildTabProposalResult {
	const presets = input.presets ?? PRESET_FINGERPICK_PATTERNS;
	const warnings: ValidationIssue[] = [];

	// The plan: a written order, a style's bar, or the default when only
	// chords were named — and, in that last case, said to be a guess.
	let plan: PlanSlot[] = [];
	let repeatToFill = false;
	let preset: FingerpickPattern | null = null;
	let styleLabel: string | null = null;
	const groups = (input.notes ?? []).filter((g) => g.length > 0);
	const written = groups.length > 0;
	if (written) {
		// Each pair the player wrote is its own bar: laid out group by group
		// below, never repeated to fill.
	} else if (input.order && input.order.length > 0) {
		const duration = input.duration ?? DEFAULT_ORDER_DURATION;
		plan = input.order.map((token) =>
			"rest" in token
				? { strings: null, duration }
				: { strings: token.strings, ...(token.root ? { root: true as const } : {}), duration },
		);
		repeatToFill = true;
	} else {
		const style =
			input.style ?? TAB_STYLES.find((s) => s.key === DEFAULT_STYLE_KEY) ?? null;
		preset = style ? stylePreset(style, presets) : null;
		if (!style || !preset) {
			return { ok: false, error: "No order was written and no style's pattern is available." };
		}
		styleLabel = style.label;
		plan = planFromMeasure(preset.measures[0]);
		if (!input.style) {
			warnings.push({
				code: "ORDER_GUESSED",
				path: "measures",
				message: "No picking order was named — an arpeggio was used. Change it if it isn't yours.",
			});
		}
	}

	const timeSignature: [number, number] = input.timeSignature ?? preset?.timeSignature ?? [4, 4];
	const capacity = measureCapacity(timeSignature);
	let bars: PlanSlot[][];
	let padded: boolean;
	if (written) {
		const duration = input.duration ?? DEFAULT_ORDER_DURATION;
		const laid = groups.map((group) =>
			barsFromPlan(
				group.map((note) => ({ strings: [note.stringIndex], frets: [note.fret], duration })),
				capacity,
				false,
			),
		);
		bars = laid.flatMap((l) => l.bars);
		padded = laid.some((l) => l.padded);
	} else {
		({ bars, padded } = barsFromPlan(plan, capacity, repeatToFill));
	}
	if (padded) {
		warnings.push({
			code: "PADDED",
			path: "measures",
			message: written
				? `A bar did not fill ${timeSignature[0]}/${timeSignature[1]} and was padded with rests.`
				: `The order did not fill a ${timeSignature[0]}/${timeSignature[1]} bar and was padded with rests.`,
		});
	}

	// One pass of the plan per chord word, in the order they were written;
	// with no chord at all, one pass on open strings.
	const words: (ChordWord | null)[] = input.chordWords.length > 0 ? [...input.chordWords] : [null];
	const leftOut = new Map<string, Set<number>>();
	const noShape = new Set<string>();
	const measures: Measure[] = [];
	for (const word of words) {
		const ref = word?.chord ?? null;
		if (word && !ref) {
			warnings.push({
				code: "UNRESOLVED_CHORD",
				path: `measures[${measures.length}]`,
				message: written
					? `No chord matched "${word.text}" — the frets are as you wrote them, but the bar carries no chord mark.`
					: `No chord matched "${word.text}" — its bar is written as rests.`,
				original: word.text,
			});
		}
		if (ref && !written && input.voicingFor(ref) === null) noShape.add(chordSymbolLabel(ref));
		bars.forEach((bar, i) => {
			const measure = writeBar(bar, word, input.voicingFor, (label, stringNumber) => {
				if (!leftOut.has(label)) leftOut.set(label, new Set());
				leftOut.get(label)!.add(stringNumber);
			});
			// The chord is marked once where it starts and stays in effect, as a
			// lead sheet does; a chordless pass marks nothing.
			if (i === 0 && ref && measure.slots.length > 0) measure.slots[0].chord = ref;
			measures.push(measure);
		});
	}

	for (const [label, strings] of leftOut) {
		const list = [...strings].sort((a, b) => a - b).join(", ");
		warnings.push({
			code: "STRING_NOT_IN_SHAPE",
			path: "measures",
			message: `String${strings.size === 1 ? "" : "s"} ${list} ${strings.size === 1 ? "is" : "are"} not in the ${label} shape — written as dead notes.`,
		});
	}
	for (const label of noShape) {
		warnings.push({
			code: "NO_SHAPE",
			path: "measures",
			message: `No shape for ${label} in the library — its beats are written open.`,
		});
	}
	if (input.chordWords.length === 0 && !written) {
		warnings.push({
			code: "NO_CHORD",
			path: "measures",
			message: "No chord named — open strings written. Add a chord to fret them.",
		});
	}

	const chords = input.chordWords.map((w) => w.chord).filter((c): c is ChordRef => c !== null);
	const chordsText = input.chordWords.map((w) => w.text).join(" ");
	const name =
		input.name?.trim() ||
		(styleLabel
			? chordsText
				? `${styleLabel} in ${chordsText}`
				: styleLabel
			: chordsText
				? `${chordsText} picking`
				: written
					? "Written tab"
					: "Picked pattern");

	const bpm = input.bpm ?? preset?.bpm ?? makeDefaultPattern().bpm;
	const capo = input.capo == null ? 0 : normalizeCapo(input.capo);
	const pattern: FingerpickPattern = {
		id: crypto.randomUUID(),
		name,
		description: "",
		measures,
		bpm: clampBpmToMeter(bpm, timeSignature),
		timeSignature,
		...(capo > 0 ? { capo } : {}),
	};

	return {
		ok: true,
		proposal: { name, pattern, bpm: input.bpm ?? null, chords, warnings },
	};
}
