import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import BooksPage from "@/app/(main)/books/page";

const listBooks = vi.fn();
const useUser = vi.fn();

vi.mock("@/lib/books/api", () => ({
	BOOKS_NOT_OPEN: "Textbook import is not open for use yet.",
	isServiceDown: () => false,
	listBooks: () => listBooks(),
	pageImageUrl: () => Promise.resolve(null),
}));
vi.mock("@/hooks/useUser", () => ({ useUser: () => useUser() }));
vi.mock("@/components/AppLink", () => ({
	default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));
vi.mock("@/components/nav-progress", () => ({ useNavRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/navigation", () => ({
	usePathname: () => "/books",
	useSearchParams: () => new URLSearchParams(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function render() {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	await act(async () => root.render(<BooksPage />));
	return { host, unmount: () => act(() => root.unmount()) };
}

describe("BooksPage (#262)", () => {
	beforeEach(() => {
		listBooks.mockReset();
		useUser.mockReset();
	});

	it("signed out: asks for no library, offers sign-in for the upload, and keeps the sample", async () => {
		useUser.mockReturnValue({ user: null, loading: false });
		const { host, unmount } = await render();
		expect(listBooks).not.toHaveBeenCalled();
		expect(host.textContent).toContain("Sign in to upload your own book");
		expect(host.querySelector('a[href^="/auth?redirect="]')?.getAttribute("href")).toBe(
			"/auth?redirect=%2Fbooks",
		);
		expect(host.textContent).not.toContain("Upload a PDF");
		expect(host.textContent).not.toContain("Your books");
		expect(host.textContent).toContain("吉他自学三月通");
		unmount();
		host.remove();
	});

	it("signed in: puts each book on the shelf as a link to it", async () => {
		useUser.mockReturnValue({ user: { id: "u1" }, loading: false });
		listBooks.mockResolvedValue([
			{
				id: "b1",
				title: "Fingerstyle Basics",
				page_count: 120,
				storage_path: "u1/b1.pdf",
				status: "scanning",
				toc_source: null,
				error: null,
				scanned_pages: 30,
				created_at: "2026-10-01T00:00:00Z",
			},
		]);
		const { host, unmount } = await render();
		const link = host.querySelector('a[href="/books/b1"]');
		expect(link?.getAttribute("aria-label")).toBe("Fingerstyle Basics — Scanning");
		expect(link?.textContent).toContain("30 / 120");
		expect(host.textContent).toContain("1 book");
		unmount();
		host.remove();
	});

	it("signed in: loads the library and shows the upload", async () => {
		useUser.mockReturnValue({ user: { id: "u1" }, loading: false });
		listBooks.mockResolvedValue([]);
		const { host, unmount } = await render();
		expect(listBooks).toHaveBeenCalledTimes(1);
		expect(host.textContent).toContain("Upload a PDF");
		expect(host.textContent).toContain("No books yet");
		expect(host.querySelector('a[href="/books/sample"]')).not.toBeNull();
		unmount();
		host.remove();
	});
});
