import type { TabGoldItem, TabGoldStatus } from "@/lib/tabGold";

/**
 * The page classifier's gold set (#422): one record per page of the notation
 * eval's sample, checked by hand on `/dev/page-gold` so a classifier can be
 * scored against a person rather than against Sonnet. Records are files under
 * `book-service/materials/page-gold/<book>/` (gitignored: the images are book
 * pages), seeded by `python -m evals.classify.seed` from the cached verdicts —
 * the shape here is that file's.
 *
 * Statuses are the tab gold set's: `confirmed` keeps the model's kind,
 * `corrected` changes it, `unusable` keeps the page out of the score. The
 * notation and the exercise count are answered either way.
 */

/** The classifier's kinds (`PageKind` in book-service/app/graph/state.py). */
export const PAGE_KINDS = [
	"prose",
	"chord_diagrams",
	"strum_notation",
	"tab",
	"progression_map",
	"fretboard_diagram",
	"mixed",
	"other",
] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/**
 * What is printed on the page, whatever its kind. `tab` is what the parse
 * reads (a `tab` page, or a `mixed` page's tab regions); jianpu and staff the
 * classifier has no kind for.
 */
export const NOTATIONS = ["tab", "jianpu", "staff", "strum", "chord_diagrams"] as const;
export type Notation = (typeof NOTATIONS)[number];

/** More than any page of the sample holds; a typo guard, not a rule about books. */
export const MAX_EXERCISES = 40;

export interface PageGoldRecord {
	version: 1;
	id: string;
	set: string;
	page: number;
	/** The page's file name in the set's `pages/`. */
	image: string;
	model: {
		source: string;
		/** `error` when the classifier failed on the page twice. */
		kind: PageKind | "error";
		regions: string[];
		note: string;
	};
	status: TabGoldStatus;
	/** The answer: the model's until someone changes it; null when there is none to start from. */
	kind: PageKind | null;
	notation: Notation[];
	/** The tab exercises on the page, as the segmenter should find them; null until counted. */
	exercises: number | null;
	note: string;
	reviewedAt: string | null;
}

/** What the review page sends: an answer, the page set aside, or the review undone. */
export type PageGoldDecision = "answer" | "unusable" | "unchecked";

export interface PageGoldReview {
	status: TabGoldStatus;
	kind: PageKind | null;
	notation: Notation[];
	exercises: number | null;
	note: string;
}

export interface PageGoldItem extends TabGoldItem {
	/** The kind as it stands: the answer once reviewed, else the model's. */
	kind: PageKind | null;
}

export interface PageGoldSet {
	name: string;
	title: string;
	items: PageGoldItem[];
}

const MAX_NOTE = 2000;

const isKind = (value: unknown): value is PageKind =>
	typeof value === "string" && (PAGE_KINDS as readonly string[]).includes(value);

/**
 * A review as the page sent it, checked against the model's kind it is judged
 * by. An answer needs a kind, notation from the list, and — when the page has
 * tab — how many exercises; a page without tab holds none. The status follows
 * from the kind: the model's is `confirmed`, any other `corrected`.
 */
export function readPageReview(body: unknown, modelKind: PageGoldRecord["model"]["kind"]): { review: PageGoldReview } | { error: string } {
	if (typeof body !== "object" || body === null) return { error: "The review is not an object." };
	const { decision, kind, notation, exercises, note } = body as Record<string, unknown>;
	if (note !== undefined && typeof note !== "string") return { error: "note must be text." };
	if (typeof note === "string" && note.length > MAX_NOTE) return { error: `note is over ${MAX_NOTE} characters.` };
	const text = note ?? "";

	if (decision === "unchecked") return { review: { status: "unchecked", kind: null, notation: [], exercises: null, note: text } };
	if (decision === "unusable") return { review: { status: "unusable", kind: null, notation: [], exercises: null, note: text } };
	if (decision !== "answer") return { error: `Unknown decision: ${String(decision)}` };

	if (!isKind(kind)) return { error: `Unknown kind: ${String(kind)}` };
	if (!Array.isArray(notation) || !notation.every((n) => (NOTATIONS as readonly unknown[]).includes(n))) {
		return { error: "notation must be a list of known notations." };
	}
	const marks = NOTATIONS.filter((n) => notation.includes(n));
	let count = 0;
	if (marks.includes("tab")) {
		if (typeof exercises !== "number" || !Number.isInteger(exercises) || exercises < 0 || exercises > MAX_EXERCISES) {
			return { error: `A page with tab needs its exercise count, 0 to ${MAX_EXERCISES}.` };
		}
		count = exercises;
	}
	return {
		review: { status: kind === modelKind ? "confirmed" : "corrected", kind, notation: marks, exercises: count, note: text },
	};
}

/** The kind a page shows in the index: the answer once reviewed, else the model's. */
export function shownKind(record: Pick<PageGoldRecord, "kind" | "model">): PageKind | null {
	return record.kind ?? (isKind(record.model.kind) ? record.model.kind : null);
}

/** Of the pages answered, how many kept the model's kind: the share a reviewer could have been led by. */
export function agreement(items: readonly Pick<PageGoldItem, "status">[]): { kept: number; answered: number } {
	const kept = items.filter((item) => item.status === "confirmed").length;
	const answered = kept + items.filter((item) => item.status === "corrected").length;
	return { kept, answered };
}
