import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import Fretboard, { FRET_W, type FretboardComponentProps, type FretboardHandle } from "@/components/fretboard/Fretboard";
import type { FretMark } from "@/lib/fretboard/types";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function render(marks: readonly FretMark[], fromFret: number, toFret: number): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = renderToStaticMarkup(<Fretboard marks={marks} fromFret={fromFret} toFret={toFret} />);
	return host;
}

function slot(host: HTMLElement, string: number, fret: number): Element {
	const el = host.querySelector(`[data-string="${string}"][data-fret="${fret}"]`);
	if (!el) throw new Error(`no slot ${string}:${fret}`);
	return el;
}

const A_ROOTS: readonly FretMark[] = [
	{ string: 0, fret: 5, label: "A", emphasis: "root" },
	{ string: 1, fret: 0, label: "A", emphasis: "root" },
	{ string: 0, fret: 8, label: "C", emphasis: "scaleTone" },
	{ string: 3, fret: 2, label: "A", emphasis: "chordTone" },
	{ string: 5, fret: 0, label: "", emphasis: "muted" },
];

describe("Fretboard", () => {
	it("renders every slot on the neck as a dormant node, lit only where a mark exists", () => {
		const host = render(A_ROOTS, 0, 22);
		const slots = host.querySelectorAll("[data-emphasis]");
		expect(slots).toHaveLength(6 * 23);
		expect(slot(host, 0, 5).getAttribute("data-emphasis")).toBe("root");
		expect(slot(host, 1, 0).getAttribute("data-emphasis")).toBe("root");
		expect(slot(host, 0, 8).getAttribute("data-emphasis")).toBe("scaleTone");
		expect(slot(host, 3, 2).getAttribute("data-emphasis")).toBe("chordTone");
		expect(slot(host, 5, 0).getAttribute("data-emphasis")).toBe("muted");
		expect(slot(host, 2, 4).getAttribute("data-emphasis")).toBe("none");
		expect(host.querySelectorAll('[data-emphasis="none"]')).toHaveLength(6 * 23 - 5);
	});

	it("writes each mark's label into its slot and nothing into dormant ones", () => {
		const host = render(A_ROOTS, 0, 22);
		expect(slot(host, 0, 8).textContent).toBe("C");
		expect(slot(host, 2, 4).textContent).toBe("");
	});

	it("scales to the container with a floor, and scrolls the rest of the neck", () => {
		const host = render(A_ROOTS, 0, 22);
		const neck = host.querySelector("svg[data-from-fret]") as SVGElement;
		expect(Number(neck.getAttribute("width"))).toBe(23 * FRET_W + 2);
		// Sized in container-query units so 16 cells fill the width, never below the floor.
		expect(neck.getAttribute("style")).toMatch(/width:\s*max\(calc\(100cqw \* [\d.]+\), [\d.]+px\)/);
		expect(neck.parentElement?.className).toContain("overflow-x-auto");
		expect(host.firstElementChild?.getAttribute("style")).toContain("container-type");
	});

	it("exposes a chord tone's role for colouring", () => {
		const host = render([{ string: 0, fret: 4, label: "G#", emphasis: "chordTone", tone: "third" }], 0, 5);
		expect(slot(host, 0, 4).getAttribute("data-tone")).toBe("third");
		expect(slot(host, 0, 3).hasAttribute("data-tone")).toBe(false);
	});

	it("renders only the requested window, with the nut only when the open cell is shown", () => {
		const host = render(A_ROOTS, 5, 9);
		expect(host.querySelectorAll("[data-emphasis]")).toHaveLength(6 * 5);
		expect(host.querySelector('[data-string="0"][data-fret="4"]')).toBeNull();
		const neck = host.querySelector("svg[data-from-fret]") as SVGElement;
		expect(neck.getAttribute("data-from-fret")).toBe("5");
		expect(neck.getAttribute("data-to-fret")).toBe("9");
		expect(host.querySelector(".stroke-ink")).toBeNull();
		expect(render(A_ROOTS, 0, 5).querySelector(".stroke-ink")).not.toBeNull();
	});

	it("labels the strings low E to high e and numbers every fret", () => {
		const host = render([], 0, 22);
		const text = host.textContent ?? "";
		for (const name of ["E", "A", "D", "G", "B", "e"]) expect(text).toContain(name);
		for (let fret = 0; fret <= 22; fret++) expect(text).toContain(String(fret));
	});

	it("knows nothing about scales or chords: only the mark model, position facts, motion and the string names", () => {
		const source = readFileSync(path.resolve(__dirname, "../Fretboard.tsx"), "utf8");
		const modules = [...source.matchAll(/^import[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
		expect(new Set(modules)).toEqual(
			new Set([
				"react",
				"@/lib/chordVoicingToMidi",
				"@/lib/fretboard/positions",
				"@/lib/fretboard/types",
				"@/lib/motion",
			]),
		);
		expect(source).toMatch(/import \{ STRING_LABELS \} from "@\/lib\/chordVoicingToMidi"/);
	});
});

// ── Interaction: hover rings and presses land on the DOM, not on React ──────

function mount(props: Partial<FretboardComponentProps> = {}) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	act(() => {
		root.render(<Fretboard marks={A_ROOTS} fromFret={0} toFret={22} {...props} />);
	});
	return {
		host,
		hit: (string: number, fret: number) =>
			host.querySelector(`[data-slot="${string}:${fret}"] .fb-hit`) as SVGRectElement,
		hoverOf: (string: number, fret: number) =>
			host.querySelector(`[data-slot="${string}:${fret}"]`)?.getAttribute("data-hover") ?? null,
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

function pointer(
	el: Element,
	type: string,
	init: PointerEventInit & { relatedTarget?: Element | null } = {},
): void {
	act(() => {
		el.dispatchEvent(
			new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", ...init }),
		);
	});
}

describe("Fretboard — hover", () => {
	it("rings the hovered slot, its unisons and, fainter, its octaves; leaving clears them", () => {
		const board = mount();
		pointer(board.hit(5, 0), "pointerover"); // E4 on the open high e
		expect(board.hoverOf(5, 0)).toBe("self");
		for (const [s, f] of [
			[4, 5],
			[3, 9],
			[2, 14],
			[1, 19],
		]) {
			expect(board.hoverOf(s, f)).toBe("unison");
		}
		expect(board.hoverOf(0, 0)).toBe("octave"); // E2
		expect(board.hoverOf(5, 12)).toBe("octave"); // E5
		expect(board.hoverOf(5, 1)).toBeNull(); // F: unrelated
		expect(board.host.querySelectorAll("[data-hover]")).toHaveLength(1 + 4 + 7);

		pointer(board.hit(5, 0), "pointerout", { relatedTarget: null });
		expect(board.host.querySelectorAll("[data-hover]")).toHaveLength(0);
		board.unmount();
	});

	it("reports the hovered slot's pitch, and null once on leaving", () => {
		const onSlotHover = vi.fn();
		const board = mount({ onSlotHover });
		pointer(board.hit(4, 5), "pointerover"); // E4 on the B string
		expect(onSlotHover).toHaveBeenLastCalledWith({ string: 4, fret: 5, midi: 64 });
		pointer(board.hit(4, 6), "pointerover");
		expect(onSlotHover).toHaveBeenLastCalledWith({ string: 4, fret: 6, midi: 65 });
		pointer(board.hit(4, 6), "pointerout", { relatedTarget: null });
		expect(onSlotHover).toHaveBeenLastCalledWith(null);
		expect(onSlotHover).toHaveBeenCalledTimes(3); // the move between slots did not clear first
		pointer(board.hit(4, 6), "pointerout", { relatedTarget: null });
		expect(onSlotHover).toHaveBeenCalledTimes(3); // nothing to clear, nothing reported
		board.unmount();
	});

	it("moves the rings with the pointer and ignores touch", () => {
		const board = mount({ pressable: false });
		pointer(board.hit(5, 0), "pointerover");
		pointer(board.hit(0, 5), "pointerover"); // A2
		expect(board.hoverOf(5, 0)).toBeNull();
		expect(board.hoverOf(0, 5)).toBe("self");
		expect(board.hoverOf(1, 0)).toBe("unison"); // open A

		pointer(board.hit(0, 5), "pointerout", { relatedTarget: null });
		pointer(board.hit(2, 2), "pointerover", { pointerType: "touch" });
		expect(board.host.querySelectorAll("[data-hover]")).toHaveLength(0);
		board.unmount();
	});
});

describe("Fretboard — press", () => {
	it("reports the slot with its MIDI pitch when a pointer lifts where it landed", () => {
		const onSlotPress = vi.fn();
		const board = mount({ onSlotPress });
		pointer(board.hit(0, 5), "pointerdown", { clientX: 10, clientY: 10 });
		pointer(board.hit(0, 5), "pointerup", { clientX: 12, clientY: 11 });
		expect(onSlotPress).toHaveBeenCalledTimes(1);
		expect(onSlotPress).toHaveBeenCalledWith({ string: 0, fret: 5, midi: 45 });

		// Dormant slots sound too: the board is a full chromatic instrument.
		pointer(board.hit(3, 4), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(3, 4), "pointerup", { clientX: 0, clientY: 0 });
		expect(onSlotPress).toHaveBeenLastCalledWith({ string: 3, fret: 4, midi: 59 });
		expect(board.host.querySelector("svg[data-from-fret]")?.hasAttribute("data-pressable")).toBe(true);
		board.unmount();
	});

	it("treats a drag as a scroll, not a tap", () => {
		const onSlotPress = vi.fn();
		const board = mount({ onSlotPress });
		pointer(board.hit(0, 5), "pointerdown", { clientX: 0, clientY: 0, pointerType: "touch" });
		pointer(board.hit(0, 5), "pointerup", { clientX: 40, clientY: 0, pointerType: "touch" });
		// Lifting on another slot is not a press either, however short the move.
		pointer(board.hit(0, 5), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(0, 6), "pointerup", { clientX: 2, clientY: 0 });
		// A cancelled pointer (the browser took the gesture for scrolling) drops the press.
		pointer(board.hit(0, 5), "pointerdown", { clientX: 0, clientY: 0, pointerType: "touch" });
		pointer(board.hit(0, 5), "pointercancel", { pointerType: "touch" });
		pointer(board.hit(0, 5), "pointerup", { clientX: 0, clientY: 0, pointerType: "touch" });
		expect(onSlotPress).not.toHaveBeenCalled();
		board.unmount();
	});

	it("is inert when not pressable, but hover still works", () => {
		const onSlotPress = vi.fn();
		const board = mount({ onSlotPress, pressable: false });
		pointer(board.hit(0, 5), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(0, 5), "pointerup", { clientX: 0, clientY: 0 });
		expect(onSlotPress).not.toHaveBeenCalled();
		const neck = board.host.querySelector("svg[data-from-fret]") as SVGElement;
		expect(neck.hasAttribute("data-pressable")).toBe(false);
		expect(neck.getAttribute("aria-disabled")).toBe("true");

		pointer(board.hit(0, 5), "pointerover");
		expect(board.hoverOf(0, 5)).toBe("self");
		board.unmount();
	});

	it("strikes a list of slots in order with a stagger, through the ref handle", async () => {
		vi.useFakeTimers();
		try {
			const handle = createRef<FretboardHandle>();
			const board = mount({ ref: handle });
			const d = (s: number) => board.host.querySelector(`.fb-string[data-string="${s}"]`)!.getAttribute("d");
			// Two dormant slots on different strings: each pluck bends its own string.
			act(() => handle.current!.strike([{ string: 2, fret: 4 }, { string: 3, fret: 4 }], 20));
			act(() => vi.advanceTimersByTime(16));
			expect(d(2)).toContain("Q");
			expect(d(3)).not.toContain("Q"); // its turn comes 20 ms later
			act(() => vi.advanceTimersByTime(20));
			expect(d(3)).toContain("Q");
			board.unmount();
		} finally {
			vi.useRealTimers();
		}
	});

	it("draws a capo, dims the frets behind it, and reports the capo's pitch for a press behind it", () => {
		const onSlotPress = vi.fn();
		const board = mount({ onSlotPress, capo: 2 });
		const neck = board.host.querySelector("svg[data-from-fret]") as SVGElement;
		expect(neck.getAttribute("data-capo")).toBe("2");
		expect(board.host.querySelector(".fb-capo[data-fret='2'] .fb-capo-bar")).not.toBeNull();
		// The capo's own fret space still plays — it is the new open string —
		// so only the two cells behind it are shaded out.
		const shade = board.host.querySelector(".fb-capo-shade") as SVGRectElement;
		expect(Number(shade.getAttribute("width"))).toBe(2 * FRET_W);
		// Fret 1 on the low E cannot sound behind a capo at 2: it reports F#2 (42), the capo's pitch.
		pointer(board.hit(0, 1), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(0, 1), "pointerup", { clientX: 0, clientY: 0 });
		expect(onSlotPress).toHaveBeenLastCalledWith({ string: 0, fret: 1, midi: 42 });
		pointer(board.hit(0, 5), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(0, 5), "pointerup", { clientX: 0, clientY: 0 });
		expect(onSlotPress).toHaveBeenLastCalledWith({ string: 0, fret: 5, midi: 45 });
		board.unmount();
		expect(mount().host.querySelector(".fb-capo")).toBeNull();
	});

	it("drags the capo to the fret under the pointer and keys it a fret at a time", () => {
		const onCapoChange = vi.fn();
		const board = mount({ capo: 2, onCapoChange, maxCapo: 12 });
		const svg = board.host.querySelector("svg[data-from-fret]") as SVGSVGElement;
		// jsdom measures nothing; give the neck its design size so the scale is 1.
		svg.getBoundingClientRect = () =>
			({ left: 0, top: 0, width: 23 * FRET_W + 2, height: 120 }) as DOMRect;
		const grip = board.host.querySelector(".fb-capo-grip") as SVGRectElement;
		// The capo lands on whichever cell the pointer is over; EDGE offsets by 1.
		const midOf = (fret: number) => fret * FRET_W + FRET_W / 2 + 1;

		pointer(grip, "pointerdown", { clientX: midOf(2) });
		pointer(grip, "pointermove", { clientX: midOf(5) });
		expect(onCapoChange).toHaveBeenLastCalledWith(5);
		pointer(grip, "pointermove", { clientX: midOf(20) }); // past maxCapo
		expect(onCapoChange).toHaveBeenLastCalledWith(12);
		pointer(grip, "pointermove", { clientX: midOf(0) }); // off the low end: no capo
		expect(onCapoChange).toHaveBeenLastCalledWith(0);
		pointer(grip, "pointerup", { clientX: midOf(0) });
		const afterDrag = onCapoChange.mock.calls.length;
		pointer(grip, "pointermove", { clientX: midOf(7) }); // released: no longer dragging
		expect(onCapoChange).toHaveBeenCalledTimes(afterDrag);

		const slider = board.host.querySelector(".fb-capo") as SVGGElement;
		expect(slider.getAttribute("role")).toBe("slider");
		expect(slider.getAttribute("aria-valuenow")).toBe("2");
		expect(slider.getAttribute("aria-valuemax")).toBe("12");
		const key = (k: string) =>
			act(() => {
				slider.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
			});
		key("ArrowRight");
		expect(onCapoChange).toHaveBeenLastCalledWith(3);
		key("ArrowLeft");
		expect(onCapoChange).toHaveBeenLastCalledWith(1);
		key("End");
		expect(onCapoChange).toHaveBeenLastCalledWith(12);
		key("Home");
		expect(onCapoChange).toHaveBeenLastCalledWith(0);
		board.unmount();
	});

	it("draws the capo over the slots, and leaves it inert without a change handler", () => {
		const board = mount({ capo: 3 });
		const nodes = [...board.host.querySelectorAll(".fb-slot, .fb-capo")];
		// The capo is last, so its shade dims the marks and its grip would take
		// pointer events before the slots underneath.
		expect(nodes[nodes.length - 1].classList.contains("fb-capo")).toBe(true);
		expect(board.host.querySelector(".fb-capo-grip")).toBeNull();
		expect(board.host.querySelector(".fb-capo")?.getAttribute("role")).toBeNull();
		board.unmount();
	});

	it("plucks the string under a dormant slot and lets it settle straight", async () => {
		const board = mount({ onSlotPress: () => {} });
		const string = board.host.querySelector('.fb-string[data-string="3"]') as SVGPathElement;
		const straight = string.getAttribute("d");
		expect(straight).toMatch(/^M0 \d+L\d+ \d+$/);
		pointer(board.hit(3, 4), "pointerdown", { clientX: 0, clientY: 0 });
		pointer(board.hit(3, 4), "pointerup", { clientX: 0, clientY: 0 });
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		expect(string.getAttribute("d")).toContain("Q");
		await new Promise((r) => setTimeout(r, 400));
		expect(string.getAttribute("d")).toBe(straight);
		board.unmount();
	});
});
