import { MAX_FRET, setFret, setInactive, toggleMuted, type Cell } from "@/lib/fingerpickEdit";
import type { FretHint } from "@/lib/fingerpickChords";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";

/**
 * The tab editor's fretboard dock (#359): what a click on a fret writes, how the
 * frets are labelled, and how a phone pages through the neck five frets at a time.
 */

/** Frets a phone shows at once: 0–4, 5–9 … 20–24. */
export const PAGE_FRETS = 5;
export const PAGE_COUNT = Math.ceil((MAX_FRET + 1) / PAGE_FRETS);
/** A swipe has to travel this far sideways to turn the page. */
export const SWIPE_MIN_PX = 40;

/** Every fret on the neck, the open string first. */
export const ALL_FRETS: readonly number[] = Array.from({ length: MAX_FRET + 1 }, (_, f) => f);

/** The page a fret is on. */
export function pageForFret(fret: number): number {
	return Math.max(0, Math.min(PAGE_COUNT - 1, Math.floor(fret / PAGE_FRETS)));
}

export function fretsOnPage(page: number): number[] {
	const first = pageForFret(page * PAGE_FRETS) * PAGE_FRETS;
	return ALL_FRETS.slice(first, first + PAGE_FRETS);
}

/** The page after a sideways swipe of `dx` px: leftwards goes up the neck. Short swipes stay. */
export function swipePage(page: number, dx: number): number {
	if (Math.abs(dx) < SWIPE_MIN_PX) return page;
	return Math.max(0, Math.min(PAGE_COUNT - 1, page + (dx < 0 ? 1 : -1)));
}

/** Where a fretboard dot sits (the inlays); two at the octaves. */
export function inlayDots(fret: number): 0 | 1 | 2 {
	if (fret === 12 || fret === 24) return 2;
	return [3, 5, 7, 9, 15, 17, 19, 21].includes(fret) ? 1 : 0;
}

export type DockLabelStyle = "fret" | "name" | "jianpu";
export const DOCK_LABEL_STYLES: readonly DockLabelStyle[] = ["fret", "name", "jianpu"];

export function isDockLabelStyle(value: unknown): value is DockLabelStyle {
	return typeof value === "string" && (DOCK_LABEL_STYLES as readonly string[]).includes(value);
}

/**
 * What a fret is called on the dock: its number, or the note it sounds — through
 * `soundingMidi` and `pitchLabel`, the reader's pitch row and playback's own
 * formula, so the three never disagree. The capo is in the sound, not the number.
 */
export function dockLabel(stringIndex: number, fret: number, capo: number, style: DockLabelStyle): string {
	if (style === "fret") return String(fret);
	return pitchLabel(soundingMidi(stringIndex, fret, capo), style);
}

/** A fret button's accessible name ("String 2, fret 3"); strings count from the high e. */
export function fretButtonName(stringIndex: number, fret: number, written: "note" | "x" | null, hint: boolean): string {
	const state = written === "note" ? ", written" : written === "x" ? ", x written" : hint ? ", in the shape" : "";
	return `String ${stringIndex + 1}, ${fret === 0 ? "open" : `fret ${fret}`}${state}`;
}

/**
 * A click on the dock at the cursor's slot: the fret on that string, or — on the
 * fret already written there — nothing (click again clears). Shift writes an x
 * (a slap), or takes one away.
 */
export function dockWrite(pattern: FingerpickPattern, cell: Cell, fret: number, shift: boolean): FingerpickPattern {
	const sf = pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex];
	if (!sf) return pattern;
	if (shift) return toggleMuted(pattern, cell);
	if (!sf.muted && sf.fret === fret) return setInactive(pattern, cell);
	return setFret(pattern, cell, fret);
}

/** What a string's frets show at the cursor's slot: the written fret, an x, the shape's hint. */
export function dockRow(
	pattern: FingerpickPattern,
	cell: Pick<Cell, "measureIndex" | "slotIndex">,
	stringIndex: number,
	hints: readonly FretHint[] | null,
): { written: number | "x" | null; hint: number | null } {
	const sf = pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[stringIndex];
	const hint = hints?.[stringIndex];
	return {
		written: sf?.muted ? "x" : (sf?.fret ?? null),
		hint: typeof hint === "number" ? hint : null,
	};
}
