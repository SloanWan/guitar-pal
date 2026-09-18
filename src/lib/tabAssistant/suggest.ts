import { pick, type Lang } from "@/lib/strumAssistant/lang";
import { BLANK, type Guidance } from "@/lib/strumAssistant/suggest";
import type { TabSentenceReading } from "@/lib/tabAssistant/readTabSentence";

/**
 * What to offer when nothing read a fingerpicking sentence whole: what was
 * read, and the sentences that would have worked — with what was read
 * already filled in, and blanks for the rest.
 */
export function suggestTab(reading: TabSentenceReading, lang: Lang = "en"): Guidance {
	const chords = reading.chordWords.map((w) => w.text).join(" ");
	const chordOr = chords || BLANK;
	const templates = [
		`${chordOr}: 5 3 2 1 3 2 1 3`,
		pick(lang, `travis picking in ${chordOr}`, `${chordOr} 三指法`),
		"string:66544322, fret:8-11-10-8-10-8-8-11",
		chords ? chords : "C G Am F",
	];

	const read: string[] = [];
	if (chords) read.push(pick(lang, `the chords ${chords}`, `和弦 ${chords}`));
	if (reading.style) read.push(pick(lang, `the style ${reading.style.label.toLowerCase()}`, `风格 ${reading.style.label}`));
	if (reading.bpm !== null) read.push(pick(lang, `${reading.bpm} BPM`, `${reading.bpm} BPM`));

	const text =
		read.length > 0
			? pick(
					lang,
					`Read ${read.join(", ")}, but not the rest. A chord with the strings to pick, strings and frets written out, a style word over a chord, or six lines of tab — any of these I can read whole:`,
					`读到了${read.join("、")}，其余没读懂。和弦加要弹的弦号、直接写弦号和品格、风格词加和弦、或者六行 tab——这些我都能整句读：`,
				)
			: pick(
					lang,
					"I didn't read that. A chord with the strings to pick, strings and frets written out, a style word over a chord, or six lines of tab pasted in — any of these I can read whole:",
					"这句没读懂。和弦加要弹的弦号、直接写弦号和品格、风格词加和弦、或者直接贴六行 tab——这些我都能整句读：",
				);
	return { text, templates: [...new Set(templates)] };
}
