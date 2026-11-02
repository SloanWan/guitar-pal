import type { ParseIssue } from "@/lib/books/types";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { normalizeImportedPattern } from "@/lib/tabImport/normalizeImportedPattern";
import { validateFingerpickPattern } from "@/lib/tabImport/validateFingerpickPattern";
import type { ValidationIssue } from "@/lib/tabImport/types";

/**
 * The tab extractor's gold set (#202): one record per exercise the parse read,
 * checked by hand on `/dev/tab-gold` so the extractor can be scored against it.
 * Records are files under `book-service/materials/tab-gold/<set>/` (gitignored:
 * the crops are book pages), seeded by `python -m evals.tab.seed` and read by
 * the eval runner as well as this page — the shape here is that file's.
 */

/**
 * `unchecked` waits for a look; `confirmed` means the model's reading is right
 * and is the gold as it stands; `corrected` means the gold is the reviewer's
 * edit; `unusable` keeps the exercise out of the score (not an exercise, or a
 * crop that lost part of it).
 */
export const TAB_GOLD_STATUSES = ["unchecked", "confirmed", "corrected", "unusable"] as const;
export type TabGoldStatus = (typeof TAB_GOLD_STATUSES)[number];

export interface TabGoldRecord {
	version: 1;
	id: string;
	set: string;
	/** The exercise's heading, as the model read it. */
	name: string;
	page: number | null;
	/** The crop's file name in the set's `crops/`. */
	crop: string;
	/** Whether the book prints a jianpu row under this staff; null until someone says. */
	jianpu: boolean | null;
	model: {
		source: string;
		exportedAt?: string | null;
		/** The extractor's draft as the parse stored it (an ImportedTabDraft). */
		draft: unknown;
		warnings: ParseIssue[];
	};
	status: TabGoldStatus;
	gold: FingerpickPattern | null;
	note: string;
	reviewedAt: string | null;
}

/** What the review page sends back. */
export interface TabGoldReview {
	status: TabGoldStatus;
	gold: FingerpickPattern | null;
	jianpu: boolean | null;
	note: string;
}

/** One line of the index. */
export interface TabGoldItem {
	id: string;
	name: string;
	page: number | null;
	status: TabGoldStatus;
}

export interface TabGoldSet {
	name: string;
	title: string;
	items: TabGoldItem[];
}

/** A set or record name: what the seed writes, and nothing a path could climb out of. */
export function isTabGoldSlug(value: string): boolean {
	return /^[\w-]{1,120}$/.test(value);
}

/** A crop's file name inside a set's `crops/`. */
export function isTabGoldCrop(value: string): boolean {
	return /^[\w-]{1,120}\.png$/.test(value);
}

const MAX_NOTE = 2000;

/**
 * A review as the page sent it, checked: a known status, a gold tab that is a
 * valid pattern whenever the status says there is one, and nothing else.
 */
export function readReview(body: unknown): { review: TabGoldReview } | { error: string } {
	if (typeof body !== "object" || body === null) return { error: "The review is not an object." };
	const { status, gold, jianpu, note } = body as Record<string, unknown>;
	if (typeof status !== "string" || !(TAB_GOLD_STATUSES as readonly string[]).includes(status)) {
		return { error: `Unknown status: ${String(status)}` };
	}
	if (jianpu !== null && typeof jianpu !== "boolean") return { error: "jianpu must be true, false or null." };
	if (note !== undefined && typeof note !== "string") return { error: "note must be text." };
	if (typeof note === "string" && note.length > MAX_NOTE) return { error: `note is over ${MAX_NOTE} characters.` };

	const hasGold = status === "confirmed" || status === "corrected";
	if (!hasGold) {
		return { review: { status: status as TabGoldStatus, gold: null, jianpu: jianpu ?? null, note: note ?? "" } };
	}
	const { pattern, errors } = validateFingerpickPattern(gold);
	if (!pattern || errors.length > 0) {
		return { error: `The gold tab is not valid: ${errors.map((e) => e.message).join("; ") || "no pattern"}` };
	}
	return { review: { status: status as TabGoldStatus, gold: pattern, jianpu: jianpu ?? null, note: note ?? "" } };
}

/** The model's draft as the editor and the staves take it, or why it cannot be. */
export function modelPattern(record: Pick<TabGoldRecord, "model">): {
	pattern: FingerpickPattern | null;
	errors: ValidationIssue[];
} {
	const { pattern, errors } = normalizeImportedPattern(record.model.draft);
	return { pattern, errors };
}

/**
 * The chord names the model read off the page but could not place: the
 * extractor keeps them, in order, as the draft's description and puts none on
 * a slot. Empty when the page has none or the tab already places them.
 */
export function unplacedChords(record: Pick<TabGoldRecord, "model">, pattern: FingerpickPattern | null): string[] {
	const draft = record.model.draft;
	if (typeof draft !== "object" || draft === null) return [];
	const description = (draft as { description?: unknown }).description;
	if (typeof description !== "string") return [];
	if (pattern?.measures.some((m) => m.slots.some((slot) => slot.chord))) return [];
	return description.split(/\s+/).filter(Boolean);
}

/** How many of each status, for the index's progress line. */
export function countStatuses(items: readonly Pick<TabGoldItem, "status">[]): Record<TabGoldStatus, number> {
	const counts: Record<TabGoldStatus, number> = { unchecked: 0, confirmed: 0, corrected: 0, unusable: 0 };
	for (const item of items) counts[item.status] += 1;
	return counts;
}

/** Page order, then the crop's own order (`p0002-r1-10` after `p0002-r1-9`). */
export function compareItems(a: TabGoldItem, b: TabGoldItem): number {
	if ((a.page ?? 0) !== (b.page ?? 0)) return (a.page ?? 0) - (b.page ?? 0);
	return a.id.localeCompare(b.id, "en", { numeric: true });
}

/** The next exercise still unchecked after this one, wrapping round; null when none is left. */
export function nextUnchecked(items: readonly TabGoldItem[], currentId: string): string | null {
	const at = items.findIndex((item) => item.id === currentId);
	for (let step = 1; step <= items.length; step++) {
		const item = items[(at + step + items.length) % items.length];
		if (item.status === "unchecked" && item.id !== currentId) return item.id;
	}
	return null;
}

/** The neighbours in the set's order, for the review page's arrows. */
export function neighbours(items: readonly TabGoldItem[], currentId: string): { prev: string | null; next: string | null } {
	const at = items.findIndex((item) => item.id === currentId);
	if (at < 0) return { prev: null, next: null };
	return { prev: items[at - 1]?.id ?? null, next: items[at + 1]?.id ?? null };
}
