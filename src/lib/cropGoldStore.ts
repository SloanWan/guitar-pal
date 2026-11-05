import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	countChanges,
	isCropGoldSlug,
	modelBoxes,
	pageId,
	type CropGoldBatch,
	type CropGoldItem,
	type CropGoldRecord,
	type CropGoldReview,
	type SegmentedPage,
} from "@/lib/cropGold";

/**
 * The crop review's files, for the `/api/dev/crop-gold` routes only (Node,
 * never a client component). Batches live in the book service's gitignored
 * materials, or under `CROP_GOLD_DIR` when the materials are in another
 * checkout. Like the tab gold, it answers only under `next dev` with the dev
 * routes on (`tabGoldEnabled`).
 */
export function cropGoldRoot(): string {
	return process.env.CROP_GOLD_DIR ?? path.join(process.cwd(), "book-service", "materials", "tab-gold-work");
}

function batchDir(batch: string): string {
	if (!isCropGoldSlug(batch)) throw new Error(`Bad batch name: ${batch}`);
	return path.join(cropGoldRoot(), batch);
}

async function readJson<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

type SavedReview = Pick<CropGoldRecord, "boxes" | "status" | "note" | "reviewedAt">;

async function segmentedPages(batch: string): Promise<SegmentedPage[]> {
	const segments = await readJson<{ pages?: SegmentedPage[] }>(path.join(batchDir(batch), "segments.json"));
	return segments?.pages ?? [];
}

function record(batch: string, page: SegmentedPage, saved: SavedReview | null): CropGoldRecord {
	const model = modelBoxes(page);
	return {
		version: 1,
		id: pageId(page.set, page.page),
		batch,
		set: page.set,
		page: page.page,
		goldExercises: page.gold_exercises,
		goldNote: page.gold_note ?? "",
		model,
		boxes: saved?.boxes ?? model,
		status: saved?.status ?? "unchecked",
		note: saved?.note ?? "",
		reviewedAt: saved?.reviewedAt ?? null,
	};
}

const reviewPath = (batch: string, id: string): string => path.join(batchDir(batch), "review", `${id}.json`);

/** Every batch with a `segments.json`, its pages in the order the segment script wrote them. */
export async function listBatches(): Promise<CropGoldBatch[]> {
	let names: string[];
	try {
		names = (await readdir(cropGoldRoot(), { withFileTypes: true }))
			.filter((entry) => entry.isDirectory() && isCropGoldSlug(entry.name))
			.map((entry) => entry.name)
			.sort();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const batches = await Promise.all(
		names.map(async (name) => {
			const items: CropGoldItem[] = [];
			for (const page of await segmentedPages(name)) {
				const r = record(name, page, await readJson<SavedReview>(reviewPath(name, pageId(page.set, page.page))));
				items.push({
					id: r.id,
					set: r.set,
					page: r.page,
					status: r.status,
					goldExercises: r.goldExercises,
					exercises: r.boxes.filter((b) => b.exercise).length,
					changes: countChanges(r.boxes, r.model),
				});
			}
			return { name, items };
		}),
	);
	return batches.filter((b) => b.items.length > 0);
}

export async function readPage(batch: string, id: string): Promise<CropGoldRecord | null> {
	if (!isCropGoldSlug(id)) throw new Error(`Bad page id: ${id}`);
	const page = (await segmentedPages(batch)).find((p) => pageId(p.set, p.page) === id);
	if (!page) return null;
	return record(batch, page, await readJson<SavedReview>(reviewPath(batch, id)));
}

/** The review written beside the batch, through a temp file so a reader never sees half of it. */
export async function writePageReview(
	batch: string,
	id: string,
	review: CropGoldReview,
): Promise<CropGoldRecord | null> {
	if (!(await readPage(batch, id))) return null;
	const saved: SavedReview = {
		boxes: review.boxes,
		status: review.status,
		note: review.note,
		reviewedAt: review.status === "unchecked" ? null : new Date().toISOString(),
	};
	const file = reviewPath(batch, id);
	await mkdir(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(saved, null, 2)}\n`, "utf8");
	await rename(temp, file);
	return readPage(batch, id);
}

/** A page image from the batch's `pages/`. */
export async function readPageImage(batch: string, id: string): Promise<Buffer | null> {
	if (!isCropGoldSlug(id)) throw new Error(`Bad page id: ${id}`);
	try {
		return await readFile(path.join(batchDir(batch), "pages", `${id}.png`));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
