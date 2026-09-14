// Chords mode end to end, with the voicing library and the audio mocked: a
// piano key picks the chord on its degree, the neck shows only that shape,
// the readout names it, the capo shifts the shape but not what is heard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sound = vi.hoisted(() => ({ play: vi.fn(async () => {}), playChord: vi.fn(async () => {}) }));
vi.mock("@/components/fretboard/useNoteSound", () => ({
	useNoteSound: () => ({ play: sound.play, playChord: sound.playChord, isLoading: false }),
}));
vi.mock("@/components/strum/ChordPickerModal", () => ({ default: () => null }));

function voicing(frets: string, fingers = "000000"): ChordVoicing {
	return { id: frets, label: "Standard", start_fret: 1, barre_fret: null, capo: false, frets, fingers };
}
const LIBRARY: Record<string, ChordVoicing[]> = {
	"C major": [voicing("x32010")],
	"E minor": [voicing("022000")],
	"D minor": [voicing("xx0231")],
	"C# major": [voicing("x43121")],
	"F# minor": [voicing("244222")],
	"D major": [voicing("xx0232")],
};
vi.mock("@/lib/chordVoicingCache", () => ({
	peekVoicings: (root: string, suffix: string) => LIBRARY[`${root} ${suffix}`] ?? [],
	loadVoicings: async (root: string, suffix: string) => LIBRARY[`${root} ${suffix}`] ?? [],
}));

function mount(props: React.ComponentProps<typeof FretboardExplorer>) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	let root!: Root;
	act(() => {
		root = createRoot(host);
		root.render(<FretboardExplorer {...props} />);
	});
	const q = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
	return {
		host,
		key: (midi: number) => q<HTMLButtonElement>(`[data-midi="${midi}"]`),
		title: () => q("[data-testid='view-title']").textContent?.replace(/\s+/g, " ").trim() ?? "",
		setSelect: (label: string, value: string) => {
			const el = q<HTMLSelectElement>(`select[aria-label="${label}"]`);
			el.value = value;
			el.dispatchEvent(new Event("change", { bubbles: true }));
		},
		clickRadio: (group: string, label: string) => {
			const btn = [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] [role="radio"]`)].find(
				(b) => b.textContent?.trim() === label,
			);
			if (!btn) throw new Error(`no ${label} in ${group}`);
			btn.click();
		},
		// The readout is a row of spans; join them the way a reader would.
		readout: () => {
			const el = host.querySelector("[data-testid='chord-readout']");
			return el ? [...el.children].map((c) => c.textContent?.trim()).filter(Boolean).join(" ") : null;
		},
		lit: () =>
			[...host.querySelectorAll<SVGGElement>("svg[data-from-fret] .fb-mark:not([data-emphasis='none'])")].map(
				(m) => `${m.dataset.string}:${m.dataset.fret}=${m.dataset.emphasis}`,
			),
		settle: () => act(async () => { await new Promise((r) => setTimeout(r, 30)); }),
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

beforeEach(() => {
	sound.play.mockClear();
	sound.playChord.mockClear();
});

describe("FretboardExplorer — Chords mode", () => {
	it("starts on the tonic, labels the piano with numerals and greys chromatic keys", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		expect(ex.readout()).toBe("C I");
		expect(ex.key(64).textContent).toBe("iii");
		expect(ex.key(67).textContent).toBe("V");
		expect(ex.key(71).textContent).toBe("vii°");
		expect(ex.key(61).textContent).toBe("");
		expect(ex.key(61).hasAttribute("data-dimmed")).toBe(true);
		expect(ex.key(64).hasAttribute("data-dimmed")).toBe(false);
		// Only the C shape is lit: x32010.
		expect(ex.lit().sort()).toEqual(["0:0=muted", "1:3=root", "2:2=chordTone", "3:0=chordTone", "4:1=root", "5:0=chordTone"].sort());
		ex.unmount();
	});

	it("picks the chord on a pressed key, lights its shape only, and sounds it on the piano", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(64).click()); // E → iii
		await ex.settle();
		expect(ex.readout()).toBe("Em iii");
		expect(ex.lit().sort()).toEqual(["0:0=root", "1:2=chordTone", "2:2=root", "3:0=chordTone", "4:0=chordTone", "5:0=root"].sort());
		expect(ex.key(64).getAttribute("aria-checked")).toBe("true");
		expect(ex.key(67).hasAttribute("data-tone")).toBe(true); // G, the third
		expect(ex.key(71).hasAttribute("data-tone")).toBe(true); // B, the fifth
		expect(ex.key(60).hasAttribute("data-tone")).toBe(false);
		expect(sound.playChord).toHaveBeenCalledWith([40, 47, 52, 55, 59, 64], "piano");
		ex.unmount();
	});

	it("plays a major triad on a chromatic key with its accidental numeral", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(61).click()); // C#
		await ex.settle();
		expect(ex.readout()).toBe("C♯ ♭II");
		expect(ex.key(61).textContent).toBe("♭II");
		expect(sound.playChord).toHaveBeenCalledWith([49, 53, 56, 61, 65], "piano");
		ex.unmount();
	});

	it("with a capo, fingers the shape below what is heard", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(64).click()); // Em heard
		await ex.settle();
		act(() => ex.setSelect("Capo", "2"));
		await ex.settle();
		expect(ex.readout()).toBe("Em iii · Dm shape");
		expect(ex.host.querySelector("svg[data-from-fret]")?.getAttribute("data-capo")).toBe("2");
		// Dm shape xx0231 sits above the capo: open D string at fret 2 sounds E, the root.
		expect(ex.lit()).toContain("2:2=root");
		expect(ex.lit()).toContain("0:2=muted");
		// Heard as Em: the piano still lights E, G, B.
		expect(ex.key(64).getAttribute("aria-checked")).toBe("true");
		expect(ex.key(67).hasAttribute("data-tone")).toBe(true);
		ex.unmount();
	});

	it("strums the shape on the guitar when one of its notes is pressed on the neck", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		const hit = ex.host.querySelector('[data-slot="1:3"] .fb-hit')!; // C on the A string, in the C shape
		const pointer = (type: string) =>
			act(() => {
				hit.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", clientX: 0, clientY: 0 }));
			});
		pointer("pointerdown");
		pointer("pointerup");
		await ex.settle();
		expect(sound.playChord).toHaveBeenCalledWith([48, 52, 55, 60, 64], "guitar");
		expect(sound.play).not.toHaveBeenCalled();
		ex.unmount();
	});

	it("keeps the degree when the key changes, transposing the chord with it", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(64).click()); // iii in C
		await ex.settle();
		expect(ex.readout()).toBe("Em iii");
		act(() => ex.clickRadio("Key", "D"));
		await ex.settle();
		// Still the third degree, now F#m; the piano's selected key moved with it.
		expect(ex.readout()).toBe("F♯m iii");
		expect(ex.key(66).getAttribute("aria-checked")).toBe("true");
		expect(ex.key(64).getAttribute("aria-checked")).toBe("false");
		// And the numerals on the keys are re-derived for the new key.
		expect(ex.key(62).textContent).toBe("I");
		expect(ex.key(60).textContent).toBe(""); // C is chromatic in D major
		ex.unmount();
	});

	it("names the view in the title, with the capo and the chord", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		expect(ex.title()).toBe("C major · C (I)");
		act(() => ex.setSelect("Capo", "3"));
		await ex.settle();
		expect(ex.title()).toBe("C major · capo 3 · C (I)");
		ex.unmount();
	});

	it("leaves Scale mode as it was", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major" });
		await ex.settle();
		expect(ex.readout()).toBeNull();
		expect(ex.key(64).textContent).toBe(""); // no numerals
		expect(ex.lit().length).toBeGreaterThan(20); // the whole scale
		ex.unmount();
	});
});

describe("FretboardExplorer — key, piano and labels", () => {
	it("tints the scale's pitch classes on the piano, tonic selected", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		// A minor pentatonic: A C D E G.
		expect(ex.key(57).getAttribute("aria-checked")).toBe("true"); // A4, the tonic
		for (const midi of [60, 62, 64, 67]) expect(ex.key(midi).hasAttribute("data-tone")).toBe(true);
		expect(ex.key(61).hasAttribute("data-tone")).toBe(false); // Db, outside
		ex.unmount();
	});

	it("does not change the key when a piano key is pressed; the key bar does", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() => ex.key(60).click()); // C
		await ex.settle();
		expect(ex.title()).toBe("A minor pentatonic");
		expect(sound.play).toHaveBeenCalledWith(60, "piano");

		act(() => ex.clickRadio("Key", "C"));
		await ex.settle();
		expect(ex.title()).toBe("C minor pentatonic");
		expect(ex.key(60).getAttribute("aria-checked")).toBe("true");
		ex.unmount();
	});

	it("blanks every label when labels are switched off", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major" });
		await ex.settle();
		const labels = () =>
			[...ex.host.querySelectorAll("svg[data-from-fret] .fb-mark:not([data-emphasis='none']) .fb-label")]
				.map((t) => t.textContent)
				.filter(Boolean);
		expect(labels().length).toBeGreaterThan(20);
		act(() => (ex.host.querySelector('[role="switch"][aria-label="Show labels"]') as HTMLButtonElement).click());
		await ex.settle();
		expect(labels()).toEqual([]);
		ex.unmount();
	});
});
