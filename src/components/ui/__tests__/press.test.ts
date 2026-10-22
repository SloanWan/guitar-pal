import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESS_MIN_HOLD_MS, bindPress } from "@/components/ui/press";

const pointer = (target: EventTarget, type: string, button = 0) =>
	target.dispatchEvent(new PointerEvent(type, { bubbles: true, button }));
const key = (target: EventTarget, type: string, k: string, repeat = false) =>
	target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: k, repeat }));

let el: HTMLButtonElement;
beforeEach(() => {
	vi.useFakeTimers();
	el = document.createElement("button");
	document.body.appendChild(el);
});
afterEach(() => {
	el.remove();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("bindPress", () => {
	it("sinks on pointer down and holds a quick tap for the minimum", () => {
		const unbind = bindPress(el);
		pointer(el, "pointerdown");
		expect(el.classList.contains("is-down")).toBe(true);
		vi.advanceTimersByTime(20);
		pointer(window, "pointerup");
		expect(el.classList.contains("is-down")).toBe(true);
		vi.advanceTimersByTime(PRESS_MIN_HOLD_MS - 20);
		expect(el.classList.contains("is-down")).toBe(false);
		unbind();
	});

	it("releases at once after a long hold, wherever the pointer is let go", () => {
		const unbind = bindPress(el);
		pointer(el, "pointerdown");
		vi.advanceTimersByTime(300);
		pointer(document.body, "pointerup");
		expect(el.classList.contains("is-down")).toBe(false);
		unbind();
	});

	it("releases on pointer cancel and on leave", () => {
		const unbind = bindPress(el);
		pointer(el, "pointerdown");
		vi.advanceTimersByTime(200);
		pointer(window, "pointercancel");
		expect(el.classList.contains("is-down")).toBe(false);
		pointer(el, "pointerdown");
		vi.advanceTimersByTime(200);
		el.dispatchEvent(new PointerEvent("pointerleave"));
		expect(el.classList.contains("is-down")).toBe(false);
		unbind();
	});

	it("ignores a secondary button and a disabled element", () => {
		const unbind = bindPress(el);
		pointer(el, "pointerdown", 2);
		expect(el.classList.contains("is-down")).toBe(false);
		el.disabled = true;
		pointer(el, "pointerdown");
		key(el, "keydown", " ");
		expect(el.classList.contains("is-down")).toBe(false);
		unbind();
	});

	it("shows the sink for Enter and Space, not for other keys or auto-repeat", () => {
		const unbind = bindPress(el);
		key(el, "keydown", "a");
		key(el, "keydown", " ", true);
		expect(el.classList.contains("is-down")).toBe(false);
		for (const k of [" ", "Enter"]) {
			key(el, "keydown", k);
			expect(el.classList.contains("is-down")).toBe(true);
			vi.advanceTimersByTime(200);
			key(el, "keyup", k);
			expect(el.classList.contains("is-down")).toBe(false);
		}
		unbind();
	});

	it("leaves no pending release behind once unbound", () => {
		const unbind = bindPress(el);
		pointer(el, "pointerdown");
		pointer(window, "pointerup"); // a quick tap → a pending release timer
		expect(vi.getTimerCount()).toBe(1);
		unbind();
		expect(vi.getTimerCount()).toBe(0);
		expect(el.classList.contains("is-down")).toBe(false);
	});

	it("leaves no listener behind once unbound mid-press", () => {
		const live = watchWindowListeners();
		const unbind = bindPress(el);
		pointer(el, "pointerdown");
		expect(live.size).toBe(2);
		unbind();
		expect(live.size).toBe(0);
		pointer(el, "pointerdown");
		expect(el.classList.contains("is-down")).toBe(false);
	});
});

/** The listeners currently on window, kept by wrapping add / remove. */
function watchWindowListeners(): Set<string> {
	const live = new Set<string>();
	const ids = new Map<unknown, number>();
	const id = (fn: unknown) => {
		if (!ids.has(fn)) ids.set(fn, ids.size);
		return ids.get(fn);
	};
	const add = window.addEventListener.bind(window);
	const remove = window.removeEventListener.bind(window);
	vi.spyOn(window, "addEventListener").mockImplementation((type, fn, opts) => {
		live.add(`${type}:${id(fn)}`);
		add(type, fn, opts);
	});
	vi.spyOn(window, "removeEventListener").mockImplementation((type, fn, opts) => {
		live.delete(`${type}:${id(fn)}`);
		remove(type, fn, opts);
	});
	return live;
}

describe("bindPress, hop mode", () => {
	const touch = (type: string) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerType: "touch" }));

	it("hops a card under a finger and holds the hop for a tap", async () => {
		const { TAP_HOP_MS } = await import("@/components/ui/press");
		const unbind = bindPress(el, { hop: true });
		touch("pointerdown");
		expect(el.classList.contains("is-hop")).toBe(true);
		expect(el.classList.contains("is-down")).toBe(false);
		window.dispatchEvent(new PointerEvent("pointerup", { button: 0 }));
		vi.advanceTimersByTime(TAP_HOP_MS - 1);
		expect(el.classList.contains("is-hop")).toBe(true);
		vi.advanceTimersByTime(1);
		expect(el.classList.contains("is-hop")).toBe(false);
		unbind();
	});

	it("still flattens under a mouse", () => {
		const unbind = bindPress(el, { hop: true });
		el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
		expect(el.classList.contains("is-down")).toBe(true);
		expect(el.classList.contains("is-hop")).toBe(false);
		unbind();
	});
});
