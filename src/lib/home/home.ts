import type { BeatSlot, FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ModuleKey } from "@/lib/moduleForPath";

/**
 * What /home says and lists, worked out from the player's rows and the clock.
 * Pure: the loader (`loadHome.ts`) reads, this decides, the page draws.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** "21:40", on the player's own clock. */
export function clockLabel(at: Date): string {
	return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** Calendar days from `at` to `now`, local time: 0 today, 1 yesterday. */
function daysBefore(at: Date, now: Date): number {
	const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	return Math.round((day(now) - day(at)) / 86_400_000);
}

/**
 * When something happened, as said beside it: the time today, "yesterday",
 * the weekday within the week, else the date.
 */
export function whenLabel(at: Date, now: Date): string {
	const days = daysBefore(at, now);
	if (days <= 0) return clockLabel(at);
	if (days === 1) return "yesterday";
	if (days < 7) return WEEKDAYS[at.getDay()];
	return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** "Thursday, 21:40" — the line over the greeting. */
export function todayLabel(now: Date): string {
	return `${WEEKDAYS[now.getDay()]}, ${clockLabel(now)}`;
}

/**
 * The greeting. A name only when the player gave one in Settings — never an
 * email's local part, which reads as an account and shows the address on a
 * shared screen. The question carries it without one.
 */
export function greeting(now: Date, nickname: string | null): string {
	const hour = now.getHours();
	const part = hour >= 5 && hour < 12 ? "Morning" : hour >= 12 && hour < 18 ? "Afternoon" : "Evening";
	return `${part}${nickname ? `, ${nickname}` : ""}. What are we playing?`;
}

/** Monday 00:00 of the week `now` is in, local time. */
export function weekStart(now: Date): Date {
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
	return start;
}

/** How many of `stamps` (ISO strings) fall on or after `since`. */
export function countSince(stamps: readonly (string | null | undefined)[], since: Date): number {
	const from = since.getTime();
	return stamps.filter((s) => s != null && Date.parse(s) >= from).length;
}

export interface WeekCounts {
	progressions: number;
	chords: number;
	links: number;
}

/** A week with nothing saved shows nothing: no row of zeros. */
export function weekIsEmpty(counts: WeekCounts): boolean {
	return counts.progressions + counts.chords + counts.links === 0;
}

/** What a kept row can be un-kept or kept as. */
export type KeepTarget =
	| { kind: "strum"; id: string }
	| { kind: "tab"; id: string }
	| { kind: "chord"; root: string; suffix: string };

export interface KeptItem {
	/** Unique across the list. */
	key: string;
	module: Extract<ModuleKey, "strum" | "tab" | "chords">;
	title: string;
	subline: string;
	href: string;
	/** ISO; null for rows the table keeps no date on (kept tabs), which list last. */
	createdAt: string | null;
	/** Present when the row is a favourite or could be one: the pick at its end. */
	keep?: { target: KeepTarget; kept: boolean };
	/** Opening it opens this progression on its pattern. */
	progressionId?: string;
}

/** Newest first; undated rows after every dated one, in the order given. */
export function sortKept(items: readonly KeptItem[]): KeptItem[] {
	return items
		.map((item, i) => ({ item, i, t: item.createdAt === null ? Number.NEGATIVE_INFINITY : Date.parse(item.createdAt) }))
		.sort((a, b) => b.t - a.t || a.i - b.i)
		.map(({ item }) => item);
}

/** A tab note as the tile's preview draws it: which string (0 = high e) and what is written there. */
export interface PreviewNote {
	string: number;
	text: string;
}

export interface TabPreview {
	/** One column per slot, left to right. */
	columns: PreviewNote[][];
	/** Column indexes a barline stands before (never 0). */
	barlines: number[];
}

function slotNotes(slot: BeatSlot): PreviewNote[] {
	if (slot.isRest) return [];
	return slot.strings.flatMap((s, i) =>
		s.muted ? [{ string: i, text: "x" }] : s.fret === null ? [] : [{ string: i, text: String(s.fret) }],
	);
}

/**
 * The opening of a tab, for a tile: its first `maxColumns` slots (grace notes
 * left out, they have no column of their own), whole measures only unless the
 * first is already longer.
 */
export function tabPreview(pattern: FingerpickPattern, maxColumns: number): TabPreview {
	const columns: PreviewNote[][] = [];
	const barlines: number[] = [];
	for (const measure of pattern.measures) {
		const slots = measure.slots.filter((s) => !s.isGraceNote);
		if (columns.length > 0 && columns.length + slots.length > maxColumns) break;
		if (columns.length > 0) barlines.push(columns.length);
		for (const slot of slots) {
			if (columns.length === maxColumns) break;
			columns.push(slotNotes(slot));
		}
		if (columns.length === maxColumns) break;
	}
	return { columns, barlines };
}
