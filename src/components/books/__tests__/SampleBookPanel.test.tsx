import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import SampleBookPanel from "@/components/books/SampleBookPanel";

vi.mock("@/components/AppLink", () => ({
	default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
		<a href={href} className={className}>
			{children}
		</a>
	),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("SampleBookPanel", () => {
	it("is one row into the sample book", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const root = createRoot(host);
		act(() => root.render(<SampleBookPanel />));
		expect(host.querySelector("a")?.getAttribute("href")).toBe("/books/sample");
		expect(host.textContent).toContain("Sample");
		expect(host.textContent).toContain("吉他自学三月通");
		act(() => root.unmount());
		host.remove();
	});
});
