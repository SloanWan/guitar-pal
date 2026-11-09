// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ErrorsChart from "../ErrorsChart";
import type { ErrorBucket } from "@/lib/telemetry/summary";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const buckets: ErrorBucket[] = [
	{ key: "2026-11-07", counts: { page: 0, audio: 0, supabase: 0, server: 0 } },
	{ key: "2026-11-08", counts: { page: 2, audio: 1, supabase: 3, server: 0 } },
];

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => {
	act(() => root?.unmount());
	host.remove();
});

function render() {
	host = document.createElement("div");
	document.body.appendChild(host);
	act(() => {
		root = createRoot(host);
		root.render(<ErrorsChart buckets={buckets} bucket="day" />);
	});
}

describe("ErrorsChart", () => {
	it("stacks one segment per group with errors, the top one rounded", () => {
		render();
		const columns = [...host.querySelectorAll("svg > g")].filter((g) => g.querySelector(".mon-hit"));
		expect(columns).toHaveLength(2);
		const [empty, full] = columns;
		expect(empty.querySelectorAll("rect:not(.mon-hit), path")).toHaveLength(0);
		// page, audio, supabase: two flat segments under one rounded top.
		expect(full.querySelectorAll("rect:not(.mon-hit)")).toHaveLength(2);
		expect(full.querySelectorAll("path")).toHaveLength(1);
	});

	it("names each column for a keyboard and shows every group's count on focus", () => {
		render();
		const hit = host.querySelector<SVGRectElement>('.mon-hit[aria-label="11-08: 6 errors"]')!;
		act(() => hit.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
		const tip = host.querySelector(".mon-tip")!.textContent;
		expect(tip).toContain("6 total");
		expect(tip).toContain("Supabase3");
		act(() => hit.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
		expect(host.querySelector(".mon-tip")).toBeNull();
	});

	it("carries the same numbers as a table, for whoever cannot tell the colours apart", () => {
		render();
		const rows = [...host.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
		expect(rows).toEqual([
			["2026-11-07", "0", "0", "0", "0", "0"],
			["2026-11-08", "2", "1", "3", "0", "6"],
		]);
	});
});
