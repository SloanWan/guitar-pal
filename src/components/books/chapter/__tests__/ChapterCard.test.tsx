import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Chapter, ChapterParse } from "@/lib/books/types";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const api = vi.hoisted(() => ({
	getChapterParse: vi.fn(),
	parseChapter: vi.fn(),
	setExerciseStatus: vi.fn(),
	cropUrl: vi.fn(),
}));
vi.mock("@/lib/books/api", () => api);

import ChapterCard from "@/components/books/chapter/ChapterCard";
import type { OpenDraft } from "@/components/books/panel/DraftPanel";
import type { SourceView } from "@/components/books/panel/SourcePanel";

/**
 * The chapter card with the service mocked: the idle offer and its estimate,
 * the running parse, and a finished one — warnings on top, then its drafts or
 * its notes — whose draft is handed to the page's panel, validated and typed,
 * with the callback that marks its row used.
 */

const CHAPTER: Chapter = {
	id: "c1",
	index: 0,
	title: "C major, A minor",
	page_start: 204,
	page_end: 207,
	exercise_hint_count: 9,
	parsed_at: null,
	parse_status: "idle",
	parse_error: null,
	parse_cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
	parse_warnings: [],
};

const PATTERN = {
	id: "p1",
	name: "⑥弦:E–F–G",
	bpm: 100,
	timeSignature: [4, 4],
	measures: [
		{
			id: "m1",
			slots: [
				{
					id: "s1",
					duration: "quarter",
					strings: [
						{ fret: null, muted: false },
						{ fret: null, muted: false },
						{ fret: null, muted: false },
						{ fret: null, muted: false },
						{ fret: null, muted: false },
						{ fret: 0, muted: false },
					],
				},
			],
		},
	],
};

const READY: ChapterParse = {
	chapter: {
		...CHAPTER,
		parsed_at: "2026-09-19T10:00:00Z",
		parse_status: "ready",
		parse_cost: { input_tokens: 16350, output_tokens: 8436, usd: 0.2728 },
		parse_warnings: [{ code: "DRAFT_DROPPED", path: "page 207", message: "p207: one draft dropped" }],
	},
	notes: [{ id: "n1", title: "左手按弦", body: "食指按 1 品。", pages: [204], draft_ids: [] }],
	exercises: [
		{
			id: "e1",
			page: 206,
			kind: "tab",
			source: "literal",
			draft: PATTERN,
			warnings: [{ code: "TAB_JIANPU_OCTAVE", path: "measures", message: "3 note(s) an octave out" }],
			crop_path: "u/b/crops/c1/p0206-2.png",
			status: "proposed",
		},
	],
};

let container: HTMLDivElement;
let root: Root | null = null;
const onOpenDraft = vi.fn<(draft: OpenDraft) => void>();
const onLocate = vi.fn<(source: SourceView) => void>();
const onReadTextTab = vi.fn<(page: number) => void>();

function render(chapter: Chapter, onChapter = vi.fn(), openExerciseId: string | null = null) {
	container = document.createElement("div");
	document.body.appendChild(container);
	act(() => {
		root = createRoot(container);
		root.render(
			<ChapterCard
				bookId="b1"
				chapter={chapter}
				onChapter={onChapter}
				openExerciseId={openExerciseId}
				onOpenDraft={onOpenDraft}
				onLocate={onLocate}
				onReadTextTab={onReadTextTab}
			/>,
		);
	});
	return onChapter;
}

function showNotes() {
	const tab = Array.from(container.querySelectorAll('[role="radio"]')).find((b) => b.textContent?.startsWith("Notes"));
	if (!(tab instanceof HTMLButtonElement)) throw new Error("no Notes segment");
	act(() => tab.click());
}

async function settle() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

function button(label: string): HTMLButtonElement {
	const found = Array.from(container.querySelectorAll("button")).find((b) =>
		b.textContent?.includes(label),
	);
	if (!found) throw new Error(`no button "${label}" in: ${container.textContent}`);
	return found;
}

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	onOpenDraft.mockReset();
	onLocate.mockReset();
	onReadTextTab.mockReset();
	api.getChapterParse.mockReset();
	api.parseChapter.mockReset();
	api.setExerciseStatus.mockReset();
	api.cropUrl.mockReset().mockResolvedValue("https://signed/crop.png");
	sessionStorage.clear();
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
});

describe("ChapterCard", () => {
	it("offers the parse with the page count and a cost estimate", async () => {
		api.getChapterParse.mockResolvedValue({ chapter: CHAPTER, notes: [], exercises: [] });
		render(CHAPTER);
		await settle();
		expect(container.textContent).toContain("4 pages · est. $0.05–1.00");
		expect(button("Parse this chapter").disabled).toBe(false);
	});

	it("offers the parse from the row alone, without a round trip to the service", async () => {
		render(CHAPTER);
		expect(container.textContent).not.toContain("Loading");
		expect(button("Parse this chapter").disabled).toBe(false);
		await settle();
		expect(api.getChapterParse).not.toHaveBeenCalled();
	});

	it("still loads a parsed chapter, whose notes and drafts the row lacks", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		render(READY.chapter);
		expect(container.textContent).toContain("Loading");
		await settle();
		expect(api.getChapterParse).toHaveBeenCalledWith("b1", "c1");
		expect(container.textContent).toContain("⑥弦:E–F–G");
	});

	it("refuses a chapter over the cap and says to split it", async () => {
		const long = { ...CHAPTER, page_end: 260 };
		api.getChapterParse.mockResolvedValue({ chapter: long, notes: [], exercises: [] });
		render(long);
		await settle();
		expect(button("Parse this chapter").disabled).toBe(true);
		expect(container.textContent).toContain("57 pages — split it");
	});

	it("starts the parse and tells the row it is running", async () => {
		api.getChapterParse.mockResolvedValue({ chapter: CHAPTER, notes: [], exercises: [] });
		const parsing = { ...CHAPTER, parse_status: "parsing" as const };
		api.parseChapter.mockResolvedValue(parsing);
		const onChapter = render(CHAPTER);
		await settle();
		api.getChapterParse.mockResolvedValue({ chapter: parsing, notes: [], exercises: [] });
		await act(async () => {
			button("Parse this chapter").click();
		});
		await settle();
		expect(api.parseChapter).toHaveBeenCalledWith("b1", "c1");
		expect(container.textContent).toContain("Parsing 4 pages");
		expect(onChapter).toHaveBeenLastCalledWith(expect.objectContaining({ parse_status: "parsing" }));
	});

	it("shows the cost and warnings, then the drafts, and the notes one switch away", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		render(READY.chapter);
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("$0.27");
		expect(text).toContain("p207: one draft dropped");
		expect(text).toContain("⑥弦:E–F–G");
		expect(text).toContain("p.206 · Tab · literal · 1 bar · ♩=100");
		expect(text).toContain("Re-parse · est. $0.05–1.00");
		expect(text).not.toContain("左手按弦");
		await settle();
		expect(container.querySelector(".bk-crop img")?.getAttribute("src")).toBe("https://signed/crop.png");
		showNotes();
		expect(container.textContent).toContain("左手按弦");
		expect(container.textContent).not.toContain("⑥弦:E–F–G");
	});

	it("hands a tab draft to the page's panel, typed, and marks the row used when told", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		render(READY.chapter);
		await settle();
		await act(async () => {
			button("Open").click();
		});
		expect(onOpenDraft).toHaveBeenCalledTimes(1);
		const draft = onOpenDraft.mock.calls[0][0];
		expect(draft.chapterId).toBe("c1");
		expect(draft.exercise.id).toBe("e1");
		expect(draft.pattern.name).toBe("⑥弦:E–F–G");
		expect(draft.pattern.measures[0].slots[0].strings[5].fret).toBe(0);
		// Playing is not using: the row stays as it was until the panel says so.
		expect(container.textContent).not.toContain("Used");
		expect(api.setExerciseStatus).not.toHaveBeenCalled();
		act(() => draft.onTaken());
		expect(container.textContent).toContain("Used");
		expect(container.textContent).toContain("1 used");
	});

	it("marks the draft open in the panel", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		render(READY.chapter, vi.fn(), "e1");
		await settle();
		expect(container.querySelector('li[aria-current="true"]')?.textContent).toContain("⑥弦:E–F–G");
	});

	it("refuses a draft the validator cannot read", async () => {
		api.getChapterParse.mockResolvedValue({
			...READY,
			exercises: [{ ...READY.exercises[0], draft: { name: "broken", measures: "no" } }],
		});
		render(READY.chapter);
		await settle();
		await act(async () => {
			button("Open").click();
		});
		expect(onOpenDraft).not.toHaveBeenCalled();
	});

	it("locates a draft's page, and a note's pages when the reader gave any", async () => {
		api.getChapterParse.mockResolvedValue({
			...READY,
			notes: [
				{ ...READY.notes[0], pages: [204, 205] },
				{ ...READY.notes[0], id: "n2", title: "No pages", pages: [] },
			],
		});
		render(READY.chapter);
		await settle();
		act(() => button("p.206").click());
		expect(onLocate).toHaveBeenLastCalledWith({ chapterId: "c1", page: 206, pages: [206], title: "⑥弦:E–F–G" });
		// The page key sits over the row: locating does not open the draft.
		expect(onOpenDraft).not.toHaveBeenCalled();
		showNotes();
		act(() => button("p.204, 205").click());
		expect(onLocate).toHaveBeenLastCalledWith({ chapterId: "c1", page: 204, pages: [204, 205], title: "左手按弦" });
		// A note without pages has nothing to point at.
		expect(Array.from(container.querySelectorAll("button")).filter((b) => /^p\./.test(b.textContent ?? ""))).toHaveLength(1);
	});

	it("offers a page whose tab was in the text layer to read by ear (#228)", async () => {
		api.getChapterParse.mockResolvedValue({
			...READY,
			chapter: {
				...READY.chapter,
				parse_warnings: [
					{ code: "TEXT_TAB_SKIPPED", path: "page 205", message: "p205: the tab is in the text layer" },
					{ code: "PAGE_SKIPPED", path: "page 207", message: "p207: no renderer" },
				],
			},
		});
		render(READY.chapter);
		await settle();
		expect(container.textContent).toContain("p205: the tab is in the text layer");
		// Only the text-tab warning has a way to act on it.
		expect(Array.from(container.querySelectorAll("button")).filter((b) => b.textContent?.includes("Read by ear"))).toHaveLength(1);
		act(() => button("Read by ear").click());
		expect(onReadTextTab).toHaveBeenCalledWith(205);
	});

	it("counts every draft's warnings on its row, the messages in its title", async () => {
		const two = [
			{ code: "A", path: "measures[0]", message: "first thing" },
			{ code: "B", path: "measures[1]", message: "second thing" },
		];
		api.getChapterParse.mockResolvedValue({
			...READY,
			exercises: [READY.exercises[0], { ...READY.exercises[0], id: "e2", warnings: two }],
		});
		render(READY.chapter);
		await settle();
		const counts = Array.from(container.querySelectorAll('li .bk-st[data-tone="warn"]'));
		expect(counts.map((c) => c.getAttribute("aria-label"))).toEqual(["1 warning", "2 warnings"]);
		expect(counts[0].getAttribute("title")).toBe("3 note(s) an octave out");
		expect(counts[1].getAttribute("title")).toBe("first thing\nsecond thing");
	});
});
