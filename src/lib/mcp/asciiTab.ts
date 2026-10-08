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

/**
 * A bend after its fret, the way tab writes it: `7b9` bends fret 7 up to the
 * pitch of 9, `7b8r` lets it back down, `7pb9` is bent before the pick, and
 * a quarter bend has no fret to name so it is written `b¼`.
 */
function bendText(s: BeatSlot["strings"][number], fret: number): string {
	const semitones =
		s.technique === "bend-quarter" ? 0.5 : s.technique === "bend-half" ? 1 : s.technique === "bend-full" ? 2 : (s.bendTarget ?? 2);
	const target = semitones === 0.5 ? "¼" : String(fret + Math.round(semitones));
	const pre = s.technique === "pre-bend" || s.technique === "pre-bend-release" ? "pb" : "b";
	const release = s.technique === "bend-release" || s.technique === "pre-bend-release" ? "r" : "";
	return `${pre}${target}${release}`;
}

/** What one string shows in one slot: the fret with its marks, or nothing. */
function noteText(s: BeatSlot["strings"][number], isRest: boolean | undefined): string {
	if (isRest || s.fret === null) return "";
	if (s.muted) return "x";
	const mark = s.technique ? (TECHNIQUE_MARK[s.technique] ?? "") : "";
	const fret = s.tied ? `(${s.fret})` : String(s.fret);
	switch (s.technique) {
		case "bend-quarter":
		case "bend-half":
		case "bend-full":
		case "bend-release":
		case "pre-bend":
		case "pre-bend-release":
			return `${fret}${bendText(s, s.fret)}`;
		case "vibrato":
			return `${fret}~`;
		case "vibrato-wide":
			return `${fret}~~`;
		default:
			return `${mark}${fret}`;
	}
}

/** Whether any played string in the slot carries the bracket flag. */
function slotHas(slot: BeatSlot, flag: "palmMute" | "letRing"): boolean {
	return !slot.isRest && slot.strings.some((s) => s.fret !== null && s[flag] === true);
}

function pad(text: string, width: number): string {
	return text + "-".repeat(Math.max(0, width - text.length));
}

function padChord(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - text.length));
}

/**
 * Six lines, high e first, `|` between bars — plus a chord line above when any
 * slot carries a chord mark, and a `P.M.` / `let ring` line below for the
 * brackets, each run written as its label and dashes to the run's end. Every
 * string line has the same length, so the text keeps the rhythm when read in
 * a mono font.
 */
export function patternToAsciiTab(pattern: FingerpickPattern): string {
	const unit = shortestTicks(pattern);
	const lines: string[] = STRING_LETTERS.map((letter) => `${letter}|`);
	let chordLine = "  ";
	let anyChord = false;
	const brackets: { flag: "palmMute" | "letRing"; label: string; line: string; any: boolean; inRun: boolean }[] = [
		{ flag: "palmMute", label: "P.M.", line: "  ", any: false, inRun: false },
		{ flag: "letRing", label: "let ring", line: "  ", any: false, inRun: false },
	];

	for (const measure of pattern.measures) {
		for (const slot of measure.slots) {
			const texts = slot.strings.map((s) => noteText(s, slot.isRest));
			const chord = slot.chord ? chordAbbreviation(slot.chord) : "";
			if (chord) anyChord = true;
			const byDuration = Math.round(DURATION_TICKS[slot.duration] / unit) * MIN_SLOT_WIDTH;
			// A bracket label starting here must fit its column too.
			const labelWidths = brackets.map((b) => (slotHas(slot, b.flag) && !b.inRun ? b.label.length : 0));
			const widest = Math.max(...texts.map((t) => t.length), chord.length, ...labelWidths) + 1;
			const width = Math.max(MIN_SLOT_WIDTH, Math.min(MAX_SLOT_WIDTH, byDuration), widest);
			texts.forEach((t, i) => {
				lines[i] += pad(t, width);
			});
			chordLine += padChord(chord, width);
			for (const b of brackets) {
				const has = slotHas(slot, b.flag);
				if (has) {
					b.any = true;
					b.line += b.inRun ? "-".repeat(width) : pad(b.label, width);
				} else {
					b.line += " ".repeat(width);
				}
				b.inRun = has;
			}
		}
		lines.forEach((_, i) => {
			lines[i] += "|";
		});
		chordLine += " ";
		for (const b of brackets) {
			b.line += " ";
			b.inRun = false;
		}
	}

	const below = brackets.filter((b) => b.any).map((b) => b.line.trimEnd());
	return [...(anyChord ? [chordLine.trimEnd()] : []), ...lines, ...below].join("\n");
}
