import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { shownKind, type PageGoldItem, type PageGoldRecord, type PageGoldReview, type PageGoldSet } from "@/lib/pageGold";
import { compareItems, isTabGoldCrop, isTabGoldSlug } from "@/lib/tabGold";

/**
 * The page gold set's files, for the `/api/dev/page-gold` routes only (Node,
 * never a client component): the book service's gitignored materials, or
 * `PAGE_GOLD_DIR`. The routes answer only where the tab gold routes do
 * (`tabGoldEnabled`: `next dev` with the dev routes on).
 */
export function pageGoldRoot(): string {
	return process.env.PAGE_GOLD_DIR ?? path.join(process.cwd(), "book-service", "materials", "page-gold");
}

function setDir(set: string): string {
	if (!isTabGoldSlug(set)) throw new Error(`Bad set name: ${set}`);
	return path.join(pageGoldRoot(), set);
}

function recordPath(set: string, id: string): string {
	if (!isTabGoldSlug(id)) throw new Error(`Bad page id: ${id}`);
	return path.join(setDir(set), `${id}.json`);
}

async function readJson<T>(file: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(file, "utf8")) as T;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

/** Every book with its pages in order; empty when the folder is not there. */
export async function listPageSets(): Promise<PageGoldSet[]> {
	let names: string[];
	try {
		names = (await readdir(pageGoldRoot(), { withFileTypes: true }))
			.filter((entry) => entry.isDirectory() && isTabGoldSlug(entry.name))
			.map((entry) => entry.name)
			.sort();
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	return Promise.all(
		names.map(async (name) => {
			const dir = setDir(name);
			const meta = await readJson<{ title?: string }>(path.join(dir, "set.json"));
			const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f !== "set.json");
			const items: PageGoldItem[] = [];
			for (const file of files) {
				const record = await readJson<PageGoldRecord>(path.join(dir, file));
				if (record) {
					items.push({ id: record.id, name: `p.${record.page}`, page: record.page, status: record.status, kind: shownKind(record) });
				}
			}
			return { name, title: meta?.title ?? name, items: items.sort(compareItems) };
		}),
	);
}

export async function readPageRecord(set: string, id: string): Promise<PageGoldRecord | null> {
	return readJson<PageGoldRecord>(recordPath(set, id));
}

/**
 * The review written into the record, through a temp file so a reader never
 * sees half of it. Undoing or setting a page aside keeps the answer that was
 * there, so a slip costs nothing.
 */
export async function writePageReview(set: string, id: string, review: PageGoldReview): Promise<PageGoldRecord | null> {
	const file = recordPath(set, id);
	const record = await readJson<PageGoldRecord>(file);
	if (!record) return null;
	const answered = review.status === "confirmed" || review.status === "corrected";
	const next: PageGoldRecord = {
		...record,
		status: review.status,
		...(answered ? { kind: review.kind, notation: review.notation, exercises: review.exercises } : {}),
		note: review.note,
		reviewedAt: review.status === "unchecked" ? null : new Date().toISOString(),
	};
	const temp = `${file}.${process.pid}.tmp`;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	await rename(temp, file);
	return next;
}

export async function readPageImage(set: string, file: string): Promise<Buffer | null> {
	if (!isTabGoldCrop(file)) throw new Error(`Bad image name: ${file}`);
	try {
		return await readFile(path.join(setDir(set), "pages", file));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
