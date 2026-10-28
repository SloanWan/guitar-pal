import type { AttachHandoff } from "@/lib/assistant/handoff";
import { MAX_BATCH_TOKENS } from "@/lib/chordBatchResolve";
import { ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import { PRESET_STRUM_PATTERNS, STRUM_CAPO_MAX, type ChordRef } from "@/lib/strumPatterns";
import { alignToRhythm, patternRhythm } from "@/lib/strumRhythm";

/**
 * The chords board on /chords: chords side by side, each on the shape the player
 * paged to. It lives in the URL (`?board=C Am@2 F G`) so a link reproduces it, and
 * in localStorage so it is still there after a visit to a chord's page.
 */

/** One card: the chord as typed, and which of its shapes is showing (0 = the first). */
export interface BoardItem {
	readonly token: string;
	readonly shape: number;
}

/** Where the board is kept between visits: its URL parameters, as a query string. */
export const BOARD_STORAGE_KEY = "chordsBoard";

/** Transposing goes up to an octave less a semitone either way. */
export const BOARD_TRANSPOSE_LIMIT = 11;
export const BOARD_CAPO_MAX = STRUM_CAPO_MAX;

/**
 * The board as a whole: its cards, how far they are transposed, and the capo they
 * are played behind. The cards are what is held, the way a chord sheet writes
 * "Capo 3: C Am F G": transposing changes them, a capo only changes what they sound.
 */
export interface BoardState {
	readonly items: readonly BoardItem[];
	readonly transpose: number;
	readonly capo: number;
}

/** The board's URL parameters, as a page receives them. */
export interface BoardParams {
	readonly board?: string;
	readonly transpose?: string;
	readonly capo?: string;
}

const SEPARATOR = /[\s,|]+/;
const SHAPE_SUFFIX = /@(\d+)$/;

/** `C Am@2 F` → three cards, the second on its second shape. Capped like any chord list. */
export function parseBoard(text: string): BoardItem[] {
	return text
		.trim()
		.split(SEPARATOR)
		.filter((part) => part.length > 0)
		.slice(0, MAX_BATCH_TOKENS)
		.map((part) => {
			const shape = SHAPE_SUFFIX.exec(part);
			if (!shape) return { token: part, shape: 0 };
			const token = part.slice(0, shape.index);
			return token ? { token, shape: Math.max(0, Number(shape[1]) - 1) } : { token: part, shape: 0 };
		});
}

/** The inverse of `parseBoard`: shapes past the first are written `@n`, counting from 1. */
export function serializeBoard(items: readonly BoardItem[]): string {
	return items.map((item) => (item.shape > 0 ? `${item.token}@${item.shape + 1}` : item.token)).join(" ");
}

function readInt(value: string | undefined, min: number, max: number): number {
	const n = Number(value);
	return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : 0;
}

/** `?board=C Am&transpose=2&capo=3` → the board; anything unreadable is left at its default. */
export function readBoardParams(params: BoardParams): BoardState {
	return {
		items: parseBoard(params.board ?? ""),
		transpose: readInt(params.transpose, -BOARD_TRANSPOSE_LIMIT, BOARD_TRANSPOSE_LIMIT),
		capo: readInt(params.capo, 0, BOARD_CAPO_MAX),
	};
}

/** The inverse of `readBoardParams`, leaving out what is at its default. */
export function boardParams(state: BoardState): Record<string, string> {
	const params: Record<string, string> = {};
	const board = serializeBoard(state.items);
	if (board) params.board = board;
	if (state.transpose !== 0) params.transpose = String(state.transpose);
	if (state.capo !== 0) params.capo = String(state.capo);
	return params;
}

function shiftNote(note: string, semitones: number): string | null {
	const pc = rootPitchClass(note);
	return pc === undefined ? null : ROOT_CHROMATIC_ORDER[(((pc + semitones) % 12) + 12) % 12];
}

/**
 * A chord moved by `semitones`, spelled the way the library spells its roots; a
 * slash chord's bass moves with it. Null for a chord whose notes cannot be read.
 */
export function transposeChord(root: string, suffix: string, semitones: number): { root: string; suffix: string } | null {
	const shifted = shiftNote(root, semitones);
	if (shifted === null) return null;
	const slash = suffix.indexOf("/");
	if (slash === -1) return { root: shifted, suffix };
	const bass = shiftNote(suffix.slice(slash + 1), semitones);
	return bass === null ? null : { root: shifted, suffix: `${suffix.slice(0, slash)}/${bass}` };
}

/** A card as it goes to Strum: a chord, or what was typed when the library has none. */
export type BoardChord = { readonly chord: ChordRef } | { readonly unknown: string };

/**
 * The board as a progression on the Strum pattern `patternId`: one bar a chord,
 * behind the board's capo. Bars carry a preset's rhythm when the pattern is the
 * player's own, which this page cannot read; Strum lays them over the pattern's
 * rhythm when it takes them.
 */
export function boardProgression(chords: readonly BoardChord[], patternId: string, capo: number): AttachHandoff {
	const preset = PRESET_STRUM_PATTERNS.find((p) => p.id === patternId);
	const bars = chords.map((c) => ("chord" in c ? { beats: [], chord: c.chord } : { beats: [], chord: null, unknownChord: c.unknown }));
	return {
		kind: "attach",
		patternId,
		patternName: preset?.name ?? "The pattern you last opened",
		bars: alignToRhythm(bars, patternRhythm(preset ?? PRESET_STRUM_PATTERNS[0])),
		capo: capo > 0 ? capo : null,
	};
}

/** Cards added at the end, the board kept within its cap. */
export function addToBoard(items: readonly BoardItem[], added: readonly BoardItem[]): BoardItem[] {
	return [...items, ...added].slice(0, MAX_BATCH_TOKENS);
}

export function removeFromBoard(items: readonly BoardItem[], index: number): BoardItem[] {
	return items.filter((_, i) => i !== index);
}

/** A card swapped with its neighbour; unchanged at either end. */
export function moveOnBoard(items: readonly BoardItem[], index: number, delta: -1 | 1): BoardItem[] {
	const to = index + delta;
	if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
	const next = [...items];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}

/** A card paged to another of its `count` shapes, wrapping at either end. */
export function pageOnBoard(items: readonly BoardItem[], index: number, delta: number, count: number): BoardItem[] {
	if (count <= 0) return [...items];
	return items.map((item, i) => (i === index ? { ...item, shape: (((item.shape + delta) % count) + count) % count } : item));
}
