import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SKELETON_DELAY_MS, Skeleton } from "@/components/ui/skeleton";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	vi.useFakeTimers();
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(() => {
	host.remove();
	vi.useRealTimers();
});

const block = () => host.querySelector(".gp-skeleton");

describe("Skeleton", () => {
	it("holds its place at once, and draws its fill after a short wait", async () => {
		await act(() => root.render(<Skeleton className="h-10" />));
		expect(block()).not.toBeNull();
		expect(block()?.hasAttribute("data-wait")).toBe(true);
		await act(() => vi.advanceTimersByTime(SKELETON_DELAY_MS - 1));
		expect(block()?.hasAttribute("data-wait")).toBe(true);
		await act(() => vi.advanceTimersByTime(1));
		expect(block()?.hasAttribute("data-wait")).toBe(false);
		await act(async () => root.unmount());
	});

	it("clears its timer when unmounted before the delay", async () => {
		await act(() => root.render(<Skeleton />));
		expect(vi.getTimerCount()).toBe(1);
		await act(async () => root.unmount());
		expect(vi.getTimerCount()).toBe(0);
	});
});
