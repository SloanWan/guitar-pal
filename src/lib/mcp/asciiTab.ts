import type { BeatSlot, FingerpickPattern, Technique } from "@/lib/fingerpickTypes";
import { DURATION_TICKS } from "@/lib/fingerpickEdit";
import { chordAbbreviation } from "@/lib/strumProgressions";

/**
 * A pattern written out as ASCII tab, for the model to read back (#308).
 *
 * This is a preview, not a storage format: it is what a tool result shows so
 * the model can check what the app made of its draft, and what `read_share`
 * hands back alongside the structured bars. Column width follows duration —
 * a slot gets two characters per shortest note value in the pattern, so an
 * eighth is twice as wide as a sixteenth — which is the convention a pasted
 * tab's spacing reading assumes, and what a reader's eye expects.
 */

/** String letters, index 0 = high e, as the editor holds them. */
const STRING_LETTERS = ["e", "B", "G", "D", "A", "E"] as const;

const TECHNIQUE_MARK: Partial<Record<NonNullable<Technique>, string>> = {
	"hammer-on": "h",
	"pull-off": "p",
	"slide-up": "/",
	"slide-down": "\\",
	vibrato: "~",
	"vibrato-wide": "~",
	tapping: "t",
	trill: "tr",
};

/** Widest a slot is written, whatever its duration: a whole note over 32nds would otherwise run 64 columns. */
const MAX_SLOT_WIDTH = 16;
const MIN_SLOT_WIDTH = 2;

function shortestTicks(pattern: FingerpickPattern): number {
	let shortest = DURATION_TICKS.whole;
	for (const measure of pattern.measures) {
		for (const slot of measure.slots) shortest = Math.min(shortest, DURATION_TICKS[slot.duration]);
	}
	return shortest;
}

/** What one string shows in one slot: the fret with its marks, or nothing. */
function noteText(s: BeatSlot["strings"][number], isRest: boolean | undefined): string {
	if (isRest || s.fret === null) return "";
	if (s.muted) return "x";
	const mark = s.technique ? (TECHNIQUE_MARK[s.technique] ?? "") : "";
	const fret = s.tied ? `(${s.fret})` : String(s.fret);
	return `${mark}${fret}`;
}

function pad(text: string, width: number): string {
	return text + "-".repeat(Math.max(0, width - text.length));
}

function padChord(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - text.length));
}

/**
 * Six lines, high e first, `|` between bars — plus a chord line above when any
 * slot carries a chord mark. Every string line has the same length, so the
 * text keeps the rhythm when read in a mono font.
 */
export function patternToAsciiTab(pattern: FingerpickPattern): string {
	const unit = shortestTicks(pattern);
	const lines: string[] = STRING_LETTERS.map((letter) => `${letter}|`);
	let chordLine = "  ";
	let anyChord = false;

	for (const measure of pattern.measures) {
		for (const slot of measure.slots) {
			const texts = slot.strings.map((s) => noteText(s, slot.isRest));
			const chord = slot.chord ? chordAbbreviation(slot.chord) : "";
			if (chord) anyChord = true;
			const byDuration = Math.round(DURATION_TICKS[slot.duration] / unit) * MIN_SLOT_WIDTH;
			const widest = Math.max(...texts.map((t) => t.length), chord.length) + 1;
			const width = Math.max(MIN_SLOT_WIDTH, Math.min(MAX_SLOT_WIDTH, byDuration), widest);
			texts.forEach((t, i) => {
				lines[i] += pad(t, width);
			});
			chordLine += padChord(chord, width);
		}
		lines.forEach((_, i) => {
			lines[i] += "|";
		});
		chordLine += " ";
	}

	return (anyChord ? [chordLine.trimEnd(), ...lines] : lines).join("\n");
}
