// Chords mode end to end, with the voicing library and the audio mocked: a
// piano key picks the chord on its degree, the neck shows only that shape,
// the readout names it, the capo shifts the shape but not what is heard.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import FretboardExplorer from "@/components/fretboard/FretboardExplorer";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import type { SequenceStep } from "@/lib/fretboard/sequence";

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
// The player is a stub with a playhead the tests move by hand: `play` and
// `stop` only record the call, and `advance` says which step is sounding.
type PlayerState = { isPlaying: boolean; currentIndex: number };
const runner = vi.hoisted(() => ({
	play: vi.fn(),
	stop: vi.fn(),
	advance: (() => {}) as (state: PlayerState) => void,
}));
vi.mock("@/components/fretboard/useSequencePlayer", async (original) => {
	const React = await import("react");
	return {
		...(await original<typeof import("@/components/fretboard/useSequencePlayer")>()),
		useSequencePlayer: () => {
			const [state, setState] = React.useState<PlayerState>({ isPlaying: false, currentIndex: -1 });
			runner.advance = setState;
			return { ...state, play: runner.play, stop: runner.stop };
		},
	};
});
vi.mock("@/components/strum/ChordPickerModal", () => ({ default: () => null }));

function voicing(frets: string, fingers = "000000", start_fret = 1): ChordVoicing {
	return {
		id: `${frets}@${start_fret}`,
		label: start_fret === 1 ? "Standard" : null,
		start_fret,
		barre_fret: null,
		capo: false,
		frets,
		fingers,
	};
}
const LIBRARY: Record<string, ChordVoicing[]> = {
	// C has a second shape up the neck: a triad at the fifth fret topping out on C5.
	"C major": [voicing("x32010"), voicing("xx1114", "000000", 5)],
	"E minor": [voicing("022000")],
	"D minor": [voicing("xx0231")],
	"C# major": [voicing("x43121")],
	"F# minor": [voicing("244222")],
	"Eb minor": [voicing("x68876")],
	"D major": [voicing("xx0232")],
	"A m7": [voicing("x02010")],
};
// The Shape field's name index and grip corpus, served without the network.
const INDEX = [
	...Object.keys(LIBRARY).map((k) => ({ root: k.split(" ")[0], suffix: k.split(" ")[1] })),
	{ root: "D", suffix: "7" }, // in the index, but the library has no shape for it
];
vi.mock("@/lib/chords", () => ({ getChordIndex: async () => INDEX }));
vi.mock("@/components/chords/useChordShapeMatches", () => ({
	useChordShapeCorpus: () =>
		Object.entries(LIBRARY).map(([k, chord_voicings]) => ({
			root: k.split(" ")[0],
			suffix: k.split(" ")[1],
			chord_voicings,
		})),
}));
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
		// The readout is two fields with a numeral between: read it as "D · V · C shape".
		readout: () => {
			const box = host.querySelector("[data-testid='chord-readout']");
			if (!box) return null;
			const parts = [box.querySelector<HTMLInputElement>('input[aria-label="Chord"]')!.value];
			const numeral = box.querySelector("[data-testid='numeral']")?.textContent;
			if (numeral) parts.push(numeral);
			const shape = box.querySelector<HTMLInputElement>('input[aria-label="Shape"]');
			if (shape) parts.push(`${shape.value} shape`);
			if (box.querySelector("[data-testid='no-voicing']")) parts.push("no voicing");
			return parts.join(" · ");
		},
		chordNotes: () =>
			host.querySelector("[data-testid='chord-readout'] > div:nth-child(2)")?.textContent?.trim() ?? null,
		button: (label: string) => q<HTMLButtonElement>(`button[aria-label="${label}"]`),
		/** Type into one of the readout's fields and take the top match with Enter. */
		search: (field: "Chord" | "Shape", text: string) => {
			const input = q<HTMLInputElement>(`input[aria-label="${field}"]`);
			act(() => {
				input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
				Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
			act(() => {
				input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			});
		},
		/** The strip's chips as "numeral name", in order. */
		strip: () =>
			[...host.querySelectorAll<HTMLElement>("[data-testid='progression-strip'] [data-bar] > div")].map((el) =>
				[...el.children].map((s) => s.textContent?.trim()).join(" "),
			),
		currentBar: () =>
			host.querySelector<HTMLElement>("[data-testid='progression-strip'] [data-current]")?.dataset.bar ?? null,
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
		expect(ex.key(60).textContent).toBe("I₄"); // every C still says which octave it is
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

	it("holds the shape nearest the octave of the key pressed", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(48).click()); // C3: the open C
		await ex.settle();
		expect(ex.lit().sort()).toEqual(["0:0=muted", "1:3=root", "2:2=chordTone", "3:0=chordTone", "4:1=root", "5:0=chordTone"].sort());
		act(() => ex.key(72).click()); // C5: the triad at the fifth fret, topping out on that key
		await ex.settle();
		expect(ex.readout()).toBe("C · I");
		expect(ex.lit().sort()).toEqual(["0:0=muted", "1:0=muted", "2:5=chordTone", "3:5=root", "4:5=chordTone", "5:8=root"].sort());
		expect(
			[...ex.host.querySelectorAll(".pk-board [data-selected], .pk-board [data-tone]")]
				.map((el) => Number((el as HTMLElement).dataset.midi))
				.sort((a, b) => a - b),
		).toEqual([55, 60, 64, 72]);
		expect(sound.playChord).toHaveBeenLastCalledWith([55, 60, 64, 72], "piano");
		// The register outlives a key change: I in D has one shape, so it is that one.
		act(() => ex.clickRadio("Key", "D"));
		await ex.settle();
		expect(ex.readout()).toBe("D · I");
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
		expect(ex.key(60).textContent).toBe("C4"); // C is chromatic in D major, and still marks its octave
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

		const [steps, spacing, voice] = runner.play.mock.calls[0];
		expect(steps[0]).toEqual({ midis: [45], slots: [{ string: 0, fret: 5 }] });
		expect(steps.every((s: SequenceStep) => s.slots[0].fret >= 5 && s.slots[0].fret <= 9)).toBe(true);
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
		expect(runner.play.mock.calls[0][0].every((s: SequenceStep) => s.slots[0].string === 2)).toBe(true);

		runner.play.mockClear();
		act(() => ex.rightPress("0:9"));
		await ex.settle();
		// A box five frets wide starting where the press landed.
		expect(ex.host.querySelector(".fb-position")!.getAttribute("x")).toBe(String(9 * 44));
		expect(runner.play.mock.calls[0][0].every((s: SequenceStep) => s.slots[0].fret >= 9 && s.slots[0].fret <= 13)).toBe(true);
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

describe("FretboardExplorer — progression", () => {
	it("builds a strip from the degree buttons and presets, names each bar from the key, removes and clears", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		expect(ex.host.querySelector("[data-testid='progression-panel']")).not.toBeNull();
		expect(ex.strip()).toEqual([]);
		for (const numeral of ["I", "V", "vi", "IV"]) act(() => ex.button(`Add ${numeral}`).click());
		expect(ex.strip()).toEqual(["I C", "V G", "vi Am", "IV F"]);
		act(() => ex.button("Remove bar 2").click());
		expect(ex.strip()).toEqual(["I C", "vi Am", "IV F"]);
		// A preset replaces the strip, its degrees read through the key.
		act(() => [...ex.host.querySelectorAll("button")].find((b) => b.textContent === "ii–V–I")!.click());
		expect(ex.strip()).toEqual(["ii Dm", "V G", "I C"]);
		act(() => [...ex.host.querySelectorAll("button")].find((b) => b.textContent === "Clear")!.click());
		expect(ex.strip()).toEqual([]);
		ex.unmount();
	});

	it("loops the strip, one strum per bar at the tempo, sounding each bar's standard shape", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		for (const numeral of ["I", "ii", "iii"]) act(() => ex.button(`Add ${numeral}`).click());
		act(() => ex.button("Play progression").click());
		await ex.settle();
		expect(runner.play).toHaveBeenCalledTimes(1);
		const [steps, spacing, voice, options] = runner.play.mock.calls[0];
		expect(steps.map((s: SequenceStep) => s.midis)).toEqual([
			[48, 52, 55, 60, 64], // C x32010
			[50, 57, 62, 65], // Dm xx0231
			[40, 47, 52, 55, 59, 64], // Em 022000
		]);
		expect(steps[1].slots).toEqual([
			{ string: 2, fret: 0 },
			{ string: 3, fret: 2 },
			{ string: 4, fret: 3 },
			{ string: 5, fret: 1 },
		]);
		expect(spacing).toBeCloseTo((60 / 90) * 4); // four beats a bar at 90 BPM
		expect(voice).toBe("guitar");
		expect(options).toEqual({ loop: true });
		expect(ex.host.querySelector("[data-testid='tempo-readout']")?.textContent).toBe("90 BPM");
		ex.unmount();
	});

	it("transposes the strip when the key changes and keeps the numerals, a chromatic one included", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.button("Add I").click());
		act(() => ex.button("Add ♭VII").click());
		expect(ex.strip()).toEqual(["I C", "♭VII B♭"]);
		act(() => ex.clickRadio("Key", "D"));
		expect(ex.strip()).toEqual(["I D", "♭VII C"]);
		// In a minor key the same degree buttons carry the key's qualities, and
		// the interval that was ♭VII in major is the key's own VII now.
		act(() => ex.setSelect("Scale", "naturalMinor"));
		expect(ex.button("Add i")).not.toBeNull();
		expect(ex.strip()).toEqual(["i Dm", "VII C"]);
		ex.unmount();
	});

	it("with a capo, sounds the heard chord from the shape fingered below it", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.button("Add iii").click());
		act(() => ex.toggle("Capo"));
		await ex.settle();
		expect(ex.strip()).toEqual(["iii Em"]); // the numeral and the heard chord do not move
		act(() => ex.button("Play progression").click());
		await ex.settle();
		const [steps] = runner.play.mock.calls[0];
		// The E♭m shape a fret up sounds E3 B3 E4 G4 B4.
		expect(steps[0].midis).toEqual([52, 59, 64, 67, 71]);
		expect(steps[0].slots.every((s: { fret: number }) => s.fret >= 1)).toBe(true);
		ex.unmount();
	});

	it("keeps a bar the library has no shape for, silent", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.button("Add I").click());
		act(() => ex.button("Add vi").click()); // no A minor in the fixture library
		act(() => ex.button("Play progression").click());
		await ex.settle();
		const [steps] = runner.play.mock.calls[0];
		expect(steps).toHaveLength(2);
		expect(steps[1]).toEqual({ midis: [], slots: [] });
		ex.unmount();
	});

	it("lights the sounding bar on the strip, the neck and the piano, and returns to the picked chord on stop", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.button("Add I").click());
		act(() => ex.button("Add iii").click());
		act(() => ex.button("Play progression").click());
		await ex.settle();
		act(() => runner.advance({ isPlaying: true, currentIndex: 1 }));
		await ex.settle();
		expect(ex.currentBar()).toBe("1");
		expect(ex.readout()).toBe("Em · iii");
		expect(ex.lit().sort()).toEqual(["0:0=root", "1:2=chordTone", "2:2=root", "3:0=chordTone", "4:0=chordTone", "5:0=root"].sort());
		expect(ex.key(64).getAttribute("aria-checked")).toBe("true");
		// Stop: the strip stays, the chord picked before play is back.
		act(() => ex.button("Stop progression").click());
		expect(runner.stop).toHaveBeenCalled();
		act(() => runner.advance({ isPlaying: false, currentIndex: -1 }));
		await ex.settle();
		expect(ex.currentBar()).toBeNull();
		expect(ex.readout()).toBe("C · I");
		expect(ex.strip()).toEqual(["I C", "iii Em"]);
		ex.unmount();
	});

	it("stops when the key, the capo, the mode or the strip changes, and cannot play with the sound off", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.button("Add I").click());
		const stopsAfter = async (change: () => void) => {
			runner.stop.mockClear();
			act(change);
			await ex.settle();
			return runner.stop.mock.calls.length > 0;
		};
		expect(await stopsAfter(() => ex.clickRadio("Key", "G"))).toBe(true);
		expect(await stopsAfter(() => ex.toggle("Capo"))).toBe(true);
		expect(await stopsAfter(() => ex.button("Add V").click())).toBe(true);
		expect(await stopsAfter(() => ex.clickRadio("Mode", "Scale"))).toBe(true);
		expect(ex.host.querySelector("[data-testid='progression-panel']")).toBeNull();
		act(() => ex.clickRadio("Mode", "Chords"));
		await ex.settle();
		expect(ex.strip()).toEqual(["I G", "V D"]); // the strip survives a trip through Scale mode
		act(() => ex.toggle("Sound"));
		expect(ex.button("Play progression").disabled).toBe(true);
		ex.unmount();
	});
});

describe("FretboardExplorer — a hand position in Chords mode", () => {
	const chips = (ex: ReturnType<typeof mount>) =>
		[...ex.host.querySelectorAll<HTMLButtonElement>("[data-testid='position-chords'] button")].map(
			(b) => `${b.querySelector("span")?.textContent} ${b.querySelectorAll("span")[1]?.textContent}`,
		);
	const note = (ex: ReturnType<typeof mount>) =>
		ex.host.querySelector("[data-testid='position-note']")?.textContent ?? null;

	it("raises a frame on a right-press and lists the degrees with a shape inside it", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.rightPress("0:0"));
		await ex.settle();
		expect(ex.host.querySelector(".fb-position")?.getAttribute("x")).toBe("0");
		expect(ex.host.textContent).toContain("Position 0–4");
		// The fixture library holds C, Dm and Em at the nut; the rest of the key has no shape.
		expect(chips(ex)).toEqual(["I C", "ii Dm", "iii Em"]);
		expect(note(ex)).toBeNull();
		// The picked chord is untouched until a numeral is pressed.
		expect(ex.readout()).toBe("C · I");
		ex.unmount();
	});

	it("lights and strums the listed shape when its numeral is pressed, and the piano shows what sounds", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.rightPress("0:0"));
		await ex.settle();
		act(() => ex.button("Play ii here").click());
		await ex.settle();
		expect(ex.readout()).toBe("Dm · ii");
		expect(ex.lit().sort()).toEqual(["0:0=muted", "1:0=muted", "2:0=root", "3:2=chordTone", "4:3=root", "5:1=chordTone"].sort());
		expect(sound.playChord).toHaveBeenCalledWith([50, 57, 62, 65], "guitar");
		expect(ex.key(62).getAttribute("aria-checked")).toBe("true"); // D4, a root the shape sounds
		expect(ex.button("Play ii here").getAttribute("aria-pressed")).toBe("true");
		ex.unmount();
	});

	it("says so when fewer than two degrees fit, and re-derives the list for the capo", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.rightPress("0:5"));
		await ex.settle();
		expect(ex.host.textContent).toContain("Position 5–9");
		// Only C has a shape up here, the triad at the fifth fret.
		expect(chips(ex)).toEqual(["I C"]);
		expect(note(ex)).toBe("Only I fits here.");
		// Capo 1: the frame is on the fingered neck, where iii is an E♭m shape at
		// frets 6–8 held above the capo — inside the frame, and heard as Em.
		act(() => ex.toggle("Capo"));
		await ex.settle();
		expect(chips(ex)).toEqual(["iii Em"]);
		expect(note(ex)).toBe("Only iii fits here.");
		ex.unmount();
	});

	it("walks the position's chords once through from the frame's play button, lighting each in turn", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.rightPress("0:0"));
		await ex.settle();
		// The frame's button is an SVG group, so it is clicked by event rather than by method.
		const frameButton = (label: string) => ex.host.querySelector(`[aria-label="${label}"]`);
		act(() => frameButton("Play this position")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		await ex.settle();
		expect(runner.play).toHaveBeenCalledTimes(1);
		const [steps, spacing, voice, options] = runner.play.mock.calls[0];
		expect(steps.map((s: SequenceStep) => s.midis)).toEqual([
			[48, 52, 55, 60, 64],
			[50, 57, 62, 65],
			[40, 47, 52, 55, 59, 64],
		]);
		expect(spacing).toBeCloseTo((60 / 90) * 4);
		expect(voice).toBe("guitar");
		expect(options).toBeUndefined(); // once through, not a loop
		act(() => runner.advance({ isPlaying: true, currentIndex: 2 }));
		await ex.settle();
		expect(ex.readout()).toBe("Em · iii");
		expect(frameButton("Stop this position")).not.toBeNull();
		expect(ex.currentBar()).toBeNull(); // the strip is not what is playing
		ex.unmount();
	});

	it("re-lists the frame for a new key, and clears it on a mode change", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.rightPress("0:0"));
		await ex.settle();
		act(() => ex.clickRadio("Key", "G"));
		await ex.settle();
		// G major at the nut: the fixture has C (IV), D (V) and Em (vi).
		expect(chips(ex)).toEqual(["IV C", "V D", "vi Em"]);
		act(() => ex.clickRadio("Mode", "Scale"));
		act(() => ex.clickRadio("Mode", "Chords"));
		await ex.settle();
		expect(ex.host.querySelector(".fb-position")).toBeNull();
		expect(ex.host.querySelector("[data-testid='position-chords']")).toBeNull();
		ex.unmount();
	});
});

describe("FretboardExplorer — the readout's two fields", () => {
	const pianoMarked = (ex: ReturnType<typeof mount>) =>
		[...ex.host.querySelectorAll(".pk-board [data-selected], .pk-board [data-tone]")]
			.map((el) => Number((el as HTMLElement).dataset.midi))
			.sort((a, b) => a - b);

	it("follows a key press in both fields, and shows the shape field only with a capo", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		expect(ex.host.querySelector('input[aria-label="Shape"]')).toBeNull();
		act(() => ex.key(64).click()); // iii
		await ex.settle();
		expect(ex.readout()).toBe("Em · iii");
		act(() => ex.toggle("Capo"));
		await ex.settle();
		expect(ex.readout()).toBe("Em · iii · E♭m shape");
		ex.unmount();
	});

	it("names a searched chord, draws its voicing, lights what it sounds, strums it, and gives its numeral in the key", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		ex.search("Chord", "am7");
		await ex.settle();
		expect(ex.readout()).toBe("Am7 · vi");
		expect(ex.title()).toContain("Am7 (vi)");
		// x02010: A2 E3 G3 C4 E4.
		expect(ex.lit().sort()).toEqual(["0:0=muted", "1:0=root", "2:2=chordTone", "3:0=chordTone", "4:1=chordTone", "5:0=chordTone"].sort());
		expect(pianoMarked(ex)).toEqual([45, 52, 55, 60, 64]);
		expect(sound.playChord).toHaveBeenCalledWith([45, 52, 55, 60, 64], "guitar");
		ex.unmount();
	});

	it("holds a shape typed into the shape field: what sounds moves up by the capo, and the key has no numeral for it", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.toggle("Capo"));
		await ex.settle();
		ex.search("Shape", "am7");
		await ex.settle();
		// The shape does not move; what it sounds does. B♭m7 is not C major's chord.
		expect(ex.readout()).toBe("B♭m7 · Am7 shape");
		expect(pianoMarked(ex)).toEqual([46, 53, 56, 61, 65]);
		expect(ex.lit().every((m) => Number(m.split(":")[1].split("=")[0]) >= 1)).toBe(true);
		ex.unmount();
	});

	it("finds the shape for a chord typed into the chord field: the shape sits the capo's distance below", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.toggle("Capo"));
		await ex.settle();
		ex.search("Chord", "d");
		await ex.settle();
		// D heard at capo 1 is a C♯ shape (x43121), and D major's F♯ is not C major's.
		expect(ex.readout()).toBe("D · C♯ shape");
		expect(pianoMarked(ex)).toEqual([50, 54, 57, 62, 66]);
		expect(sound.playChord).toHaveBeenCalledWith([50, 54, 57, 62, 66], "guitar");
		ex.unmount();
	});

	it("resolves a written grip to the chord held that way", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		// Typed the way a tab reads, first string first: x02010 low to high.
		ex.search("Chord", "01020x");
		await ex.settle();
		expect(ex.readout()).toBe("Am7 · vi");
		ex.unmount();
	});

	it("returns to the last degree pressed when a field is cleared, or when a key is pressed", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		act(() => ex.key(64).click()); // iii
		await ex.settle();
		ex.search("Chord", "am7");
		await ex.settle();
		expect(ex.readout()).toBe("Am7 · vi");
		act(() => ex.button("Clear Chord").click());
		await ex.settle();
		expect(ex.readout()).toBe("Em · iii");
		ex.search("Chord", "am7");
		await ex.settle();
		act(() => ex.key(62).click()); // ii
		await ex.settle();
		expect(ex.readout()).toBe("Dm · ii");
		ex.unmount();
	});

	it("says when the library has no shape for the chord", async () => {
		const ex = mount({ initialRoot: "C", initialScale: "major", initialMode: "chords" });
		await ex.settle();
		ex.search("Chord", "d7");
		await ex.settle();
		expect(ex.readout()).toBe("D7 · no voicing");
		expect(ex.lit()).toEqual([]);
		ex.unmount();
	});
});
