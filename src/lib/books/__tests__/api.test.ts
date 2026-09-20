import { describe, it, expect, vi, beforeEach } from "vitest";

const signed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
	createClient: () => ({ storage: { from: () => ({ createSignedUrl: signed }) } }),
}));
import { BookApiError, bookFileUrl, pageImageUrl } from "@/lib/books/api";

/** The page image (#240): the service names the path, Storage signs it. */
describe("pageImageUrl", () => {
	beforeEach(() => {
		signed.mockReset().mockResolvedValue({ data: { signedUrl: "https://signed/p0006.png" }, error: null });
	});

	it("asks the service for the page, then signs the path it names", async () => {
		const fetchMock = vi.fn(async () => Response.json({ path: "u1/pages/b1/p0006.png" }));
		vi.stubGlobal("fetch", fetchMock);
		expect(await pageImageUrl("b1", 6)).toBe("https://signed/p0006.png");
		expect(fetchMock.mock.calls[0][0]).toBe("/api/books/b1/pages/6/image");
		expect(signed).toHaveBeenCalledWith("u1/pages/b1/p0006.png", 3600);
	});

	it("passes the service's refusal on, and has nothing for the sample", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "The book has pages 1–9." }, { status: 404 })));
		await expect(pageImageUrl("b1", 99)).rejects.toMatchObject({ status: 404, message: "The book has pages 1–9." });
		expect(await pageImageUrl("sample", 1)).toBe("/samples/sanyuetong/pages/p0001.jpg");
		expect(await pageImageUrl("sample", 99)).toBeNull();
		expect(await bookFileUrl({ id: "sample", storage_path: "" })).toBeNull();
		expect(await bookFileUrl({ id: "b1", storage_path: "u1/b1.pdf" })).toBe("https://signed/p0006.png");
		expect(signed).toHaveBeenLastCalledWith("u1/b1.pdf", 3600);
		expect(BookApiError).toBeDefined();
	});
});
