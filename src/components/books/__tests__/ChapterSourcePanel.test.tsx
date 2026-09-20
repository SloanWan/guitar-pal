import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BookDetail, Chapter } from "@/lib/books/types";

const api = vi.hoisted(() => ({ pageImageUrl: vi.fn(), bookFileUrl: vi.fn() }));
vi.mock("@/lib/books/api", () => api);

import ChapterSourcePanel from "@/components/books/ChapterSourcePanel";

/**
 * The source panel (#240): the page asked for, the chapter's range as the
 * bounds of ‹ ›, a note's pages as chips, and the PDF link at the page.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CHAPTER: Chapter = {
	id: "c1",
	index: 0,
	title: "C major",
	page_start: 204,
	page_end: 207,
	exercise_hint_count: 0,
	parsed_at: null,
	parse_status: "ready",
	parse_error: null,
	parse_cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
	parse_warnings: [],
};
const BOOK: BookDetail = {
	id: "b1",
	title: "三月通",
	page_count: 300,
	storage_path: "u1/b1.pdf",
	status: "ready",
	toc_source: "text",
	error: null,
	scanned_pages: 300,
	created_at: "2026-09-19T00:00:00Z",
	chapters: [CHAPTER],
};

let container: HTMLDivElement;
let root: Root | null = null;
const onClose = vi.fn();

function render(source = { chapterId: "c1", page: 206, pages: [206], title: "⑥弦:E–F–G" }) {
	container = document.createElement("div");
	document.body.appendChild(container);
	act(() => {
		root = createRoot(container);
		root.render(<ChapterSourcePanel book={BOOK} chapter={CHAPTER} source={source} onClose={onClose} />);
	});
}

async function settle() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

const button = (label: string) =>
	Array.from(container.querySelectorAll("button")).find(
		(b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
	);

beforeEach(() => {
	api.pageImageUrl.mockReset().mockImplementation(async (_book: string, page: number) => `https://signed/p${page}.png`);
	api.bookFileUrl.mockReset().mockResolvedValue("https://signed/book.pdf");
	onClose.mockReset();
});

afterEach(() => {
	act(() => root?.unmount());
	root = null;
	container?.remove();
});

describe("ChapterSourcePanel", () => {
	it("shows the page asked for, steps inside the chapter, and links the PDF at the page", async () => {
		render();
		expect(container.textContent).toContain("Rendering page 206");
		await settle();
		expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed/p206.png");
		expect(container.textContent).toContain("Source · p.206");
		expect(container.textContent).toContain("204–207");
		expect(container.querySelector("a")?.getAttribute("href")).toBe("https://signed/book.pdf#page=206");

		act(() => button("Next page")?.click());
		await settle();
		expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed/p207.png");
		expect(button("Next page")?.disabled).toBe(true);
		expect(container.querySelector("a")?.getAttribute("href")).toBe("https://signed/book.pdf#page=207");
		// Back to 206: no second request — the first answer is kept.
		act(() => button("Previous page")?.click());
		await settle();
		expect(api.pageImageUrl.mock.calls.filter(([, p]) => p === 206)).toHaveLength(1);
	});

	it("offers a note's pages as chips and says when a page could not be shown", async () => {
		api.pageImageUrl.mockImplementation(async (_book: string, page: number) => (page === 205 ? null : `https://signed/p${page}.png`));
		render({ chapterId: "c1", page: 204, pages: [204, 205], title: "左手按弦" });
		await settle();
		expect(container.textContent).toContain("左手按弦");
		expect(button("p.204")?.getAttribute("aria-pressed")).toBe("true");
		act(() => button("p.205")?.click());
		await settle();
		expect(container.textContent).toContain("Page 205 could not be shown");
		expect(button("p.205")?.getAttribute("aria-pressed")).toBe("true");
		act(() => button("Close")?.click());
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
