import * as z from "zod";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { searchChords } from "@/lib/chordSearch";
import { exactChord } from "@/lib/assistant/chordAsk";
import type { BeatSlot, Duration, FingerpickPattern, Measure, Technique } from "@/lib/fingerpickTypes";
import { DURATION_TICKS, measureCapacity } from "@/lib/fingerpickEdit";
import type { ChordRef } from "@/lib/strumPatterns";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { isSupportedMeter, meterLabel, SUPPORTED_METERS, type Meter } from "@/lib/strumMeter";
import { MAX_MEASURES, normalizeImportedPattern, TECHNIQUE_SUPPORT } from "@/lib/tabImport";
import type { ImportedTabDraft, ValidationIssue } from "@/lib/tabImport";

/**
 * The MCP server's `import_tab` (#308): a tab the model read off an image or
 * a page, given as bars of slots with a written duration each, not as ASCII.
 *
 * ASCII tab carries rhythm only by spacing, and `parseAsciiTab` has to guess
 * it back. A printed tab has the rhythm on the page — stems, flags, dots — so
 * a transcription writes it down and nothing is inferred. The shape here is
 * the model's: a slot lists the strings it strikes (`{string, fret}`, string
 * 1 = high e) rather than the six-tuple the editor holds, since six objects a
 * slot, five of them null, is where a model loses count. `toImportedTabDraft`
 * turns it into the draft every other import goes through, and the same
 * validator (`normalizeImportedPattern`) has the last word.
 *
 * What the validator cannot know is whether a note sits on the right string:
 * a wrong string is a legal fret. `uncertain` is the model's own list of the
 * places it guessed; it is kept on the pattern's description so the player
 * knows where to look.
 */

const DURATIONS = Object.keys(DURATION_TICKS) as [Duration, ...Duration[]];

/** Only the techniques the stave can draw; the rest would be dropped with a warning anyway. */
const TECHNIQUES = (Object.keys(TECHNIQUE_SUPPORT) as NonNullable<Technique>[]).filter(
	(t) => TECHNIQUE_SUPPORT[t].renderSupported,
) as [NonNullable<Technique>, ...NonNullable<Technique>[]];

export const MAX_SLOTS_PER_BAR = 64;
export const MAX_UNCERTAIN = 50;
const NAME_MAX = 80;
const UNCERTAIN_MAX_CHARS = 200;

export const IMPORT_NOTE_SCHEMA = z.object({
	string: z.number().int().min(1).max(6).describe("1 = high e, 6 = low E."),
	fret: z.number().int().min(0).max(24).describe("0 = open string."),
	technique: z
		.enum(TECHNIQUES)
		.optional()
		.describe("How the note is reached from the previous slot on this string, when the page marks one."),
	tied: z.boolean().optional().describe("The note is held over from the previous slot, not struck again."),
	muted: z.boolean().optional().describe("A dead note, printed as x."),
	bendTarget: z
		.union([z.literal(0.5), z.literal(1), z.literal(2)])
		.optional()
		.describe("With bend-release, pre-bend or pre-bend-release: the printed height, 0.5 (¼), 1 (½) or 2 (full). A full tone when left out."),
	palmMute: z.boolean().optional().describe("Under a P.M. bracket; mark every note the bracket spans."),
	letRing: z.boolean().optional().describe("Under a let-ring bracket; mark every note the bracket spans."),
});

export const IMPORT_SLOT_SCHEMA = z.object({
	duration: z.enum(DURATIONS).describe("The written note value of this slot."),
	notes: z.array(IMPORT_NOTE_SCHEMA).max(6).describe("The strings struck together in this slot; empty with rest: true for a rest."),
	rest: z.boolean().optional().describe("A rest of this duration."),
	chord: z.string().max(20).optional().describe("A chord name printed above this slot, as printed."),
});

export const IMPORT_BAR_SCHEMA = z.object({
	slots: z.array(IMPORT_SLOT_SCHEMA).min(1).max(MAX_SLOTS_PER_BAR),
	repeatStart: z.boolean().optional().describe("A repeat barline |: opens this bar."),
	repeatEnd: z.boolean().optional().describe("A repeat barline :| closes this bar."),
	repeatTimes: z.number().int().min(2).max(8).optional().describe("Total times the repeated section ending here is played; 2 when unmarked."),
});

/** The tool's input, as a raw shape for `registerTool`. */
export const IMPORT_TAB_SHAPE = {
	name: z.string().max(NAME_MAX).describe("The piece or exercise, as titled on the page; two or three words when it has none."),
	timeSignature: z.string().describe(`As printed: ${SUPPORTED_METERS.map(meterLabel).join(", ")}.`),
	bpm: z.number().int().min(0).max(300).describe("The printed tempo, counting the beat (♩ in 4/4, ♩. in 6/8); 0 when none is printed."),
	capo: z.number().int().min(0).max(12).optional().describe("The capo fret, when the page says so."),
	bars: z.array(IMPORT_BAR_SCHEMA).min(1).max(MAX_MEASURES),
	uncertain: z
		.array(z.string().max(UNCERTAIN_MAX_CHARS))
		.max(MAX_UNCERTAIN)
		.optional()
		.describe("Places you could not read with confidence, one line each, naming the bar: \"bar 3, slot 2: fret 5 or 6\"."),
};

export type ImportNote = z.infer<typeof IMPORT_NOTE_SCHEMA>;
export type ImportSlot = z.infer<typeof IMPORT_SLOT_SCHEMA>;
export type ImportBar = z.infer<typeof IMPORT_BAR_SCHEMA>;
export type ImportTabInput = z.infer<z.ZodObject<typeof IMPORT_TAB_SHAPE>>;

export type ImportTabResult =
	| { ok: true; pattern: FingerpickPattern; warnings: ValidationIssue[] }
	| { ok: false; errors: ValidationIssue[] };

/** `"6/8"` → `[6, 8]`, when it is a meter this app plays. */
export function parseMeter(text: string): Meter | null {
	const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text);
	if (!m) return null;
	const meter: [number, number] = [Number(m[1]), Number(m[2])];
	return isSupportedMeter(meter) ? meter : null;
}

/**
 * The chord a printed word names: exactly, or the picker's best match, so
 * "Am7" and "a minor 7" both land. Null when the library has nothing for it.
 */
function resolveChord(word: string, index: readonly ChordIndexEntry[]): ChordRef | null {
	const exact = exactChord(word, index);
	if (exact) return exact;
	const first = searchChords(index, word, 1)[0];
	return first ? { root: first.root, suffix: first.suffix, voicingId: null } : null;
}

function silent(): BeatSlot["strings"][number] {
	return { fret: null, technique: null, tied: false, muted: false };
}

const issue = (code: string, path: string, message: string): ValidationIssue => ({ code, path, message });

/**
 * The model's bars as the import draft. Structural problems the validator
 * would repair silently — two notes on one string, a bar that overflows its
 * meter — are errors here instead: in a transcription each one is a misread
 * to send back, not a shape to tidy.
 */
export function toImportedTabDraft(
	input: ImportTabInput,
	index: readonly ChordIndexEntry[],
): { draft: ImportedTabDraft; errors: ValidationIssue[]; warnings: ValidationIssue[] } {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	const meter = parseMeter(input.timeSignature);
	if (meter === null) {
		errors.push(
			issue(
				"UNSUPPORTED_METER",
				"timeSignature",
				`"${input.timeSignature}" is not a meter this app plays. Use ${SUPPORTED_METERS.map(meterLabel).join(", ")}.`,
			),
		);
	}
	const capacity = meter ? measureCapacity(meter) : null;

	const measures: Measure[] = input.bars.map((bar, barIndex) => {
		const barPath = `bars[${barIndex}]`;
		let ticks = 0;
		const slots: BeatSlot[] = bar.slots.map((slot, slotIndex) => {
			const slotPath = `${barPath}.slots[${slotIndex}]`;
			ticks += DURATION_TICKS[slot.duration];
			const strings: BeatSlot["strings"] = [silent(), silent(), silent(), silent(), silent(), silent()];
			const seen = new Set<number>();
			for (const note of slot.notes) {
				if (seen.has(note.string)) {
					errors.push(
						issue(
							"DUPLICATE_STRING",
							`${slotPath}.notes`,
							`Bar ${barIndex + 1}, slot ${slotIndex + 1} strikes string ${note.string} twice; one slot holds one note per string.`,
						),
					);
					continue;
				}
				seen.add(note.string);
				strings[note.string - 1] = {
					fret: note.fret,
					technique: note.technique ?? null,
					tied: note.tied === true,
					muted: note.muted === true,
					...(note.bendTarget !== undefined ? { bendTarget: note.bendTarget } : {}),
					...(note.palmMute ? { palmMute: true } : {}),
					...(note.letRing ? { letRing: true } : {}),
				};
			}
			const out: BeatSlot = { id: crypto.randomUUID(), duration: slot.duration, strings };
			if (slot.rest === true) out.isRest = true;
			else if (slot.notes.length === 0) {
				warnings.push(
					issue(
						"EMPTY_SLOT",
						`${slotPath}.notes`,
						`Bar ${barIndex + 1}, slot ${slotIndex + 1} strikes nothing and is not marked as a rest; it plays as a rest.`,
					),
				);
				out.isRest = true;
			}
			if (slot.chord !== undefined && slot.chord.trim() !== "") {
				const chord = resolveChord(slot.chord, index);
				if (chord) out.chord = chord;
				else {
					warnings.push(
						issue(
							"UNKNOWN_CHORD",
							`${slotPath}.chord`,
							`Bar ${barIndex + 1}: the library has no chord called "${slot.chord}"; the mark was left off.`,
						),
					);
				}
			}
			return out;
		});

		if (capacity !== null) {
			if (ticks > capacity) {
				errors.push(
					issue(
						"BAR_OVERFULL",
						`${barPath}.slots`,
						`Bar ${barIndex + 1} holds ${describeTicks(ticks)} but ${meterLabel(meter!)} holds ${describeTicks(capacity)}; a duration is misread.`,
					),
				);
			} else if (ticks < capacity) {
				warnings.push(
					issue(
						"BAR_UNDERFULL",
						`${barPath}.slots`,
						`Bar ${barIndex + 1} holds ${describeTicks(ticks)} of ${describeTicks(capacity)}; the rest of the bar is silent. Fine for a pickup bar, otherwise a duration is missing.`,
					),
				);
			}
		}

		const measure: Measure = { id: crypto.randomUUID(), slots };
		if (bar.repeatStart) measure.repeatStart = true;
		if (bar.repeatEnd) {
			measure.repeatEnd = true;
			if (bar.repeatTimes !== undefined) measure.repeatTimes = bar.repeatTimes;
		}
		return measure;
	});

	const uncertain = (input.uncertain ?? []).map((line) => line.trim()).filter((line) => line !== "");
	const draft: ImportedTabDraft = {
		name: input.name.trim() || "Imported tab",
		...(uncertain.length > 0 ? { description: uncertainDescription(uncertain) } : {}),
		bpm: input.bpm > 0 ? input.bpm : undefined,
		timeSignature: meter ?? undefined,
		measures,
	};
	if (input.capo !== undefined && input.capo > 0) {
		// The draft type has no capo field; the validator reads it off the object.
		(draft as ImportedTabDraft & { capo: number }).capo = input.capo;
	}
	return { draft, errors, warnings };
}

/** A tick count as note values a person reads: 96 → "4 quarter notes", 30 → "2.5 quarter notes". */
function describeTicks(ticks: number): string {
	const quarters = ticks / DURATION_TICKS.quarter;
	const n = Number.isInteger(quarters) ? String(quarters) : quarters.toFixed(2).replace(/0+$/, "");
	return `${n} quarter note${quarters === 1 ? "" : "s"}`;
}

/** What the player sees under the pattern's name: where the transcription was unsure. */
export function uncertainDescription(lines: readonly string[]): string {
	return `Transcribed from an image; check these against the original: ${lines.join("; ")}.`;
}

/** The whole path: the model's bars, through the draft, through the validator. */
export function importTab(input: ImportTabInput, index: readonly ChordIndexEntry[]): ImportTabResult {
	const { draft, errors, warnings } = toImportedTabDraft(input, index);
	if (errors.length > 0) return { ok: false, errors };
	const normalized = normalizeImportedPattern(draft);
	if (!normalized.pattern) return { ok: false, errors: normalized.errors };
	return { ok: true, pattern: normalized.pattern, warnings: [...warnings, ...normalized.warnings] };
}

/**
 * A pattern back into the tool's bars, so `read_share` hands the model
 * something it can change and send through `import_tab` again without loss.
 * Repeat barlines ride along; a chord mark is written as its abbreviation.
 */
export function patternToImportBars(pattern: FingerpickPattern): ImportBar[] {
	return pattern.measures.map((measure) => {
		const bar: ImportBar = {
			slots: measure.slots.map((slot) => {
				const notes: ImportNote[] = [];
				slot.strings.forEach((s, i) => {
					if (s.fret === null) return;
					const note: ImportNote = { string: i + 1, fret: s.fret };
					if (s.technique) note.technique = s.technique;
					if (s.tied) note.tied = true;
					if (s.muted) note.muted = true;
					if (s.bendTarget === 0.5 || s.bendTarget === 1 || s.bendTarget === 2) note.bendTarget = s.bendTarget;
					if (s.palmMute) note.palmMute = true;
					if (s.letRing) note.letRing = true;
					notes.push(note);
				});
				const out: ImportSlot = { duration: slot.duration, notes };
				if (slot.isRest) out.rest = true;
				if (slot.chord) out.chord = chordAbbreviation(slot.chord);
				return out;
			}),
		};
		if (measure.repeatStart) bar.repeatStart = true;
		if (measure.repeatEnd) {
			bar.repeatEnd = true;
			if (measure.repeatTimes !== undefined) bar.repeatTimes = measure.repeatTimes;
		}
		return bar;
	});
}
