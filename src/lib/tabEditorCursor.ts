import type { EffectKind, FingerpickPattern, Link, LinkKind, NoteEffects, SpanKind } from "@/lib/fingerpickTypes";
import { MAX_FRET, makeEmptyStringFret, setInactive, setSlotsRest, toggleDot, toggleMuted, withMeasures, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import {
	nextBend,
	nextVibrato,
	setEffect,
	setLink,
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

/** Shift-click on a column's square: the run from where it started (or the cursor) to the clicked slot. */
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

// ── A block of cells (#437) ──────────────────────────────────────────────────

/** Shift-clicked cells: the strings × slots between two cells, across barlines. */
export interface CellBlock {
	anchor: Cell;
	head: Cell;
}

/** Every cell of the block, slot by slot, high string first. */
export function blockCells(pattern: FingerpickPattern, block: CellBlock): Cell[] {
	const a = slotOrder(pattern, block.anchor);
	const b = slotOrder(pattern, block.head);
	const top = Math.min(block.anchor.stringIndex, block.head.stringIndex);
	const bottom = Math.max(block.anchor.stringIndex, block.head.stringIndex);
	const out: Cell[] = [];
	for (let n = Math.min(a, b); n <= Math.max(a, b); n++)
		for (let stringIndex = top; stringIndex <= bottom; stringIndex++) out.push({ ...slotAtOrder(pattern, n), stringIndex });
	return out;
}

/** Shift+arrow over a block: its head (and the cursor) a slot or a string on; the anchor stays. */
export function growBlock(pattern: FingerpickPattern, cursor: Cell, block: CellBlock | null, axis: "slot" | "string", delta: -1 | 1): CellBlock {
	const head = axis === "slot" ? stepSlot(pattern, cursor, delta) : stepString(cursor, delta);
	return { anchor: block?.anchor ?? cursor, head };
}

const sounds = (pattern: FingerpickPattern, cell: Cell): boolean => {
	const sf = noteAt(pattern, cell);
	return !!sf && (sf.fret !== null || sf.muted);
};

/**
 * The block's notes a string up or down, or a slot back or on, together — the
 * frets as written, every mark with them. The block and the cursor go with
 * them. Refused when a note would leave the tab or land on a note that stays.
 */
export function moveBlock(
	pattern: FingerpickPattern,
	block: CellBlock,
	cursor: Cell,
	axis: "slot" | "string",
	delta: -1 | 1,
): { pattern: FingerpickPattern; block: CellBlock; cursor: Cell } | { blocked: string } {
	const last = slotOrder(pattern, { measureIndex: pattern.measures.length - 1, slotIndex: pattern.measures.at(-1)!.slots.length - 1 });
	const shift = (cell: Cell): Cell | null => {
		if (axis === "string") {
			const stringIndex = cell.stringIndex + delta;
			return stringIndex < 0 || stringIndex > 5 ? null : { ...cell, stringIndex };
		}
		const n = slotOrder(pattern, cell) + delta;
		return n < 0 || n > last ? null : { ...slotAtOrder(pattern, n), stringIndex: cell.stringIndex };
	};
	const key = (c: Cell) => `${c.measureIndex}:${c.slotIndex}:${c.stringIndex}`;
	const notes = blockCells(pattern, block).filter((c) => sounds(pattern, c));
	if (notes.length === 0) return { blocked: "No notes in the selection to move" };
	const moving = new Set(notes.map(key));
	const targets: Cell[] = [];
	for (const note of notes) {
		const to = shift(note);
		if (!to)
			return {
				blocked:
					axis === "string"
						? delta < 0 ? "A note is already on the high e string" : "A note is already on the low E string"
						: delta < 0 ? "A note is already in the first slot" : "A note is already in the last slot",
			};
		if (sounds(pattern, to) && !moving.has(key(to))) return { blocked: "A note that is not selected is in the way" };
		targets.push(to);
	}
	const measures = pattern.measures.map((m) => ({ ...m, slots: m.slots.map((s) => ({ ...s, strings: [...s.strings] as typeof s.strings })) }));
	const taken = notes.map((c) => measures[c.measureIndex].slots[c.slotIndex].strings[c.stringIndex]);
	for (const c of notes) measures[c.measureIndex].slots[c.slotIndex].strings[c.stringIndex] = makeEmptyStringFret();
	targets.forEach((c, i) => {
		const slot = measures[c.measureIndex].slots[c.slotIndex];
		slot.strings[c.stringIndex] = taken[i];
		if (slot.isRest) delete slot.isRest;
	});
	const keep = (cell: Cell) => shift(cell) ?? cell;
	return { pattern: { ...pattern, measures }, block: { anchor: keep(block.anchor), head: keep(block.head) }, cursor: keep(cursor) };
}

/** The block's cells that hold a note (a fret or an x). */
export function blockNotes(pattern: FingerpickPattern, block: CellBlock): Cell[] {
	return blockCells(pattern, block).filter((c) => sounds(pattern, c));
}

/** The slots a block spans, in order: what a slot edit (a span, a rest, a hit) acts on. */
export function blockSlots(pattern: FingerpickPattern, block: CellBlock): SlotTarget[] {
	const seen = new Set<string>();
	return blockCells(pattern, block).flatMap((c) => {
		const key = `${c.measureIndex}:${c.slotIndex}`;
		if (seen.has(key)) return [];
		seen.add(key);
		return [slotOf(c)];
	});
}

/** An edit on several notes: the tab, and how many notes it could not go on. */
export interface NotesEdit {
	pattern: FingerpickPattern;
	skipped: number;
}

/** A link on every note (null takes it off); a note it is not available to is left as it is (#437). */
export function linkOnNotes(pattern: FingerpickPattern, cells: readonly Cell[], link: Link | null): NotesEdit {
	let skipped = 0;
	const next = cells.reduce((p, c) => {
		if (link && techniqueBlock(p, c, link.kind)) {
			skipped++;
			return p;
		}
		return setLink(p, c, link);
	}, pattern);
	return { pattern: next, skipped };
}

/** An effect on every note (null takes it off); a note it is not available to is left as it is (#437). */
export function effectOnNotes<K extends EffectKind>(
	pattern: FingerpickPattern,
	cells: readonly Cell[],
	kind: K,
	value: NoteEffects[K] | null,
): NotesEdit {
	let skipped = 0;
	const semitones = kind === "bend" && value ? (value as NonNullable<NoteEffects["bend"]>).semitones : undefined;
	const next = cells.reduce((p, c) => {
		if (value !== null && techniqueBlock(p, c, kind, semitones)) {
			skipped++;
			return p;
		}
		return setEffect(p, c, kind, value);
	}, pattern);
	return { pattern: next, skipped };
}

/**
 * A key's edit over a block (#437): a note's edit goes on every note in it, on
 * or off as the lead note (the cursor's, else the first) has it; an x goes on
 * every cell; a slot's edit (a span, a hit, a rest, a dot) on the block's slots.
 */
export function applyBlockEdit(
	pattern: FingerpickPattern,
	block: CellBlock,
	cursor: Cell,
	edit: NoteEdit,
): (EditResult & { skipped?: number }) {
	const notes = blockNotes(pattern, block);
	const lead = notes.find((c) => c.measureIndex === cursor.measureIndex && c.slotIndex === cursor.slotIndex && c.stringIndex === cursor.stringIndex) ?? notes[0];
	const leadNote = lead ? noteAt(pattern, lead) : undefined;
	const settle = (done: NotesEdit): EditResult & { skipped?: number } =>
		done.skipped === notes.length && notes.length > 0 ? { blocked: "None of the selected notes can take it" } : done;
	switch (edit.kind) {
		case "clear":
			return { pattern: clearBlock(pattern, block) };
		case "mute": {
			const cells = blockCells(pattern, block);
			const allX = cells.every((c) => noteAt(pattern, c)?.muted === true);
			// All x already: they go; else every cell becomes an x (a note's fret gives way to it).
			return { pattern: cells.reduce((p, c) => (allX ? setInactive(p, c) : noteAt(p, c)?.muted ? p : toggleMuted(p, c)), pattern) };
		}
		case "link": {
			if (!leadNote) return { blocked: "No notes in the selection" };
			if (leadNote.link?.kind === edit.link)
				return linkOnNotes(pattern, notes.filter((c) => noteAt(pattern, c)?.link?.kind === edit.link), null);
			return settle(linkOnNotes(pattern, notes, { kind: edit.link }));
		}
		case "bend":
			if (!leadNote) return { blocked: "No notes in the selection" };
			return settle(effectOnNotes(pattern, notes, "bend", nextBend(leadNote.effects?.bend)));
		case "vibrato":
			if (!leadNote) return { blocked: "No notes in the selection" };
			return settle(effectOnNotes(pattern, notes, "vibrato", nextVibrato(leadNote.effects?.vibrato)));
		default:
			return applyNoteEdit(pattern, cursor, blockSlots(pattern, block), edit);
	}
}

/** Every cell of the block emptied: Backspace over a block. */
export function clearBlock(pattern: FingerpickPattern, block: CellBlock): FingerpickPattern {
	let next = pattern;
	for (const cell of blockCells(pattern, block)) if (sounds(next, cell)) next = setInactive(next, cell);
	return next;
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
	| { kind: "string"; delta: -1 | 1; extend: boolean }
	| { kind: "digit"; digit: number }
	| { kind: "clear" }
	| { kind: "mute" }
	| { kind: "link"; link: LinkKind }
	| { kind: "bend" }
	| { kind: "vibrato" }
	| { kind: "span"; span: SpanKind }
	| { kind: "slap" }
	| { kind: "rest" }
	| { kind: "dot" }
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

// T, H, P and S toggle a link (`/` a slide too); M and L a span — the registry's keys.
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
			return { kind: "string", delta: -1, extend: e.shiftKey };
		case "ArrowDown":
			return { kind: "string", delta: 1, extend: e.shiftKey };
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
	if (lower === "r") return { kind: "rest" };
	if (e.key === ".") return { kind: "dot" };
	if (e.key === "/") return { kind: "link", link: "slide" };
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
	muted: "An x is a dead note: there is no pitch to shape",
	"open-string": "An open string cannot be bent or shaken",
	"off-neck": "The bend would run off the neck",
	"no-previous-note": "No previous note on this string",
	"previous-muted": "The previous note on this string is a dead note (x)",
	"wrong-direction": "Not valid for this fret movement",
	"different-fret": "Not valid for this fret movement",
};

export type NoteEdit = Extract<
	EditorKeyAction,
	{ kind: "clear" | "mute" | "link" | "bend" | "vibrato" | "span" | "slap" | "rest" | "dot" }
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
 * spans, the slap and the rest go over the run; a link, bend or vibrato goes on the note,
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
		case "dot": {
			// The dot at the cursor's slot; one that would swallow notes is the toolbar's, which asks first.
			const dot = toggleDot(pattern.measures, cursor.measureIndex, cursor.slotIndex, pattern.timeSignature);
			if (dot.type === "blocked") return { blocked: dot.reason };
			if (dot.type === "confirm")
				return { blocked: `The dot would drop the notes after it: use the toolbar's dot to confirm` };
			return { pattern: withMeasures(pattern, dot.measures) };
		}
		case "rest": {
			// The same rule: rests when any slot of the run still sounds.
			const all = slots.every((t) => pattern.measures[t.measureIndex]?.slots[t.slotIndex]?.isRest === true);
			return { pattern: setSlotsRest(pattern, [...slots], !all) };
		}
	}
}

