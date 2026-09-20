import type { ImportedTabDraft, ValidationIssue } from "@/lib/tabImport";
import { looksLikeTextTab, readTextTab, textTabProse } from "@/lib/textTab/columns";
import { spacingReading } from "@/lib/textTab/readings";

/**
 * A pasted ASCII tab, read into an import draft — the tab assistant's way in.
 *
 * ASCII tab writes pitch exactly and rhythm only by spacing, so the frets are
 * read as written and the rhythm is inferred from the spacing: a bar's width
 * in characters is the bar's length, and the distance from one note to the
 * next is how long the note lasts. That inference is the part a player has
 * to check, and it is reported as a warning wherever it had to guess. The
 * column reading and the spacing reading live in `@/lib/textTab`, where the
 * other readings of the same columns are (#228).
 */

export interface AsciiTabOptions {
	timeSignature?: [number, number];
}

export type AsciiTabParse =
	| { ok: true; draft: ImportedTabDraft; warnings: ValidationIssue[] }
	| { ok: false; error: string };

/**
 * Whether the text holds at least one system of six tab lines — what the
 * router asks before anything reads the sentence as words.
 */
export const looksLikeAsciiTab = looksLikeTextTab;

/** Lines that are not tab, for whatever else the paste says (a title, a meter). */
export const asciiTabProse = textTabProse;

export function parseAsciiTab(text: string, options: AsciiTabOptions = {}): AsciiTabParse {
	const columns = readTextTab(text);
	if (columns === null) return { ok: false, error: "Six lines of tab are needed, one per string." };
	if (columns.bars.length === 0) return { ok: false, error: "The tab has no bars in it." };
	const reading = spacingReading(columns, options.timeSignature ?? [4, 4]);
	const warnings: ValidationIssue[] = [
		...reading.warnings,
		...columns.unknownMarks.map((mark) => ({
			code: "ASCII_UNKNOWN_MARK",
			path: "",
			message: `"${mark}" is not a mark this reader knows — it was skipped.`,
			original: mark,
		})),
	];
	return { ok: true, draft: reading.draft, warnings };
}
