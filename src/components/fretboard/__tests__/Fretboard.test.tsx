import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import Fretboard, { FRET_W } from "@/components/fretboard/Fretboard";
import type { FretMark } from "@/lib/fretboard/types";

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

	it("knows nothing about scales or chords: only the mark model and the string names", () => {
		const source = readFileSync(path.resolve(__dirname, "../Fretboard.tsx"), "utf8");
		const modules = [...source.matchAll(/^import[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
		expect(new Set(modules)).toEqual(new Set(["react", "@/lib/chordVoicingToMidi", "@/lib/fretboard/types"]));
		expect(source).toMatch(/import \{ STRING_LABELS \} from "@\/lib\/chordVoicingToMidi"/);
	});
});
