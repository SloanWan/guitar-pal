// Chords mode end to end, with the voicing library and the audio mocked: a
// piano key picks the chord on its degree, the neck shows only that shape,
// the readout names it, the capo shifts the shape but not what is heard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sound = vi.hoisted(() => ({
	play: vi.fn(async () => {}),
	playChord: vi.fn(async () => {}),
	setVolume: vi.fn(),
	prepare: vi.fn(async () => ({ ctx: {}, target: () => ({}) })),
	bus: vi.fn(() => ({ ctx: {}, target: () => ({}) })),
}));
vi.mock("@/components/fretboard/useNoteSound", () => ({
	useNoteSound: () => ({
		play: sound.play,
		playChord: sound.playChord,
		isLoading: false,
		volumes: { guitar: 0.8, piano: 0.5 },
		setVolume: sound.setVolume,
		prepare: sound.prepare,
		bus: sound.bus,
	}),
}));
const runner = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn() }));
vi.mock("@/components/fretboard/useScalePlayer", async (original) => ({
	...(await original<typeof import("@/components/fretboard/useScalePlayer")>()),
	useScalePlayer: () => ({ isPlaying: false, currentIndex: -1, play: runner.play, stop: runner.stop }),
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
	"Eb minor": [voicing("x68876")],
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
		toggle: (label: string) =>
			(host.querySelector(`[role="switch"][aria-label="${label}"]`) as HTMLButtonElement).click(),
		rightPress: (slot: string) =>
			host
				.querySelector(`[data-slot="${slot}"] .fb-hit`)!
				.dispatchEvent(
					new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 2, clientX: 0, clientY: 0 }),
				),
		clickRadio: (group: string, label: string) => {
			const btn = [...host.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] [role="radio"]`)].find(
				(b) => b.textContent?.trim() === label,
			);
			if (!btn) throw new Error(`no ${label} in ${group}`);
			btn.click();
		},
		// The readout's first line is a row of spans; join them as a reader would.
		readout: () => {
			const el = host.querySelector("[data-testid='chord-readout'] > div");
			return el ? [...el.children].map((c) => c.textContent?.trim()).filter(Boolean).join(" ") : null;
		},
		chordNotes: () =>
			host.querySelector("[data-testid='chord-readout'] > div:nth-child(2)")?.textContent?.trim() ?? null,
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
	// The SOUND rocker and the faders persist; without this a test that turns
	// sound off leaves the next one muted.
	localStorage.clear();
	sound.play.mockClear();
	sound.playChord.mockClear();
	sound.prepare.mockClear();
	runner.play.mockClear();
	runner.stop.mockClear();
});

describe("FretboardExplorer — Chords mode", () => {
	it("starts on the tonic, labels the piano with numerals and greys chromatic keys", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		expect(ex.readout()).toBe("C · I");
		// Each note the shape sounds, with its octave and its degree in the chord.
		expect(ex.chordNotes()).toBe("C3 (1)·E3 (3)·G3 (5)·C4 (1)·E4 (3)");
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
		expect(ex.readout()).toBe("Em · iii");
		expect(ex.chordNotes()).toBe("E2 (1)·B2 (5)·E3 (1)·G3 (♭3)·B3 (5)·E4 (1)");
		expect(ex.lit().sort()).toEqual(["0:0=root", "1:2=chordTone", "2:2=root", "3:0=chordTone", "4:0=chordTone", "5:0=root"].sort());
		// The piano lights the six notes the shape sounds — E2 B2 E3 G3 B3 E4 —
		// and nothing else, not even other octaves of the same names.
		const marked = () =>
			[...ex.host.querySelectorAll(".pk-board [data-selected], .pk-board [data-tone]")].map((el) =>
				Number((el as HTMLElement).dataset.midi),
			);
		expect(marked().sort((a, b) => a - b)).toEqual([40, 47, 52, 55, 59, 64]);
		expect(ex.key(64).getAttribute("aria-checked")).toBe("true"); // E4, a root in the shape
		expect(ex.key(76).getAttribute("aria-checked")).toBe("false"); // E5, not in the shape
		expect(ex.key(55).hasAttribute("data-exact")).toBe(true); // G3, the third
		expect(ex.key(67).hasAttribute("data-tone")).toBe(false); // G4, a third the shape never plays
		expect(sound.playChord).toHaveBeenCalledWith([40, 47, 52, 55, 59, 64], "piano");
		ex.unmount();
	});

	it("plays a major triad on a chromatic key with its accidental numeral", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(61).click()); // C#
		await ex.settle();
		expect(ex.readout()).toBe("C♯ · ♭II");
		expect(ex.key(61).textContent).toBe("♭II");
		expect(sound.playChord).toHaveBeenCalledWith([49, 53, 56, 61, 65], "piano");
		ex.unmount();
	});

	it("with a capo, fingers the shape below what is heard", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(64).click()); // Em heard
		await ex.settle();
		act(() => ex.toggle("Capo"));
		await ex.settle();
		// Capo 1: the same degree, fingered a fret lower — E♭m shapes in B major.
		expect(ex.readout()).toBe("Em · iii · E♭m shape");
		expect(ex.host.querySelector("svg[data-from-fret]")?.getAttribute("data-capo")).toBe("1");
		// The shape sits above the capo, muted strings marked at it.
		expect(ex.lit().every((m) => Number(m.split(":")[1].split("=")[0]) >= 1)).toBe(true);
		// Heard as Em: the E♭m shape a fret up sounds E3 B3 E4 G4 B4.
		expect(
			[...ex.host.querySelectorAll(".pk-board [data-selected], .pk-board [data-tone]")]
				.map((el) => Number((el as HTMLElement).dataset.midi))
				.sort((a, b) => a - b),
		).toEqual([52, 59, 64, 67, 71]);
		expect(ex.key(64).getAttribute("aria-checked")).toBe("true");
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
		expect(ex.readout()).toBe("Em · iii");
		act(() => ex.clickRadio("Key", "D"));
		await ex.settle();
		// Still the third degree, now F#m; the piano's selected key moved with it.
		expect(ex.readout()).toBe("F♯m · iii");
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
		act(() => ex.toggle("Capo"));
		await ex.settle();
		expect(ex.title()).toBe("C major · capo 1 · C (I)");
		ex.unmount();
	});

	it("leaves Scale mode as it was", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major" });
		await ex.settle();
		expect(ex.readout()).toBeNull();
		// The keyboard names pitches, not chord numerals.
		expect(ex.key(64).textContent).toBe("E4");
		expect(ex.key(60).textContent).toBe("C4"); // the tonic, named like the rest
		expect(ex.key(61).textContent).toBe(""); // Db is outside the scale
		expect(ex.lit().length).toBeGreaterThan(20); // the whole scale
		ex.unmount();
	});
});

describe("FretboardExplorer — playing the scale", () => {
	it("plays a five-fret box picked by right-pressing the neck", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() => ex.rightPress("0:5"));
		await ex.settle();
		// The box is outlined from there, and its notes are tinted on the neck.
		const frame = ex.host.querySelector(".fb-position") as SVGRectElement;
		expect(frame.getAttribute("x")).toBe(String(5 * 44));
		expect(ex.host.querySelectorAll("svg[data-from-fret] .fb-mark[data-run]").length).toBeGreaterThan(3);

		const [notes, spacing, voice] = runner.play.mock.calls[0];
		expect(notes[0]).toEqual({ string: 0, fret: 5, midi: 45 });
		expect(notes.every((n: { fret: number }) => n.fret >= 5 && n.fret <= 9)).toBe(true);
		expect(spacing).toBeCloseTo(60 / 90 / 2); // eighths at 90 BPM
		expect(voice).toBe("guitar");
		ex.unmount();
	});

	it("widens and narrows a position from the arrows beside the play button", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() => ex.rightPress("0:5"));
		await ex.settle();
		const width = () =>
			Number(ex.host.querySelector(".fb-position")!.getAttribute("width")) / 44;
		expect(width()).toBe(5);

		const step = (label: string) =>
			act(() =>
				ex.host.querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true })),
			);
		step("Widen this position");
		await ex.settle();
		expect(width()).toBe(6);
		for (let i = 0; i < 5; i++) step("Narrow this position");
		await ex.settle();
		// Three frets across six strings already hold every pitch class, so that
		// is as narrow as a position gets, and the arrow says it is spent.
		expect(width()).toBe(3);
		expect(ex.host.querySelector('[aria-label="Narrow this position"]')!.getAttribute("aria-disabled")).toBe("true");
		for (let i = 0; i < 7; i++) step("Widen this position");
		await ex.settle();
		expect(width()).toBe(7); // and at the widest
		expect(ex.host.querySelector('[aria-label="Widen this position"]')!.getAttribute("aria-disabled")).toBe("true");
		// The scale is still all there at the narrowest, so the run survives it.
		for (let i = 0; i < 4; i++) step("Narrow this position");
		await ex.settle();
		expect(ex.host.querySelectorAll("svg[data-from-fret] .fb-mark[data-run]").length).toBeGreaterThan(3);
		ex.unmount();
	});

	it("plays one string from its glyph, and a hand-picked box from a right press", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() =>
			ex.host
				.querySelector('[aria-label="Play the D string"]')!
				.dispatchEvent(new MouseEvent("click", { bubbles: true })),
		);
		await ex.settle();
		expect(runner.play.mock.calls[0][0].every((n: { string: number }) => n.string === 2)).toBe(true);

		runner.play.mockClear();
		act(() => ex.rightPress("0:9"));
		await ex.settle();
		// A box five frets wide starting where the press landed.
		expect(ex.host.querySelector(".fb-position")!.getAttribute("x")).toBe(String(9 * 44));
		expect(runner.play.mock.calls[0][0].every((n: { fret: number }) => n.fret >= 9 && n.fret <= 13)).toBe(true);
		ex.unmount();
	});

	it("clears the box from its own frame, and keeps it out of Chords mode", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() => ex.rightPress("0:3"));
		await ex.settle();
		expect(ex.host.querySelector(".fb-position")).not.toBeNull();
		// Play, narrow, widen, clear.
		expect([...ex.host.querySelectorAll(".fb-box-btn")].map((b) => b.getAttribute("aria-label"))).toEqual([
			"Play this position",
			"Narrow this position",
			"Widen this position",
			"Clear this position",
		]);

		act(() =>
			ex.host
				.querySelector('[aria-label="Play this position"]')!
				.dispatchEvent(new MouseEvent("click", { bubbles: true })),
		);
		await ex.settle();
		expect(runner.play).toHaveBeenCalled();

		act(() =>
			ex.host
				.querySelector('[aria-label="Clear this position"]')!
				.dispatchEvent(new MouseEvent("click", { bubbles: true })),
		);
		await ex.settle();
		expect(ex.host.querySelector(".fb-position")).toBeNull();
		ex.unmount();
	});

	it("cannot play with the sound off, and has no run controls in Chords mode", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		act(() => ex.toggle("Sound"));
		await ex.settle();
		act(() => ex.rightPress("0:5"));
		await ex.settle();
		expect(runner.play).not.toHaveBeenCalled();

		act(() => ex.toggle("Sound"));
		act(() => ex.clickRadio("Mode", "Chords"));
		await ex.settle();
		expect(ex.host.querySelector(".fb-position")).toBeNull();
		expect(ex.host.querySelector(".fb-string-play")).toBeNull();
		expect(ex.host.querySelector(".fb-box-btn")).toBeNull();
		ex.unmount();
	});
});

describe("FretboardExplorer — capo", () => {
	const fretsOf = (ex: ReturnType<typeof mount>) =>
		ex.lit().map((m) => Number(m.split(":")[1].split("=")[0]));

	it("stops the scale at the capo, and leaves the pitches above it alone", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major" });
		await ex.settle();
		expect(Math.min(...fretsOf(ex))).toBe(0);
		expect(ex.lit()).toContain("0:5=scaleTone"); // A on the low E

		act(() => ex.toggle("Capo"));
		await ex.settle();
		// Nothing behind the capo, and the capo fret is the new open string:
		// the low E at fret 1 sounds F, which is in C major.
		expect(Math.min(...fretsOf(ex))).toBe(1);
		expect(ex.lit()).toContain("0:1=scaleTone");
		// A fretted note above the capo is untouched — a capo does not transpose it.
		expect(ex.lit()).toContain("0:5=scaleTone");
		ex.unmount();
	});

});

describe("FretboardExplorer — key, piano and labels", () => {
	it("tints the scale's pitch classes on the piano, tonic selected, each named with its octave", async () => {
		const ex = mount({ initialRoot: "A", initialScale: "minorPentatonic" });
		await ex.settle();
		// Each scale key is named with its octave, so a register is readable.
		expect([57, 60, 62, 64, 67].map((m) => ex.key(m).textContent)).toEqual(["A3", "C4", "D4", "E4", "G4"]);
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

	it("puts each instrument's fader beside it, and the switch on the card", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major" });
		await ex.settle();
		const fader = (label: string) => ex.host.querySelector(`[role="slider"][aria-label="${label}"]`)!;
		// The app's own fader, not the browser's range input.
		expect(ex.host.querySelector('input[type="range"]')).toBeNull();
		expect(fader("Piano volume").getAttribute("aria-valuenow")).toBe("50");
		expect(fader("Guitar volume").getAttribute("aria-valuenow")).toBe("80");
		act(() => {
			fader("Guitar volume").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		});
		expect(sound.setVolume).toHaveBeenCalledWith("guitar", 0.79);
		// With the sound off there is nothing to balance.
		act(() => (ex.host.querySelector('[role="switch"][aria-label="Sound"]') as HTMLButtonElement).click());
		await ex.settle();
		expect(fader("Piano volume").getAttribute("tabindex")).toBe("-1");
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
		act(() => ex.clickRadio("Labels", "None"));
		await ex.settle();
		expect(labels()).toEqual([]);
		ex.unmount();
	});
});
