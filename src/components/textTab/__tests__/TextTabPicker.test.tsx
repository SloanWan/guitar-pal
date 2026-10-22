import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Measure } from "@/lib/fingerpickTypes";
import { takeHandoff } from "@/lib/assistant/handoff";

/**
 * The text-tab picker with the audio engine and the stave stubbed: every
 * reading of a pasted tab is listed and can be played, the chosen one is
 * previewed, and "Open in fingerpick" stashes it as a handoff with the
 * by-ear warning first.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const engine = vi.hoisted(() => ({
	isLoaded: true,
	isPlaying: false,
	load: vi.fn(async () => {}),
	play: vi.fn(),
	stop: vi.fn(),
}));
vi.mock("@/components/fingerpick/useFingerpickAudioEngine", () => ({
	useFingerpickAudioEngine: () => engine,
}));

const staveProps: { measures: Measure[] }[] = [];
vi.mock("@/components/fingerpick/TabStaveRow", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/components/fingerpick/TabStaveRow")>()),
	default: (props: { measures: Measure[] }) => {
		staveProps.push(props);
		return <div data-stave={props.measures.length} />;
	},
}));

import TextTabPicker from "@/components/textTab/TextTabPicker";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
	constructor(private cb: ResizeObserverCallback) {}
	observe() {
		this.cb([{ contentRect: { width: 480 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
	}
	unobserve() {}
	disconnect() {}
};

const TIGHT = [
	"e|-0-1-3-|-3--0--|",
	"B|-------|-0--1--|",
	"G|-------|-0--0--|",
	"D|-------|-------|",
	"A|-------|-------|",
	"E|-0-0-0-|-3--3--|",
].join("\n");

let container: HTMLDivElement;
let root: Root | null = null;

function render(props: Partial<React.ComponentProps<typeof TextTabPicker>> = {}) {
	container = document.createElement("div");
	document.body.appendChild(container);
	act(() => {
		root = createRoot(container);
		root.render(<TextTabPicker {...props} />);
	});
}

function button(label: string): HTMLButtonElement {
	const found = Array.from(container.querySelectorAll("button")).find(
		(b) => b.textContent?.includes(label) || b.getAttribute("aria-label")?.includes(label),
	);
	if (!found) throw new Error(`no button "${label}" in: ${container.textContent}`);
	return found;
}

beforeEach(() => {
	push.mockReset();
	engine.play.mockReset();
	engine.stop.mockReset();
	engine.load.mockClear();
	engine.isPlaying = false;
	staveProps.length = 0;
	sessionStorage.clear();
});

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
});

describe("TextTabPicker", () => {
	it("asks for a tab, then lists every reading of it with the first previewed", () => {
		render();
		expect(container.textContent).toContain("Paste six lines of tab");
		expect(engine.load).toHaveBeenCalledTimes(1);
		const textarea = container.querySelector("textarea")!;
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
			setter.call(textarea, TIGHT);
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
		});
		const radios = Array.from(container.querySelectorAll('[role="radio"]'));
		expect(radios.map((r) => r.textContent?.split("bar")[0]?.trim())).toEqual([
			"Straight eighths2",
			"Sixteenths2",
			"By spacing2",
			"Swung eighths2",
		]);
		expect(radios[0].getAttribute("aria-checked")).toBe("true");
		expect(staveProps.at(-1)?.measures).toHaveLength(2);
		expect(container.textContent).toContain("Straight eighths · 4/4 · ♩ = 90");
	});

	it("plays the reading whose button is pressed, at the chosen tempo, and chooses it", () => {
		render({ initialText: TIGHT });
		act(() => button("Play Swung eighths").click());
		expect(engine.play).toHaveBeenCalledTimes(1);
		const [pattern, options] = engine.play.mock.calls[0] as [{ bpm: number; measures: { slots: { duration: string }[] }[] }, { loop: boolean }];
		expect(pattern.bpm).toBe(90);
		expect(pattern.measures[0].slots[0].duration).toBe("eighth-triplet");
		expect(options.loop).toBe(true);
		const checked = container.querySelector('[role="radio"][aria-checked="true"]');
		expect(checked?.textContent).toContain("Swung eighths");
	});

	it("hands the chosen reading to fingerpick with the by-ear warning first, and goes there when asked", () => {
		const onTaken = vi.fn();
		render({ initialText: TIGHT, initialName: "Book p.12", navigate: true, onTaken });
		act(() => button("Open in fingerpick").click());
		expect(engine.stop).toHaveBeenCalled();
		expect(onTaken).toHaveBeenCalledTimes(1);
		expect(push).toHaveBeenCalledWith("/fingerpick");
		const handoff = takeHandoff("fingerpick");
		if (handoff?.kind !== "fingerpick") throw new Error("no fingerpick handoff stashed");
		expect(handoff.pattern.name).toBe("Book p.12");
		expect(handoff.pattern.measures[0].slots.map((s) => s.duration)).toEqual(["eighth", "eighth", "eighth", "half", "eighth"]);
		expect(handoff.warnings[0]).toMatchObject({ code: "RHYTHM_BY_EAR" });
		expect(handoff.warnings.map((w) => w.code)).toContain("TEXT_TAB_BAR_PADDED");
	});

	it("stays put on the fingerpick page itself, where the handoff lands in place", () => {
		render({ initialText: TIGHT });
		act(() => button("Open in fingerpick").click());
		expect(push).not.toHaveBeenCalled();
		expect(takeHandoff("fingerpick")?.kind).toBe("fingerpick");
	});
});
