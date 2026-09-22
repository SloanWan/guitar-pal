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
}));
vi.mock("@/hooks/useUser", () => ({ useUser: () => useUser() }));
vi.mock("@/components/AppLink", () => ({
	default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
		<a href={href} className={className}>
			{children}
		</a>
	),
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn() }),
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
		expect(host.textContent).toContain("Sign in to upload your own textbook");
		expect(host.querySelector('a[href^="/auth?redirect="]')?.getAttribute("href")).toBe(
			"/auth?redirect=%2Fbooks",
		);
		expect(host.textContent).not.toContain("Choose a PDF");
		expect(host.textContent).toContain("吉他自学三月通");
		unmount();
		host.remove();
	});

	it("signed in: loads the library and shows the upload", async () => {
		useUser.mockReturnValue({ user: { id: "u1" }, loading: false });
		listBooks.mockResolvedValue([]);
		const { host, unmount } = await render();
		expect(listBooks).toHaveBeenCalledTimes(1);
		expect(host.textContent).toContain("Choose a PDF");
		expect(host.textContent).toContain("No books yet");
		unmount();
		host.remove();
	});
});
