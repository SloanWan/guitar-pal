import { describe, it, expect, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import SidePanel from "@/components/books/panel/SidePanel";

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
				<SidePanel eyebrow="Kind" title="Thing" ariaLabel="Thing" onClose={onClose} onOpened={onOpened} animateOpen={animateOpen} testId="p">
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
		expect(aside.hasAttribute("data-motion")).toBe(true);
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
		expect(aside.hasAttribute("data-motion")).toBe(false);
		expect(host.querySelector('[data-testid="body"]')).not.toBeNull();
		expect(onOpened).toHaveBeenCalledTimes(1);
		act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
		expect(aside.hasAttribute("data-closing")).toBe(true);
		expect(aside.hasAttribute("data-motion")).toBe(true);
		expect(onClose).not.toHaveBeenCalled();
		act(() => aside.dispatchEvent(new Event("animationend")));
		expect(onClose).toHaveBeenCalledTimes(1);
		cleanup();
	});

	it("closes on Escape and on the scrim, each once the exit has played", () => {
		const { aside, onClose, cleanup } = mount(false);
		act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
		expect(aside.hasAttribute("data-closing")).toBe(true);
		act(() => aside.dispatchEvent(new Event("animationend")));
		expect(onClose).toHaveBeenCalledTimes(1);
		cleanup();

		const again = mount(false);
		act(() => again.host.querySelector<HTMLElement>(".bk-scrim")?.click());
		act(() => again.aside.dispatchEvent(new Event("animationend")));
		expect(again.onClose).toHaveBeenCalledTimes(1);
		again.cleanup();
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
					<SidePanel eyebrow="Kind" title="Thing" ariaLabel="Thing" onClose={() => {}} onOpened={onOpened} animateOpen={false}>
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
