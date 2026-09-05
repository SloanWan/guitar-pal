import { describe, it, expect, afterEach } from "vitest";
import {
	isTypingTarget,
	isModalOpen,
	shouldRunPageShortcut,
} from "@/lib/keyboardShortcuts";

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
	document.body.appendChild(node);
	return node;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("isTypingTarget", () => {
	it("claims text fields, textareas and selects", () => {
		expect(isTypingTarget(el("input", { type: "text" }))).toBe(true);
		expect(isTypingTarget(el("input"))).toBe(true);
		expect(isTypingTarget(el("textarea"))).toBe(true);
		expect(isTypingTarget(el("select"))).toBe(true);
	});

	it("leaves a focused fader alone — space is the transport, not a value", () => {
		expect(isTypingTarget(el("input", { type: "range" }))).toBe(false);
	});

	it("claims a contenteditable surface", () => {
		const node = el("div");
		node.contentEditable = "true";
		// jsdom does not compute isContentEditable from the attribute.
		Object.defineProperty(node, "isContentEditable", { value: true });
		expect(isTypingTarget(node)).toBe(true);
	});

	it("does not claim buttons, divs, or nothing at all", () => {
		expect(isTypingTarget(el("button"))).toBe(false);
		expect(isTypingTarget(el("div"))).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe("isModalOpen", () => {
	it("is false on a page with no dialog mounted", () => {
		expect(isModalOpen()).toBe(false);
	});

	it("sees a shadcn dialog by its slot, and any dialog by its role", () => {
		el("div", { "data-slot": "dialog-content" });
		expect(isModalOpen()).toBe(true);
		document.body.innerHTML = "";
		el("div", { role: "alertdialog" });
		expect(isModalOpen()).toBe(true);
	});
});

describe("shouldRunPageShortcut", () => {
	function press(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
		return { metaKey: false, ctrlKey: false, altKey: false, target: null, ...overrides } as KeyboardEvent;
	}

	it("runs for a plain key pressed against the page", () => {
		expect(shouldRunPageShortcut(press({ target: el("button") }))).toBe(true);
	});

	it("stands down while typing", () => {
		expect(shouldRunPageShortcut(press({ target: el("input") }))).toBe(false);
	});

	it("stands down while a dialog is up", () => {
		el("div", { "data-slot": "dialog-content" });
		expect(shouldRunPageShortcut(press())).toBe(false);
	});

	it("stands down for a modifier combination, which belongs to something else", () => {
		expect(shouldRunPageShortcut(press({ metaKey: true }))).toBe(false);
		expect(shouldRunPageShortcut(press({ ctrlKey: true }))).toBe(false);
		expect(shouldRunPageShortcut(press({ altKey: true }))).toBe(false);
	});
});
