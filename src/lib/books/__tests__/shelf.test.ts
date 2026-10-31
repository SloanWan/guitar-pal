import { describe, it, expect } from "vitest";
import { coverStatus, hasCoverPage, scanProgress, shelfMeta } from "@/lib/books/shelf";

describe("coverStatus", () => {
	it("names every book status with a tone", () => {
		expect(coverStatus({ status: "ready" })).toEqual({ label: "Ready", tone: "ok" });
		expect(coverStatus({ status: "scanning" })).toEqual({ label: "Scanning", tone: "run" });
		expect(coverStatus({ status: "failed" })).toEqual({ label: "Scan failed", tone: "bad" });
		expect(coverStatus({ status: "uploaded" })).toEqual({ label: "Waiting for upload", tone: "idle" });
	});
});

describe("shelfMeta", () => {
	it("counts pages, singular for one", () => {
		expect(shelfMeta({ status: "ready", page_count: 212 })).toBe("212 pages");
		expect(shelfMeta({ status: "ready", page_count: 1 })).toBe("1 page");
	});
	it("says the PDF is opening before a scan knows the count", () => {
		expect(shelfMeta({ status: "scanning", page_count: null })).toBe("Opening the PDF…");
		expect(shelfMeta({ status: "uploaded", page_count: null })).toBe("No pages yet");
	});
});

describe("scanProgress", () => {
	it("is null unless the book is scanning", () => {
		expect(scanProgress({ status: "ready", page_count: 10, scanned_pages: 10 })).toBeNull();
	});
	it("runs without a fraction until the page count is known", () => {
		expect(scanProgress({ status: "scanning", page_count: null, scanned_pages: 0 })).toEqual({
			label: "—",
			fraction: null,
		});
	});
	it("counts pages read, never past the total", () => {
		expect(scanProgress({ status: "scanning", page_count: 180, scanned_pages: 64 })).toEqual({
			label: "64 / 180",
			fraction: 64 / 180,
		});
		expect(scanProgress({ status: "scanning", page_count: 4, scanned_pages: 9 })?.fraction).toBe(1);
	});
});

describe("hasCoverPage", () => {
	it("waits for the PDF and the scan's first page", () => {
		expect(hasCoverPage({ status: "uploaded", page_count: null, scanned_pages: 0 })).toBe(false);
		expect(hasCoverPage({ status: "scanning", page_count: 180, scanned_pages: 0 })).toBe(false);
		expect(hasCoverPage({ status: "scanning", page_count: 180, scanned_pages: 1 })).toBe(true);
		expect(hasCoverPage({ status: "ready", page_count: 180, scanned_pages: 180 })).toBe(true);
	});
	it("shows a failed scan's first page once its pages were counted", () => {
		expect(hasCoverPage({ status: "failed", page_count: 30, scanned_pages: 3 })).toBe(true);
		expect(hasCoverPage({ status: "failed", page_count: null, scanned_pages: 0 })).toBe(false);
	});
});
