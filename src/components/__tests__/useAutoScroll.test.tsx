import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAutoScroll, type AutoScroll } from "@/components/useAutoScroll";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout: the viewer's heights are set by hand, and the observer
// fires once on observe so the hook measures what was set.
const observers: { cb: ResizeObserverCallback; fire: () => void }[] = [];
globalThis.ResizeObserver = class {
	constructor(private cb: ResizeObserverCallback) {
		observers.push({ cb, fire: () => this.cb([], this as unknown as ResizeObserver) });
	}
	observe() {
		this.cb([], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
};

/** How tall the viewer's content is, versus the viewer; jsdom reports 0 for both otherwise. */
function size(viewer: HTMLDivElement, scrollHeight: number, clientHeight: number) {
	Object.defineProperty(viewer, "scrollHeight", { configurable: true, value: scrollHeight });
	Object.defineProperty(viewer, "clientHeight", { configurable: true, value: clientHeight });
}

let latest: AutoScroll;
function Harness({ ready, patternId = "p" }: { ready: boolean; patternId?: string }) {
	const viewerRef = useRef<HTMLDivElement>(null);
	const state = useAutoScroll({ viewerRef, scrollSpeed: 16, patternId, ready });
	const { contentRef } = state;
	useEffect(() => {
		latest = state;
	});
	if (!ready) return null;
	return (
		<div ref={viewerRef} data-viewer>
			<div ref={contentRef} />
		</div>
	);
}
const viewer = () => document.querySelector<HTMLDivElement>("[data-viewer]")!;
/** Lay the viewer out at the given heights and let the observer report it. */
async function layout(scrollHeight: number, clientHeight: number) {
	size(viewer(), scrollHeight, clientHeight);
	await act(async () => observers[observers.length - 1].fire());
}

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
	observers.length = 0;
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
});

describe("useAutoScroll", () => {
	it("measures overflow once the viewer is there, and reports none before", async () => {
		await act(async () => root.render(<Harness ready={false} />));
		expect(latest.tabOverflows).toBe(false);
		expect(observers).toHaveLength(0);

		await act(async () => root.render(<Harness ready={true} />));
		await layout(800, 300);
		expect(latest.tabOverflows).toBe(true);
	});

	it("reports no overflow when the content fits", async () => {
		await act(async () => root.render(<Harness ready={true} />));
		await layout(300, 300);
		expect(latest.tabOverflows).toBe(false);
		expect(latest.autoScrollActive).toBe(false);
	});

	it("is active only while on and overflowing, and stops when the viewer goes away", async () => {
		await act(async () => root.render(<Harness ready={true} />));
		await layout(800, 300);
		await act(async () => latest.setAutoScroll(true));
		expect(latest.autoScrollActive).toBe(true);

		// The whole thing comes into view: nothing left to creep.
		await layout(300, 300);
		expect(latest.autoScroll).toBe(true);
		expect(latest.autoScrollActive).toBe(false);

		// Leaving the viewer is a stop, not a pause.
		await act(async () => root.render(<Harness ready={false} />));
		expect(latest.autoScroll).toBe(false);
		await act(async () => root.render(<Harness ready={true} />));
		await layout(800, 300);
		expect(latest.autoScroll).toBe(false);
		expect(latest.tabOverflows).toBe(true);
	});
});
