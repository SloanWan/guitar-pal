import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry/client", () => ({ reportError }));

import ReportedBoundary from "../ReportedBoundary";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Part({ fail }: { fail: boolean }) {
	if (fail) throw new Error("could not draw");
	return <p>drawn</p>;
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	// React logs the caught error; the test is about what the boundary does with it.
	vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.restoreAllMocks();
	reportError.mockClear();
});

function boundary(fail: boolean, key: string) {
	return (
		<div>
			<ReportedBoundary fallback={<p>could not draw this line</p>} resetKeys={[key]}>
				<Part fail={fail} />
			</ReportedBoundary>
			<p>the rest of the page</p>
		</div>
	);
}

describe("ReportedBoundary", () => {
	it("shows its fallback in place of the part that threw, and reports it once", async () => {
		await act(async () => root.render(boundary(true, "a")));
		expect(host.textContent).toContain("could not draw this line");
		expect(host.textContent).toContain("the rest of the page");
		expect(reportError).toHaveBeenCalledTimes(1);
		expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "could not draw" }), "component");
	});

	it("tries again only when its reset keys change", async () => {
		await act(async () => root.render(boundary(true, "a")));
		await act(async () => root.render(boundary(false, "a")));
		expect(host.textContent).toContain("could not draw this line");
		await act(async () => root.render(boundary(false, "b")));
		expect(host.textContent).toContain("drawn");
		expect(host.textContent).not.toContain("could not draw this line");
	});
});
