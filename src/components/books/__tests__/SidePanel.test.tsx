import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SidePanel from "@/components/books/SidePanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The shell's two ways in: growing into place, or taking the place of a panel already open. */
describe("SidePanel", () => {
	function mount(animateOpen: boolean) {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const onOpened = vi.fn();
		const onClose = vi.fn();
		const root = createRoot(host);
		act(() =>
			root.render(
				<SidePanel label="Thing" onClose={onClose} onOpened={onOpened} animateOpen={animateOpen} testId="p">
					<div data-testid="body" />
				</SidePanel>,
			),
		);
		const aside = host.querySelector('[data-testid="p"]');
		if (!aside) throw new Error("no aside");
		return { host, aside, onOpened, onClose, cleanup: () => { act(() => root.unmount()); host.remove(); } };
	}

	it("grows in: no body and no onOpened until the entrance has played", async () => {
		const { host, aside, onOpened, cleanup } = mount(true);
		expect(aside.classList.contains("side-panel")).toBe(true);
		expect(host.querySelector('[data-testid="body"]')).toBeNull();
		expect(onOpened).not.toHaveBeenCalled();
		await act(async () => {
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		});
		expect(host.querySelector('[data-testid="body"]')).not.toBeNull();
		act(() => aside.dispatchEvent(new Event("animationend")));
		expect(onOpened).toHaveBeenCalledTimes(1);
		cleanup();
	});

	it("replaces: the body and onOpened at once, and still closes with motion", () => {
		const { host, aside, onOpened, onClose, cleanup } = mount(false);
		expect(aside.classList.contains("side-panel")).toBe(false);
		expect(host.querySelector('[data-testid="body"]')).not.toBeNull();
		expect(onOpened).toHaveBeenCalledTimes(1);
		act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
		expect(aside.hasAttribute("data-closing")).toBe(true);
		expect(aside.classList.contains("side-panel")).toBe(true);
		expect(onClose).not.toHaveBeenCalled();
		act(() => aside.dispatchEvent(new Event("animationend")));
		expect(onClose).toHaveBeenCalledTimes(1);
		cleanup();
	});

	it("opens again after a mount that was undone and redone (StrictMode)", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const onOpened = vi.fn();
		const root = createRoot(host);
		const { StrictMode } = React;
		act(() =>
			root.render(
				<StrictMode>
					<SidePanel label="Thing" onClose={() => {}} onOpened={onOpened} animateOpen={false}>
						<div />
					</SidePanel>
				</StrictMode>,
			),
		);
		// Effects ran, were undone, ran again: what the first run set up was torn down.
		expect(onOpened).toHaveBeenCalledTimes(2);
		act(() => root.unmount());
		host.remove();
	});
});
