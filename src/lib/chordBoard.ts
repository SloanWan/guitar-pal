import { MAX_BATCH_TOKENS } from "@/lib/chordBatchResolve";

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

/** Where the board is kept between visits. */
export const BOARD_STORAGE_KEY = "chordsBoard";

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
