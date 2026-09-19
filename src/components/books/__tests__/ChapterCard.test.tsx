import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Chapter, ChapterParse } from "@/lib/books/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const api = vi.hoisted(() => ({
	getChapterParse: vi.fn(),
	parseChapter: vi.fn(),
	setExerciseStatus: vi.fn(),
	cropUrl: vi.fn(),
}));
vi.mock("@/lib/books/api", () => api);

import ChapterCard from "@/components/books/ChapterCard";
import { takeHandoff } from "@/lib/strumAssistant/handoff";

/**
 * The chapter card with the service mocked: the idle offer and its estimate,
 * the running parse, and a finished one whose draft opens in the fingerpick
 * editor through the handoff stash while its row is marked taken.
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
						{ fret: null, technique: null, tied: false, muted: false },
						{ fret: null, technique: null, tied: false, muted: false },
						{ fret: null, technique: null, tied: false, muted: false },
						{ fret: null, technique: null, tied: false, muted: false },
						{ fret: null, technique: null, tied: false, muted: false },
						{ fret: 0, technique: null, tied: false, muted: false },
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

function render(chapter: Chapter, onChapter = vi.fn()) {
	container = document.createElement("div");
	document.body.appendChild(container);
	act(() => {
		root = createRoot(container);
		root.render(<ChapterCard bookId="b1" chapter={chapter} onChapter={onChapter} />);
	});
	return onChapter;
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
	push.mockReset();
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

	it("shows notes, drafts, warnings and the cost once ready", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		render(READY.chapter);
		await settle();
		const text = container.textContent ?? "";
		expect(text).toContain("$0.27");
		expect(text).toContain("左手按弦");
		expect(text).toContain("p207: one draft dropped");
		expect(text).toContain("⑥弦:E–F–G");
		expect(text).toContain("p.206 · Tab · literal · 1 bar · ♩=100");
		expect(text).toContain("3 note(s) an octave out");
		expect(text).toContain("Re-parse · est. $0.05–1.00");
		await settle();
		expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed/crop.png");
	});

	it("opens a tab draft in fingerpick through the handoff and marks it taken", async () => {
		api.getChapterParse.mockResolvedValue(READY);
		api.setExerciseStatus.mockResolvedValue({ ...READY.exercises[0], status: "taken" });
		render(READY.chapter);
		await settle();
		await act(async () => {
			button("Open in fingerpick").click();
		});
		await settle();
		expect(api.setExerciseStatus).toHaveBeenCalledWith("b1", "e1", "taken");
		expect(container.textContent).toContain("Opened");
		expect(push).toHaveBeenCalledWith("/fingerpick");
		const handoff = takeHandoff("fingerpick");
		expect(handoff?.kind).toBe("fingerpick");
		if (handoff?.kind !== "fingerpick") throw new Error("expected a fingerpick handoff");
		expect(handoff.pattern.name).toBe("⑥弦:E–F–G");
		expect(handoff.pattern.measures[0].slots[0].strings[5].fret).toBe(0);
		expect(handoff.warnings.map((w) => w.code)).toEqual(["TAB_JIANPU_OCTAVE"]);
	});
});
