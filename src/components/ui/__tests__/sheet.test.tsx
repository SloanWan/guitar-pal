import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SHEET_PANEL_MIN_WIDTH, Sheet, sheetSide } from "@/components/ui/sheet";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("sheetSide", () => {
	it("rises from the bottom on a phone and is a right panel from 720px", () => {
		expect(sheetSide(400)).toBe("bottom");
		expect(sheetSide(SHEET_PANEL_MIN_WIDTH - 1)).toBe("bottom");
		expect(sheetSide(SHEET_PANEL_MIN_WIDTH)).toBe("right");
		expect(sheetSide(1280)).toBe("right");
	});
});

/** A matchMedia whose change listeners can be counted. */
function fakeMatchMedia() {
	const listeners = new Set<EventListenerOrEventListenerObject>();
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		addEventListener: (_: string, fn: EventListenerOrEventListenerObject) => listeners.add(fn),
		removeEventListener: (_: string, fn: EventListenerOrEventListenerObject) => listeners.delete(fn),
	}));
	return listeners;
}

function Harness() {
	const [open, setOpen] = useState(false);
	return (
		<Sheet
			open={open}
			onOpenChange={setOpen}
			title="More"
			trigger={<button type="button">Open more</button>}
		>
			<button type="button">Books</button>
		</Sheet>
	);
}

let root: Root;
let host: HTMLDivElement;
const realMatchMedia = window.matchMedia;
beforeEach(() => {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
});
afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	window.matchMedia = realMatchMedia;
});

const trigger = () => host.querySelector("button")!;
const dialog = () => document.querySelector<HTMLElement>("[role=dialog]");
const escape = () =>
	act(() => {
		document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});

describe("Sheet", () => {
	it("opens on the bottom of a narrow viewport, closes on Escape and hands focus back", async () => {
		fakeMatchMedia();
		const width = window.innerWidth;
		Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
		await act(() => root.render(<Harness />));
		trigger().focus();
		await act(() => trigger().click());
		expect(dialog()).not.toBeNull();
		expect(dialog()!.dataset.side).toBe("bottom");
		expect(dialog()!.contains(document.activeElement)).toBe(true);
		await escape();
		expect(dialog()).toBeNull();
		// Radix hands focus back on the next tick
		await act(() => new Promise((r) => setTimeout(r, 0)));
		expect(document.activeElement).toBe(trigger());
		Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
	});

	it("listens for the breakpoint only while open", async () => {
		const listeners = fakeMatchMedia();
		await act(() => root.render(<Harness />));
		expect(listeners.size).toBe(0);
		await act(() => trigger().click());
		expect(listeners.size).toBe(1);
		await escape();
		expect(listeners.size).toBe(0);
	});
});
