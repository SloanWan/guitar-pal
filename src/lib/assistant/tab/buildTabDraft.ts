import type { Link, NoteEffects, Percussion } from "@/lib/fingerpickTypes";
import { DURATION_TICKS, MAX_FRET, measureCapacity } from "@/lib/fingerpickEdit";
import { plainDurationForTicks } from "@/lib/fingerpickPickSequence";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordRef } from "@/lib/strumPatterns";
import { EFFECTS_INPUT, OFFERED_EFFECT_KINDS, resolveChordName, type ImportedTabDraft, type RepeatBarInput } from "@/lib/tabImport";
import { LINK_KINDS, PERCUSSION_KINDS, isLinkKind, isPercussionKind } from "@/lib/techniqueRegistry";
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
	/** How the note is reached: a link kind from the registry. */
	link?: string;
	/** What is done to the note: the registry's effects map, checked here. */
	effects?: unknown;
	/** Palm-muted (P.M.) — the bracket spans consecutive notes that carry it. */
	palmMute?: boolean;
	/** Let ring — likewise. */
	letRing?: boolean;
	/** An x: a dead note on the string, struck and pitchless. The fret is ignored. */
	muted?: boolean;
}

/** A right-hand hit on a slot of the bar. */
export interface ProposedHit {
	slot: number;
	kind: string;
}

/** A chord name over a slot of the bar, as written; "N.C." for no chord. */
export interface ProposedChord {
	slot: number;
	name: string;
}

export interface ProposedBar extends RepeatBarInput {
	notes: ProposedNote[];
	hits?: ProposedHit[];
	chords?: ProposedChord[];
}

export interface BuildTabDraftInput {
	slotsPerBar: number;
	bars: readonly ProposedBar[];
	timeSignature: [number, number];
	/**
	 * Bar 1 is a pickup holding only the last this-many slots of a bar, its
	 * notes' slots counted from 0 within them; it plays straight into bar 2
	 * (`pickupLead`). Absent, every bar is full.
	 */
	pickupSlots?: number;
	/** The library a chord name is looked up in (`resolveChordName`). */
	chordIndex?: readonly ChordIndexEntry[];
}

export type BuildTabDraftResult =
	/** `warnings`: chord names the library lacks, left off, each naming its bar. */
	| { ok: true; draft: ImportedTabDraft; warnings: string[] }
	| { ok: false; error: string };

/** The effects map as the model wrote it, or why it cannot be taken. */
function readEffects(value: unknown, where: string): { ok: true; effects: NoteEffects | undefined } | { ok: false; error: string } {
	if (value === undefined || value === null) return { ok: true, effects: undefined };
	if (typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `${where} has effects that are not an object; write {bend: {semitones: 2}} or leave it out.` };
	const unknown = Object.keys(value).filter((kind) => !(OFFERED_EFFECT_KINDS as string[]).includes(kind));
	if (unknown.length > 0) {
		return { ok: false, error: `"${unknown[0]}" is not an effect this app draws. Use ${OFFERED_EFFECT_KINDS.join(", ")}, or leave it out.` };
	}
	const parsed = EFFECTS_INPUT.safeParse(value);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return { ok: false, error: `${where} has a bad ${issue.path.join(".")} in effects: ${issue.message}.` };
	}
	const effects = parsed.data as NoteEffects;
	return { ok: true, effects: Object.keys(effects).length > 0 ? effects : undefined };
}

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

	const { pickupSlots } = input;
	if (pickupSlots !== undefined) {
		if (!Number.isInteger(pickupSlots) || pickupSlots < 1 || pickupSlots >= slotsPerBar) {
			return { ok: false, error: `pickupSlots ${pickupSlots} is not a pickup: it is 1 to ${slotsPerBar - 1}, the slots of a bar the pickup holds. Leave it out when bar 1 is full.` };
		}
		if (bars.length < 2) return { ok: false, error: "A pickup leads into a bar after it; with one bar, leave pickupSlots out." };
	}

	const capacity = measureCapacity(timeSignature);
	const measures: ({ slots: (ReturnType<typeof barSlots>["slots"][number] & { chord?: ChordRef })[] } & RepeatBarInput)[] = [];
	const warnings: string[] = [];

	for (const [index, bar] of bars.entries()) {
		const where = `Bar ${index + 1}`;
		// A pickup is the end of a bar: fewer slots, the same size each.
		const positions = index === 0 && pickupSlots !== undefined ? pickupSlots : slotsPerBar;
		const barCapacity = (capacity / slotsPerBar) * positions;
		const byPosition = new Map<number, GridNote[]>();
		const taken = new Set<string>();

		for (const note of bar.notes) {
			if (!Number.isInteger(note.slot) || note.slot < 0 || note.slot >= positions) {
				return { ok: false, error: `${where} has a note on slot ${note.slot}; with ${positions} slots ${positions === slotsPerBar ? "a bar" : "in the pickup"} the last one is ${positions - 1}.` };
			}
			if (!Number.isInteger(note.string) || note.string < 1 || note.string > 6) {
				return { ok: false, error: `${where} has a note on string ${note.string}; strings are 1 (high e) to 6 (low E).` };
			}
			if (!note.muted && (!Number.isInteger(note.fret) || note.fret < 0 || note.fret > MAX_FRET)) {
				return { ok: false, error: `${where} has a note at fret ${note.fret}; frets are 0 to ${MAX_FRET}.` };
			}
			if (note.link !== undefined && !isLinkKind(note.link)) {
				return { ok: false, error: `"${note.link}" is not a link this app draws. Use ${LINK_KINDS.join(", ")}, or leave it out.` };
			}
			const effects = readEffects(note.effects, where);
			if (!effects.ok) return effects;
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
				...(note.link !== undefined ? { link: { kind: note.link } as Link } : {}),
				...(effects.effects ? { effects: effects.effects } : {}),
				...(note.palmMute ? { palmMute: true } : {}),
				...(note.letRing ? { letRing: true } : {}),
			});
			byPosition.set(note.slot, at);
		}

		const hits = new Map<number, Percussion>();
		for (const hit of bar.hits ?? []) {
			if (!Number.isInteger(hit.slot) || hit.slot < 0 || hit.slot >= positions) {
				return { ok: false, error: `${where} has a hit on slot ${hit.slot}; with ${positions} slots ${positions === slotsPerBar ? "a bar" : "in the pickup"} the last one is ${positions - 1}.` };
			}
			if (!isPercussionKind(hit.kind)) {
				return { ok: false, error: `"${hit.kind}" is not a hit this app knows. Use ${PERCUSSION_KINDS.join(", ")}.` };
			}
			hits.set(hit.slot, { kind: hit.kind });
		}

		// A bar is exactly its slots, so `barSlots` cannot overflow here.
		const slots: (ReturnType<typeof barSlots>["slots"][number] & { chord?: ChordRef })[] = barSlots(byPosition, positions, barCapacity, hits).slots;

		// A chord mark sits on the slot struck at its position, as import_tab's does.
		for (const mark of bar.chords ?? []) {
			if (!Number.isInteger(mark.slot) || mark.slot < 0 || mark.slot >= positions) {
				return { ok: false, error: `${where} has a chord on slot ${mark.slot}; with ${positions} slots ${positions === slotsPerBar ? "a bar" : "in the pickup"} the last one is ${positions - 1}.` };
			}
			if (!byPosition.has(mark.slot) && !hits.has(mark.slot)) {
				return { ok: false, error: `${where} has the chord "${mark.name}" on slot ${mark.slot}, where nothing is struck; put it on the slot of the note it is written over.` };
			}
			const chord = resolveChordName(mark.name, input.chordIndex ?? []);
			if (!chord) {
				warnings.push(`${where}: the library has no chord called "${mark.name}"; the mark was left off.`);
				continue;
			}
			const tick = Math.round((mark.slot / positions) * barCapacity / DURATION_TICKS["32nd"]) * DURATION_TICKS["32nd"];
			let at = 0;
			const target = slots.find((slot) => {
				const starts = at === tick;
				at += DURATION_TICKS[slot.duration];
				return starts;
			});
			if (target) target.chord = chord;
		}

		// Its barlines and ending ride along for the validator and `playOrder`.
		measures.push({
			slots,
			...(bar.repeatStart ? { repeatStart: true } : {}),
			...(bar.repeatEnd ? { repeatEnd: true } : {}),
			...(bar.repeatEnd && bar.repeatTimes !== undefined ? { repeatTimes: bar.repeatTimes } : {}),
			...(bar.ending ? { ending: bar.ending } : {}),
		});
	}

	return { ok: true, draft: { timeSignature, measures }, warnings };
}
