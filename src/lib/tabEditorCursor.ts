import type { FingerpickPattern, LinkKind, SpanKind } from "@/lib/fingerpickTypes";
import { MAX_FRET, setInactive, toggleMuted, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import {
	nextBend,
	nextVibrato,
	setEffect,
	setPercussion,
	slotOf,
	techniqueBlock,
	toggleLink,
	toggleSpanOver,
} from "@/lib/fingerpickTechniqueEdit";
import { LINK_DEFS, SPAN_DEFS, isLinkKind, isSpanKind, type AvailabilityBlock } from "@/lib/techniqueRegistry";

/**
 * The tab editor's cursor and keys (#360): where the cursor is (a slot and a
 * string), the run of slots selected with Shift, the 800ms two-digit fret entry,
 * and what each key does to the tab. Pure — the page holds the state, the timers
 * and the commit.
 */

/** A second digit within this window makes a two-digit fret (≤ 24); `--gp-two-digit` in tokens.css. */
export const TWO_DIGIT_WINDOW_MS = 800;

/** A Shift-extended run of slots, from where it was started to where the cursor is. */
export interface Selection {
	anchor: SlotTarget;
	head: SlotTarget;
}

// ── Slots in order ───────────────────────────────────────────────────────────

/** The slot's place counting every slot of the tab from the first. */
export function slotOrder(pattern: FingerpickPattern, target: SlotTarget): number {
	let n = 0;
	for (let m = 0; m < target.measureIndex; m++) n += pattern.measures[m].slots.length;
	return n + target.slotIndex;
}

/** The slot at a place in that order, held inside the tab. */
export function slotAtOrder(pattern: FingerpickPattern, order: number): SlotTarget {
	let left = Math.max(0, order);
	for (let m = 0; m < pattern.measures.length; m++) {
		const len = pattern.measures[m].slots.length;
		if (left < len) return { measureIndex: m, slotIndex: left };
		left -= len;
	}
	const last = pattern.measures.length - 1;
	return { measureIndex: last, slotIndex: pattern.measures[last].slots.length - 1 };
}

/** The cursor a slot forward or back, across barlines, stopping at either end; the string stays. */
export function stepSlot(pattern: FingerpickPattern, cell: Cell, delta: number): Cell {
	return { ...slotAtOrder(pattern, slotOrder(pattern, cell) + delta), stringIndex: cell.stringIndex };
}

/** The cursor a string up (towards the high e) or down, held on the six. */
export function stepString(cell: Cell, delta: number): Cell {
	return { ...cell, stringIndex: Math.max(0, Math.min(5, cell.stringIndex + delta)) };
}

/** The cursor kept on the tab after an edit removed slots or bars under it. */
export function clampCell(pattern: FingerpickPattern, cell: Cell): Cell {
	const measureIndex = Math.max(0, Math.min(pattern.measures.length - 1, cell.measureIndex));
	const slots = pattern.measures[measureIndex].slots.length;
	return { measureIndex, slotIndex: Math.max(0, Math.min(slots - 1, cell.slotIndex)), stringIndex: cell.stringIndex };
}

/** The slots an edit acts on: the selection's run in order, or the cursor's slot alone. */
export function selectedSlots(pattern: FingerpickPattern, cursor: Cell, selection: Selection | null): SlotTarget[] {
	if (!selection) return [slotOf(cursor)];
	const a = slotOrder(pattern, selection.anchor);
	const b = slotOrder(pattern, selection.head);
	const out: SlotTarget[] = [];
	for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.push(slotAtOrder(pattern, n));
	return out;
}

/** Shift+arrow: the cursor moves and the run grows (or shrinks) from where it started. */
export function extendSelection(
	pattern: FingerpickPattern,
	cursor: Cell,
	selection: Selection | null,
	delta: number,
): { cursor: Cell; selection: Selection } {
	const next = stepSlot(pattern, cursor, delta);
	return { cursor: next, selection: { anchor: selection?.anchor ?? slotOf(cursor), head: slotOf(next) } };
}

/** Shift-click: the run from where it started (or the cursor) to the clicked slot. */
export function selectTo(cursor: Cell, selection: Selection | null, target: Cell): { cursor: Cell; selection: Selection } {
	return { cursor: target, selection: { anchor: selection?.anchor ?? slotOf(cursor), head: slotOf(target) } };
}

export function inSelection(pattern: FingerpickPattern, selection: Selection | null, target: SlotTarget): boolean {
	if (!selection) return false;
	const n = slotOrder(pattern, target);
	const a = slotOrder(pattern, selection.anchor);
	const b = slotOrder(pattern, selection.head);
	return n >= Math.min(a, b) && n <= Math.max(a, b);
}

// ── Two-digit frets ──────────────────────────────────────────────────────────

/** A first digit that a second could still join, on the cell it was typed on. */
export interface PendingDigit {
	cell: Cell;
	digit: number;
	at: number;
}

function sameCell(a: Cell, b: Cell): boolean {
	return a.measureIndex === b.measureIndex && a.slotIndex === b.slotIndex && a.stringIndex === b.stringIndex;
}

/**
 * A digit typed on `cell` at `now`: the fret it writes, and whether it waits for
 * a second. "1" then "2" within the window is 12; "3" then "0" would be 30, past
 * the neck, so the 0 starts over. Only a 1 or a 2 can begin a two-digit fret.
 */
export function typeDigit(
	pending: PendingDigit | null,
	cell: Cell,
	digit: number,
	now: number,
): { fret: number; pending: PendingDigit | null } {
	if (pending && sameCell(pending.cell, cell) && now - pending.at < TWO_DIGIT_WINDOW_MS) {
		const combined = pending.digit * 10 + digit;
		if (combined <= MAX_FRET) return { fret: combined, pending: null };
	}
	return { fret: digit, pending: digit * 10 <= MAX_FRET && digit > 0 ? { cell, digit, at: now } : null };
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export type EditorKeyAction =
	| { kind: "slot"; delta: -1 | 1; extend: boolean }
	| { kind: "string"; delta: -1 | 1 }
	| { kind: "digit"; digit: number }
	| { kind: "clear" }
	| { kind: "mute" }
	| { kind: "link"; link: LinkKind }
	| { kind: "bend" }
	| { kind: "vibrato" }
	| { kind: "span"; span: SpanKind }
	| { kind: "slap" }
	| { kind: "escape" }
	| { kind: "play" }
	| { kind: "undo" }
	| { kind: "redo" };

export interface KeyPress {
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
}

// H, P and / toggle a link; M and L a span — the registry's keys.
const LINK_KEYS = new Map(LINK_DEFS.filter((t) => t.key).map((t) => [t.key!.toLowerCase(), t.kind]));
const SPAN_KEYS = new Map(SPAN_DEFS.filter((t) => t.key).map((t) => [t.key!.toLowerCase(), t.kind]));

/** What a key press on the tab does; null for a key the editor leaves alone. */
export function editorKeyAction(e: KeyPress): EditorKeyAction | null {
	const command = e.metaKey || e.ctrlKey;
	if (command) {
		if (e.altKey || e.key.toLowerCase() !== "z") return null;
		return { kind: e.shiftKey ? "redo" : "undo" };
	}
	if (e.altKey) return null;
	switch (e.key) {
		case "ArrowLeft":
			return { kind: "slot", delta: -1, extend: e.shiftKey };
		case "ArrowRight":
			return { kind: "slot", delta: 1, extend: e.shiftKey };
		case "Tab":
			return { kind: "slot", delta: e.shiftKey ? -1 : 1, extend: false };
		case "ArrowUp":
			return { kind: "string", delta: -1 };
		case "ArrowDown":
			return { kind: "string", delta: 1 };
		case "Backspace":
		case "Delete":
			return { kind: "clear" };
		case "Escape":
			return { kind: "escape" };
		case " ":
			return { kind: "play" };
	}
	if (/^[0-9]$/.test(e.key)) return { kind: "digit", digit: Number(e.key) };
	const lower = e.key.toLowerCase();
	if (lower === "x") return { kind: "mute" };
	if (lower === "b") return { kind: "bend" };
	if (lower === "v") return { kind: "vibrato" };
	if (lower === "s") return { kind: "slap" };
	const link = LINK_KEYS.get(lower);
	if (link && isLinkKind(link)) return { kind: "link", link };
	const span = SPAN_KEYS.get(lower);
	if (span && isSpanKind(span)) return { kind: "span", span };
	return null;
}

// ── Edits ────────────────────────────────────────────────────────────────────

/** Why a technique cannot go on the note, said in full where the player sees it. */
export const BLOCK_REASON: Record<AvailabilityBlock, string> = {
	"no-note": "Needs a note",
	muted: "An x is a slap: there is no pitch to shape",
	"open-string": "An open string cannot be bent or shaken",
	"off-neck": "The bend would run off the neck",
	"no-previous-note": "No previous note on this string",
	"previous-muted": "The previous note on this string is a slap",
	"wrong-direction": "Not valid for this fret movement",
	"different-fret": "Not valid for this fret movement",
};

export type NoteEdit = Extract<
	EditorKeyAction,
	{ kind: "clear" | "mute" | "link" | "bend" | "vibrato" | "span" | "slap" }
>;

export type EditResult = { pattern: FingerpickPattern } | { blocked: string };

function noteAt(pattern: FingerpickPattern, cell: Cell) {
	return pattern.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex];
}

function clearSlots(pattern: FingerpickPattern, slots: readonly SlotTarget[]): FingerpickPattern {
	let next = pattern;
	for (const slot of slots)
		for (let stringIndex = 0; stringIndex < 6; stringIndex++) next = setInactive(next, { ...slot, stringIndex });
	return next;
}

/**
 * A key's edit at the cursor. Clear empties the note, or every slot of a run;
 * spans and the slap go over the run; a link, bend or vibrato goes on the note,
 * or comes back blocked with the reason when the note cannot take it.
 */
export function applyNoteEdit(
	pattern: FingerpickPattern,
	cursor: Cell,
	slots: readonly SlotTarget[],
	edit: NoteEdit,
): EditResult {
	const sf = noteAt(pattern, cursor);
	if (!sf) return { pattern };
	switch (edit.kind) {
		case "clear":
			return { pattern: slots.length > 1 ? clearSlots(pattern, slots) : setInactive(pattern, cursor) };
		case "mute":
			return { pattern: toggleMuted(pattern, cursor) };
		case "link": {
			const block = sf.link?.kind === edit.link ? null : techniqueBlock(pattern, cursor, edit.link);
			return block ? { blocked: BLOCK_REASON[block] } : { pattern: toggleLink(pattern, cursor, edit.link) };
		}
		case "bend": {
			const bend = nextBend(sf.effects?.bend);
			const block = techniqueBlock(pattern, cursor, "bend", bend.semitones);
			return block ? { blocked: BLOCK_REASON[block] } : { pattern: setEffect(pattern, cursor, "bend", bend) };
		}
		case "vibrato": {
			const block = techniqueBlock(pattern, cursor, "vibrato");
			return block
				? { blocked: BLOCK_REASON[block] }
				: { pattern: setEffect(pattern, cursor, "vibrato", nextVibrato(sf.effects?.vibrato)) };
		}
		case "span":
			return { pattern: toggleSpanOver(pattern, edit.span, slots) };
		case "slap": {
			// On when any slot of the run lacks it; off when all have it.
			const all = slots.every((t) => pattern.measures[t.measureIndex]?.slots[t.slotIndex]?.percussion?.kind === "slap");
			let next = pattern;
			for (const t of slots) next = setPercussion(next, t, all ? undefined : { kind: "slap" });
			return { pattern: next };
		}
	}
}

