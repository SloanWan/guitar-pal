import type { Technique } from "@/lib/fingerpickTypes";
import { MAX_FRET, measureCapacity } from "@/lib/fingerpickEdit";
import { plainDurationForTicks } from "@/lib/fingerpickPickSequence";
import type { ImportedTabDraft } from "@/lib/tabImport";
import { barSlots, type GridNote } from "@/lib/assistant/tab/draftSlots";

/**
 * A pattern the model composed, read into an import draft.
 *
 * Notes carry the slot they fall on, so nothing has to be inferred: the model
 * says how many slots a bar has and puts each note on one of them. ASCII tab
 * cannot do that — a column there is both a unit of time and a character, so a
 * two-digit fret costs two units, a bar of ten notes comes out a width that
 * divides no meter, and the rhythm ends up guessed from the spacing (#268).
 * `parseAsciiTab` still reads a tab a *player* pasted, where spacing is all
 * there is; a draft written here is exact.
 */

/** 1 = high e … 6 = low E, the way a player counts strings. */
export interface ProposedNote {
	string: number;
	fret: number;
	/** Which slot of its bar the note falls on, counting from 0. */
	slot: number;
	technique?: string;
	/** A dead note: struck but not sounded. The fret is ignored. */
	muted?: boolean;
}

export interface ProposedBar {
	notes: ProposedNote[];
}

export interface BuildTabDraftInput {
	slotsPerBar: number;
	bars: readonly ProposedBar[];
	timeSignature: [number, number];
}

export type BuildTabDraftResult =
	| { ok: true; draft: ImportedTabDraft }
	| { ok: false; error: string };

/** The techniques a slot grid can carry, named the way the model is told to name them. */
const TECHNIQUES: Record<string, NonNullable<Technique>> = {
	"hammer-on": "hammer-on",
	"pull-off": "pull-off",
	"slide-up": "slide-up",
	"slide-down": "slide-down",
};

/**
 * The slot counts that divide a bar of this meter into one plain note value
 * each — 8 eighths or 16 sixteenths in 4/4, 6 eighths in 3/4 and 6/8. A count
 * outside this set has no single note value to write its slots as, so it is
 * refused rather than rounded.
 */
export function legalSlotsPerBar(timeSignature: [number, number]): number[] {
	const capacity = measureCapacity(timeSignature);
	const counts: number[] = [];
	for (let n = 1; n <= capacity; n++) {
		if (capacity % n !== 0) continue;
		if (plainDurationForTicks(capacity / n) !== null) counts.push(n);
	}
	return counts;
}

function list(values: readonly number[]): string {
	if (values.length <= 1) return String(values[0] ?? 0);
	return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

export function buildTabDraft(input: BuildTabDraftInput): BuildTabDraftResult {
	const { slotsPerBar, bars, timeSignature } = input;
	const meter = timeSignature.join("/");

	if (bars.length === 0) return { ok: false, error: "The pattern has no bars in it." };

	const legal = legalSlotsPerBar(timeSignature);
	if (!legal.includes(slotsPerBar)) {
		return {
			ok: false,
			error: `slotsPerBar ${slotsPerBar} does not divide a bar of ${meter} into note values. Use ${list(legal.filter((n) => n >= 2))}.`,
		};
	}

	const capacity = measureCapacity(timeSignature);
	const slotTicks = capacity / slotsPerBar;
	const measures: { slots: ReturnType<typeof barSlots>["slots"] }[] = [];

	for (const [index, bar] of bars.entries()) {
		const where = `Bar ${index + 1}`;
		const byPosition = new Map<number, GridNote[]>();
		const taken = new Set<string>();

		for (const note of bar.notes) {
			if (!Number.isInteger(note.slot) || note.slot < 0 || note.slot >= slotsPerBar) {
				return { ok: false, error: `${where} has a note on slot ${note.slot}; with ${slotsPerBar} slots a bar the last one is ${slotsPerBar - 1}.` };
			}
			if (!Number.isInteger(note.string) || note.string < 1 || note.string > 6) {
				return { ok: false, error: `${where} has a note on string ${note.string}; strings are 1 (high e) to 6 (low E).` };
			}
			if (!note.muted && (!Number.isInteger(note.fret) || note.fret < 0 || note.fret > MAX_FRET)) {
				return { ok: false, error: `${where} has a note at fret ${note.fret}; frets are 0 to ${MAX_FRET}.` };
			}
			const technique = note.technique ? TECHNIQUES[note.technique] : null;
			if (note.technique && !technique) {
				return { ok: false, error: `"${note.technique}" is not a technique this app draws. Use ${Object.keys(TECHNIQUES).join(", ")}, or leave it out.` };
			}
			const seat = `${note.slot}:${note.string}`;
			if (taken.has(seat)) {
				return { ok: false, error: `${where} puts two notes on string ${note.string} at slot ${note.slot}. A string sounds one note at a time.` };
			}
			taken.add(seat);

			const at = byPosition.get(note.slot) ?? [];
			at.push({
				// 1 is the high e, and the editor stores the high e first.
				stringIndex: note.string - 1,
				fret: note.muted ? null : note.fret,
				muted: note.muted === true,
				technique,
			});
			byPosition.set(note.slot, at);
		}

		// A bar is exactly its slots, so `barSlots` cannot overflow here.
		measures.push({ slots: barSlots(byPosition, slotsPerBar, slotTicks, capacity).slots });
	}

	return { ok: true, draft: { timeSignature, measures } };
}
