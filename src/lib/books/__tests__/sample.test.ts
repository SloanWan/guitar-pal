import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validateFingerpickPattern } from "@/lib/tabImport";
import { SAMPLE_BOOK_ID, sampleBook, sampleChapterParse } from "@/lib/books/sample";

vi.mock("@/lib/supabase", () => ({
	createClient: () => {
		throw new Error("the sample must not touch Supabase");
	},
}));
import { cropUrl, getBook, getChapterParse, renameBook, setExerciseStatus } from "@/lib/books/api";

/**
 * The sample book (#241) is a fixture built by scripts/build-book-sample.mjs
 * from a paid parse: these keep it honest — every draft is one the editor
 * will accept, every crop is really shipped — and keep the api answering
 * for it without the network.
 */

describe("the sample fixture", () => {
	it("is one ready chapter whose card the fixture holds", async () => {
		const book = await sampleBook();
		expect(book.id).toBe(SAMPLE_BOOK_ID);
		expect(book.status).toBe("ready");
		expect(book.chapters.length).toBeGreaterThan(0);
		for (const chapter of book.chapters) {
			const parse = await sampleChapterParse(chapter.id);
			expect(parse?.chapter.parse_status).toBe("ready");
			expect(parse?.notes.length).toBeGreaterThan(0);
			expect(parse?.exercises.length).toBeGreaterThan(0);
		}
		expect(await sampleChapterParse("nope")).toBeNull();
	});

	it("ships drafts the editor accepts, crops that exist, and nothing already taken", async () => {
		const book = await sampleBook();
		for (const chapter of book.chapters) {
			const parse = await sampleChapterParse(chapter.id);
			for (const exercise of parse?.exercises ?? []) {
				expect(exercise.status).toBe("proposed");
				const { pattern, errors } = validateFingerpickPattern(exercise.draft);
				expect(errors, `${exercise.id} (p.${exercise.page})`).toEqual([]);
				expect(pattern?.measures.length).toBeGreaterThan(0);
				if (exercise.crop_path) {
					expect(exercise.crop_path.startsWith("/samples/")).toBe(true);
					expect(existsSync(join(process.cwd(), "public", exercise.crop_path))).toBe(true);
				}
			}
		}
	});
});

describe("the api on the sample", () => {
	beforeEach(() => {
		vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network for the sample"))));
	});

	it("reads it from the fixture and marks a draft taken locally", async () => {
		const book = await getBook(SAMPLE_BOOK_ID);
		const parse = await getChapterParse(SAMPLE_BOOK_ID, book.chapters[0].id);
		const first = parse.exercises[0];
		const taken = await setExerciseStatus(SAMPLE_BOOK_ID, first.id, "taken");
		expect(taken).toEqual({ ...first, status: "taken" });
		// The fixture itself is untouched.
		expect((await getChapterParse(SAMPLE_BOOK_ID, book.chapters[0].id)).exercises[0].status).toBe("proposed");
		await expect(setExerciseStatus(SAMPLE_BOOK_ID, "nope", "taken")).rejects.toMatchObject({ status: 404 });
		await expect(getChapterParse(SAMPLE_BOOK_ID, "nope")).rejects.toMatchObject({ status: 404 });
	});

	it("refuses to change it and hands public crops back as they are", async () => {
		await expect(renameBook(SAMPLE_BOOK_ID, "x")).rejects.toMatchObject({ status: 403 });
		expect(await cropUrl("/samples/sanyuetong/p0001-r1-1.png")).toBe("/samples/sanyuetong/p0001-r1-1.png");
	});
});
