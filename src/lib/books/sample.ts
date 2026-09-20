import type { BookDetail, ChapterParse } from "@/lib/books/types";

/**
 * The sample book (#241): one parsed chapter of 《吉他自学三月通》, shipped as
 * a static fixture so anyone can see what the import makes of a chapter
 * without a service, an account or a paid parse. `api.ts` answers for it
 * from here; the pages treat it as read-only.
 *
 * The fixture is a few hundred KB of frets, loaded only when the sample is
 * opened — never bundled into the ordinary book page.
 */

export const SAMPLE_BOOK_ID = "sample";

export const isSampleBook = (id: string): boolean => id === SAMPLE_BOOK_ID;

interface SampleFixture {
	book: BookDetail;
	parses: Record<string, ChapterParse>;
}

let fixture: Promise<SampleFixture> | null = null;
function load(): Promise<SampleFixture> {
	fixture ??= import("@/lib/books/sample/sanyuetong.json").then((m) => m.default as SampleFixture);
	return fixture;
}

export async function sampleBook(): Promise<BookDetail> {
	return (await load()).book;
}

/** The chapter's card, or null for an id the sample does not have. */
export async function sampleChapterParse(chapterId: string): Promise<ChapterParse | null> {
	return (await load()).parses[chapterId] ?? null;
}
