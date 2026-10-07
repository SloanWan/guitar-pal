import { describe, it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ChapterList from "@/components/books/ChapterList";
import type { Chapter } from "@/lib/books/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const chapter: Chapter = {
	id: "c1",
	index: 0,
	title: "第三篇 实际操练",
	page_start: 1,
	page_end: 4,
	exercise_hint_count: 4,
	parsed_at: "2026-09-20T07:39:10.000Z",
	parse_status: "ready",
	parse_error: null,
	parse_cost: { input_tokens: 0, output_tokens: 0, usd: 0 },
	parse_warnings: [],
};

function render(ui: React.ReactElement) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => root.render(ui));
	return { host, unmount: () => act(() => root.unmount()) };
}

describe("ChapterList", () => {
	it("keeps the title whole and writes the meta twice: stacked for a phone, as columns wider (#261)", () => {
		const { host, unmount } = render(
			<ChapterList chapters={[chapter]} openId={null} onOpen={() => {}} renderCard={() => null} />,
		);
		const row = host.querySelector("button[aria-expanded]");
		expect(row).not.toBeNull();
		expect(row?.textContent).toContain("第三篇 实际操练");
		// The stacked meta line, shown below sm only, carries the same facts as the columns.
		const stacked = host.querySelector('[data-testid="chapter-row-meta-stacked"]');
		expect(stacked?.className).toContain("sm:hidden");
		expect(stacked?.textContent).toContain("Parsed");
		expect(stacked?.textContent).toContain("p1–4");
		expect(stacked?.textContent).toContain("4 hints");
		const columns = host.querySelector(".sm\\:contents");
		expect(columns?.textContent).toContain("p1–4");
		expect(columns?.textContent).toContain("4 hints");
		unmount();
		host.remove();
	});

	it("renders the open row's card and nothing for the others", () => {
		const other = { ...chapter, id: "c2", index: 1, title: "第四篇" };
		const { host, unmount } = render(
			<ChapterList
				chapters={[chapter, other]}
				openId="c2"
				onOpen={() => {}}
				renderCard={(c) => <div data-testid="card">{c.title}</div>}
			/>,
		);
		const cards = host.querySelectorAll('[data-testid="card"]');
		expect(cards).toHaveLength(1);
		expect(cards[0].textContent).toBe("第四篇");
		unmount();
		host.remove();
	});
});
