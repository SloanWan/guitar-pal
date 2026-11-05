/**
 * The crops the tab reader is given, checked by hand before anything is read
 * (#424). The segmenter boxes each exercise on a page; a box that loses a
 * heading or the marks under the last staff makes every model's reading of it
 * wrong in the same way, so the boxes are reviewed on `/dev/crop-gold` and the
 * crops re-rendered from what was saved.
 *
 * A batch is a folder under `book-service/materials/tab-gold-work/<batch>/`
 * (gitignored: the pages are book pages):
 *
 *     segments.json         the segmenter's boxes per page, and the page's gold count
 *     pages/<id>.png        the page at the reading resolution
 *     review/<id>.json      the review: the boxes as they should be
 *
 * Boxes are fractions of the page, (x0, y0, x1, y1) from the top-left — the
 * shape the parse's own regions take — and are the crop as rendered: the
 * parse's padding is already in a model box.
 */

export type Box = readonly [number, number, number, number];

/** A page's review: `unchecked` until saved once. */
export const CROP_GOLD_STATUSES = ["unchecked", "reviewed"] as const;
export type CropGoldStatus = (typeof CROP_GOLD_STATUSES)[number];

export interface CropBox {
	/** Unique on the page: the segmenter's id for its boxes, `add-N` for the reviewer's. */
	id: string;
	/** The segmenter's box this one started as; null for a box the reviewer drew. */
	origin: string | null;
	box: Box;
	heading: string;
	/** False: the segmenter boxed something that is not an exercise. Kept so the miss is counted. */
	exercise: boolean;
}

/** One page of `segments.json`, as the segment script writes it. */
export interface SegmentedPage {
	set: string;
	page: number;
	gold_exercises: number | null;
	gold_note?: string;
	exercises: { id: string; heading: string; staves: number; crop_box: number[] }[];
}

export interface CropGoldRecord {
	version: 1;
	/** `<set>-pNNN`, also the page image's and the review file's name. */
	id: string;
	batch: string;
	set: string;
	page: number;
	/** Exercises on the page per the page-gold review. */
	goldExercises: number | null;
	goldNote: string;
	/** The segmenter's boxes, unchanged, for Reset and for the change marks. */
	model: CropBox[];
	boxes: CropBox[];
	status: CropGoldStatus;
	note: string;
	reviewedAt: string | null;
}

/** What the review page sends back. */
export interface CropGoldReview {
	status: CropGoldStatus;
	boxes: CropBox[];
	note: string;
}

export interface CropGoldItem {
	id: string;
	set: string;
	page: number;
	status: CropGoldStatus;
	goldExercises: number | null;
	/** Boxes that are exercises, as saved (the segmenter's until then). */
	exercises: number;
	changes: ChangeCounts;
}

export interface CropGoldBatch {
	name: string;
	items: CropGoldItem[];
}

/** A batch, page or box name: nothing a path could climb out of. */
export function isCropGoldSlug(value: string): boolean {
	return /^[\w.-]{1,120}$/.test(value) && !value.includes("..");
}

export const pageId = (set: string, page: number): string => `${set}-p${String(page).padStart(3, "0")}`;

// --- box geometry -----------------------------------------------------------------

/** The smallest box a drag can leave: a sliver is a slip, not a crop. */
export const MIN_SIZE = 0.01;
/** Edges within this of the segmenter's count as unchanged (rounding, a stray click). */
export const SAME_EDGE = 0.002;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Ordered corners, inside the page, never thinner than MIN_SIZE. */
export function normalizeBox([a, b, c, d]: readonly number[]): Box {
	let x0 = clamp01(Math.min(a, c));
	let x1 = clamp01(Math.max(a, c));
	let y0 = clamp01(Math.min(b, d));
	let y1 = clamp01(Math.max(b, d));
	if (x1 - x0 < MIN_SIZE) [x0, x1] = x0 + MIN_SIZE <= 1 ? [x0, x0 + MIN_SIZE] : [1 - MIN_SIZE, 1];
	if (y1 - y0 < MIN_SIZE) [y0, y1] = y0 + MIN_SIZE <= 1 ? [y0, y0 + MIN_SIZE] : [1 - MIN_SIZE, 1];
	return [x0, y0, x1, y1];
}

/** The box moved by (dx, dy), its size kept, stopped at the page's edges. */
export function moveBox(box: Box, dx: number, dy: number): Box {
	const [x0, y0, x1, y1] = box;
	const sx = Math.min(Math.max(dx, -x0), 1 - x1);
	const sy = Math.min(Math.max(dy, -y0), 1 - y1);
	return [x0 + sx, y0 + sy, x1 + sx, y1 + sy];
}

/** Which edges a handle drags: n s e w and the corners between them. */
export const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
export type Handle = (typeof HANDLES)[number];

/** The box with the handle's edges moved; an edge never crosses its opposite. */
export function resizeBox(box: Box, handle: Handle, dx: number, dy: number): Box {
	let [x0, y0, x1, y1] = box;
	if (handle.includes("w")) x0 = Math.min(clamp01(x0 + dx), x1 - MIN_SIZE);
	if (handle.includes("e")) x1 = Math.max(clamp01(x1 + dx), x0 + MIN_SIZE);
	if (handle.includes("n")) y0 = Math.min(clamp01(y0 + dy), y1 - MIN_SIZE);
	if (handle.includes("s")) y1 = Math.max(clamp01(y1 + dy), y0 + MIN_SIZE);
	return [x0, y0, x1, y1];
}

/** A box drawn from where the pointer went down to where it is now. */
export const boxFromDrag = (from: readonly [number, number], to: readonly [number, number]): Box =>
	normalizeBox([from[0], from[1], to[0], to[1]]);

/** How far each edge moved from the segmenter's box, in fractions of the page (+ = outward). */
export function edgeShift(model: Box, box: Box): { top: number; bottom: number; left: number; right: number } {
	return { top: model[1] - box[1], bottom: box[3] - model[3], left: model[0] - box[0], right: box[2] - model[2] };
}

// --- what changed ------------------------------------------------------------------

export type BoxChange = "kept" | "adjusted" | "added" | "removed";

/** What the review did to a box, against the segmenter's. */
export function boxChange(box: CropBox, model: readonly CropBox[]): BoxChange {
	if (!box.exercise) return "removed";
	const from = box.origin === null ? undefined : model.find((m) => m.id === box.origin);
	if (!from) return "added";
	return box.box.every((v, i) => Math.abs(v - from.box[i]) <= SAME_EDGE) ? "kept" : "adjusted";
}

export type ChangeCounts = Record<BoxChange, number>;

export function countChanges(boxes: readonly CropBox[], model: readonly CropBox[]): ChangeCounts {
	const counts: ChangeCounts = { kept: 0, adjusted: 0, added: 0, removed: 0 };
	for (const box of boxes) counts[boxChange(box, model)] += 1;
	return counts;
}

/** The segmenter's boxes as the review starts them. */
export function modelBoxes(page: SegmentedPage): CropBox[] {
	return page.exercises.map((e) => ({
		id: e.id,
		origin: e.id,
		box: normalizeBox(e.crop_box),
		heading: e.heading,
		exercise: true,
	}));
}

/** The next free id for a box the reviewer draws. */
export function nextAddedId(boxes: readonly CropBox[]): string {
	const used = new Set(boxes.map((b) => b.id));
	let n = 1;
	while (used.has(`add-${n}`)) n += 1;
	return `add-${n}`;
}

/** Reading order: top to bottom, then left to right for boxes side by side. */
export function inPageOrder(boxes: readonly CropBox[]): CropBox[] {
	return [...boxes].sort((a, b) => {
		const overlap = Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]);
		const shorter = Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1]);
		// Boxes sharing most of a row read left to right.
		if (overlap > shorter / 2) return a.box[0] - b.box[0];
		return a.box[1] - b.box[1];
	});
}

// --- the review as sent ------------------------------------------------------------

const MAX_NOTE = 2000;
const MAX_HEADING = 200;
const MAX_BOXES = 60;

function readBox(value: unknown): CropBox | string {
	if (typeof value !== "object" || value === null) return "A box is not an object.";
	const { id, origin, box, heading, exercise } = value as Record<string, unknown>;
	if (typeof id !== "string" || !isCropGoldSlug(id)) return `Bad box id: ${String(id)}`;
	if (origin !== null && (typeof origin !== "string" || !isCropGoldSlug(origin))) return `Bad origin for ${id}.`;
	if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => typeof v === "number" && Number.isFinite(v))) {
		return `Box ${id} is not four numbers.`;
	}
	if (typeof heading !== "string" || heading.length > MAX_HEADING) return `Box ${id}'s heading is not short text.`;
	if (typeof exercise !== "boolean") return `Box ${id}: exercise must be true or false.`;
	return { id, origin, box: normalizeBox(box as number[]), heading, exercise };
}

/** A review as the page sent it, checked: known status, sound boxes, unique ids. */
export function readCropReview(body: unknown): { review: CropGoldReview } | { error: string } {
	if (typeof body !== "object" || body === null) return { error: "The review is not an object." };
	const { status, boxes, note } = body as Record<string, unknown>;
	if (typeof status !== "string" || !(CROP_GOLD_STATUSES as readonly string[]).includes(status)) {
		return { error: `Unknown status: ${String(status)}` };
	}
	if (!Array.isArray(boxes) || boxes.length > MAX_BOXES) return { error: "boxes must be a list." };
	if (note !== undefined && (typeof note !== "string" || note.length > MAX_NOTE)) {
		return { error: `note must be text under ${MAX_NOTE} characters.` };
	}
	const read: CropBox[] = [];
	for (const value of boxes) {
		const box = readBox(value);
		if (typeof box === "string") return { error: box };
		if (read.some((b) => b.id === box.id)) return { error: `Two boxes are called ${box.id}.` };
		read.push(box);
	}
	return { review: { status: status as CropGoldStatus, boxes: read, note: typeof note === "string" ? note : "" } };
}

// --- moving through a batch --------------------------------------------------------

/** The next page still unchecked after this one, wrapping round; null when none is left. */
export function nextUncheckedPage(items: readonly Pick<CropGoldItem, "id" | "status">[], currentId: string): string | null {
	const at = items.findIndex((item) => item.id === currentId);
	for (let step = 1; step <= items.length; step++) {
		const item = items[(at + step + items.length) % items.length];
		if (item.status === "unchecked" && item.id !== currentId) return item.id;
	}
	return null;
}

export function pageNeighbours(
	items: readonly Pick<CropGoldItem, "id">[],
	currentId: string,
): { prev: string | null; next: string | null } {
	const at = items.findIndex((item) => item.id === currentId);
	if (at < 0) return { prev: null, next: null };
	return { prev: items[at - 1]?.id ?? null, next: items[at + 1]?.id ?? null };
}
