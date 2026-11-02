import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	compareItems,
	isTabGoldCrop,
	isTabGoldSlug,
	type TabGoldItem,
	type TabGoldRecord,
	type TabGoldReview,
	type TabGoldSet,
} from "@/lib/tabGold";

/**
 * The gold set's files, for the `/api/dev/tab-gold` routes only (Node, never a
 * client component). The folder is the book service's gitignored materials,
 * or `TAB_GOLD_DIR` when the materials live in another checkout.
 *
 * Writing to the server's disk only makes sense on a developer's machine, so
 * the routes answer only under `next dev` with the dev routes on.
 */
export function tabGoldEnabled(): boolean {
	return process.env.NEXT_PUBLIC_ENABLE_DEV_ROUTES === "1" && process.env.NODE_ENV === "development";
}

export function tabGoldRoot(): string {
	return process.env.TAB_GOLD_DIR ?? path.join(process.cwd(), "book-service", "materials", "tab-gold");
}

function setDir(set: string): string {
	if (!isTabGoldSlug(set)) throw new Error(`Bad set name: ${set}`);
	return path.join(tabGoldRoot(), set);
}

function recordPath(set: string, id: string): string {
	if (!isTabGoldSlug(id)) throw new Error(`Bad exercise id: ${id}`);
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

/** Every set with its exercises in page order; empty when the folder is not there. */
export async function listSets(): Promise<TabGoldSet[]> {
	let names: string[];
	try {
		names = (await readdir(tabGoldRoot(), { withFileTypes: true }))
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
			const items: TabGoldItem[] = [];
			for (const file of files) {
				const record = await readJson<TabGoldRecord>(path.join(dir, file));
				if (record) items.push({ id: record.id, name: record.name, page: record.page, status: record.status });
			}
			return { name, title: meta?.title ?? name, items: items.sort(compareItems) };
		}),
	);
}

export async function readRecord(set: string, id: string): Promise<TabGoldRecord | null> {
	return readJson<TabGoldRecord>(recordPath(set, id));
}

/** The review written into the record, through a temp file so a reader never sees half of it. */
export async function writeReview(set: string, id: string, review: TabGoldReview): Promise<TabGoldRecord | null> {
	const file = recordPath(set, id);
	const record = await readJson<TabGoldRecord>(file);
	if (!record) return null;
	const next: TabGoldRecord = {
		...record,
		status: review.status,
		gold: review.gold,
		jianpu: review.jianpu,
		note: review.note,
		reviewedAt: review.status === "unchecked" ? null : new Date().toISOString(),
	};
	await mkdir(path.dirname(file), { recursive: true });
	const temp = `${file}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	await rename(temp, file);
	return next;
}

export async function readCrop(set: string, file: string): Promise<Buffer | null> {
	if (!isTabGoldCrop(file)) throw new Error(`Bad crop name: ${file}`);
	try {
		return await readFile(path.join(setDir(set), "crops", file));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
