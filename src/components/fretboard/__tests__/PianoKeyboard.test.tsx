import { describe, it, expect, vi } from "vitest";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";

import PianoKeyboard, {
	type PianoKeyboardHandle,
	type PianoKeyboardProps,
} from "@/components/fretboard/PianoKeyboard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const GUITAR = { fromMidi: 40, toMidi: 86 };

function mount(props: Partial<PianoKeyboardProps> = {}) {
	const host = document.createElement("div");
	document.body.appendChild(host);
	let root!: Root;
	const render = (p: Partial<PianoKeyboardProps>) =>
		act(() => {
			root.render(<PianoKeyboard selectedPitchClass={9} range={GUITAR} onSelect={() => {}} {...props} {...p} />);
		});
	act(() => {
		root = createRoot(host);
	});
	render({});
	return {
		host,
		render,
		key: (midi: number) => host.querySelector(`[data-midi="${midi}"]`) as HTMLButtonElement,
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

describe("PianoKeyboard", () => {
	it("renders 61 radio keys C2–C7, black ones marked", () => {
		const kb = mount();
		const radios = kb.host.querySelectorAll('[role="radio"]');
		expect(radios).toHaveLength(61);
		expect(kb.host.querySelectorAll("[data-black]")).toHaveLength(25);
		expect(kb.key(36).getAttribute("aria-label")).toBe("C2");
		expect(kb.key(96).getAttribute("aria-label")).toBe("C7");
		expect(kb.key(61).hasAttribute("data-black")).toBe(true);
		expect(kb.host.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Scale root");
		kb.unmount();
	});

	it("checks every key of the selected pitch class and only those", () => {
		const kb = mount({ selectedPitchClass: 9 }); // A
		const checked = [...kb.host.querySelectorAll('[aria-checked="true"]')].map((el) =>
			Number(el.getAttribute("data-midi")),
		);
		expect(checked).toEqual([45, 57, 69, 81, 93]);
		expect(kb.key(45).textContent).toBe("A");
		expect(kb.key(46).getAttribute("aria-checked")).toBe("false");
		kb.render({ selectedPitchClass: 1 }); // Db
		expect(kb.key(45).getAttribute("aria-checked")).toBe("false");
		expect(kb.key(61).getAttribute("aria-checked")).toBe("true");
		expect(kb.key(61).textContent).toBe("D♭");
		kb.unmount();
	});

	it("dims keys outside the range but leaves them selectable", () => {
		const onSelect = vi.fn();
		const kb = mount({ onSelect });
		const outside = [...kb.host.querySelectorAll("[data-outside]")].map((el) => Number(el.getAttribute("data-midi")));
		expect(outside).toEqual([36, 37, 38, 39, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96]);
		act(() => kb.key(36).click());
		expect(onSelect).toHaveBeenCalledWith(36);
		kb.unmount();
	});

	it("reports the pressed key's midi", () => {
		const onSelect = vi.fn();
		const kb = mount({ onSelect });
		act(() => kb.key(66).click());
		expect(onSelect).toHaveBeenLastCalledWith(66);
		act(() => kb.key(60).click());
		expect(onSelect).toHaveBeenLastCalledWith(60);
		kb.unmount();
	});

	it("labels each octave's C, and puts the tab stop on the lowest selected key in range", () => {
		const kb = mount({ selectedPitchClass: 0 });
		expect(kb.key(48).textContent).toBe("C"); // selected: its name
		kb.render({ selectedPitchClass: 9 });
		expect(kb.key(48).textContent).toBe("C3"); // not selected: octave marker
		expect(kb.key(50).textContent).toBe("");
		expect(kb.key(45).getAttribute("tabindex")).toBe("0"); // A2, in range
		expect(kb.key(57).getAttribute("tabindex")).toBe("-1");
		expect(kb.key(36).getAttribute("tabindex")).toBe("-1");
		kb.unmount();
	});

	it("moves and selects with the radio-group keys", () => {
		const onSelect = vi.fn();
		const kb = mount({ onSelect, selectedPitchClass: 9 });
		const press = (midi: number, key: string) =>
			act(() => {
				kb.key(midi).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
			});
		press(45, "ArrowRight");
		expect(onSelect).toHaveBeenLastCalledWith(46);
		press(45, "ArrowLeft");
		expect(onSelect).toHaveBeenLastCalledWith(44);
		press(45, "End");
		expect(onSelect).toHaveBeenLastCalledWith(96);
		press(45, "Home");
		expect(onSelect).toHaveBeenLastCalledWith(36);
		press(36, "ArrowLeft"); // already at the start: nothing
		expect(onSelect).toHaveBeenCalledTimes(4);
		kb.unmount();
	});

	it("follows a hovered pitch: the exact key rings, its octaves ring fainter, null clears", () => {
		const handle = createRef<PianoKeyboardHandle>();
		const kb = mount({ ref: handle });
		act(() => handle.current!.highlight(60)); // C4
		expect(kb.key(60).getAttribute("data-hover")).toBe("self");
		expect(kb.key(48).getAttribute("data-hover")).toBe("octave");
		expect(kb.key(72).getAttribute("data-hover")).toBe("octave");
		expect(kb.key(62).hasAttribute("data-hover")).toBe(false);
		expect(kb.host.querySelectorAll("[data-hover]")).toHaveLength(6); // C2..C7
		act(() => handle.current!.highlight(64)); // E4: the old rings go
		expect(kb.key(60).hasAttribute("data-hover")).toBe(false);
		expect(kb.key(64).getAttribute("data-hover")).toBe("self");
		act(() => handle.current!.highlight(null));
		expect(kb.host.querySelectorAll("[data-hover]")).toHaveLength(0);
		kb.unmount();
	});

	it("flashes a struck key for a moment, restarting on a re-strike", async () => {
		vi.useFakeTimers();
		try {
			const handle = createRef<PianoKeyboardHandle>();
			const kb = mount({ ref: handle });
			act(() => handle.current!.strike(45));
			expect(kb.key(45).hasAttribute("data-struck")).toBe(true);
			act(() => vi.advanceTimersByTime(200));
			act(() => handle.current!.strike(45));
			act(() => vi.advanceTimersByTime(200));
			expect(kb.key(45).hasAttribute("data-struck")).toBe(true); // restarted, not expired
			act(() => vi.advanceTimersByTime(150));
			expect(kb.key(45).hasAttribute("data-struck")).toBe(false);
			kb.unmount();
		} finally {
			vi.useRealTimers();
		}
	});

	it("prints custom labels and greys the keys the caller dims, which stay pressable", () => {
		const onSelect = vi.fn();
		const kb = mount({
			onSelect,
			selectedPitchClass: 0,
			labelFor: (key, selected) => (key.pitchClass === 0 ? (selected ? "I" : "?") : key.pitchClass === 7 ? "V" : ""),
			dimmed: (key) => key.pitchClass === 1,
		});
		expect(kb.key(60).textContent).toBe("I");
		expect(kb.key(67).textContent).toBe("V");
		expect(kb.key(62).textContent).toBe("");
		expect(kb.key(61).hasAttribute("data-dimmed")).toBe(true);
		expect(kb.key(62).hasAttribute("data-dimmed")).toBe(false);
		act(() => kb.key(61).click());
		expect(onSelect).toHaveBeenCalledWith(61);
		kb.unmount();
	});

	it("uncovers one octave of scale dots under the pointer, and clears on leaving", () => {
		const kb = mount({ selectedPitchClass: 9, tonePitchClasses: [9, 0, 2, 4, 7] }); // A minor pentatonic
		const dotted = () =>
			[...kb.host.querySelectorAll("[data-scale]")].map((el) => Number((el as HTMLElement).dataset.midi));
		// Every scale key carries a dot in the DOM; none is uncovered yet.
		expect(kb.host.querySelectorAll(".pk-dot").length).toBe(21);
		expect(dotted()).toEqual([]);

		const over = (el: Element) =>
			act(() => {
				el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerId: 1 }));
			});
		over(kb.key(60)); // C4
		expect(dotted()).toEqual([60, 62, 64, 67]); // C D E G of that octave, not the A
		over(kb.key(48)); // C3: the previous octave goes dark
		expect(dotted()).toEqual([48, 50, 52, 55]);

		// Moving between keys of one octave keeps them uncovered.
		over(kb.key(50));
		expect(dotted()).toEqual([48, 50, 52, 55]);
		// Leaving the keys entirely covers them again.
		act(() => {
			kb.key(50).dispatchEvent(
				new PointerEvent("pointerout", { bubbles: true, pointerId: 1, relatedTarget: null }),
			);
		});
		expect(dotted()).toEqual([]);
		kb.unmount();
	});

	it("uncovers a chord's other notes in the hovered octave too", () => {
		const kb = mount({ selectedPitchClass: 4, tonePitchClasses: [4, 7, 11] }); // Em
		expect(kb.host.querySelectorAll(".pk-dot").length).toBe(10); // G and B in five octaves
		expect(kb.host.querySelectorAll("[data-scale]").length).toBe(0);
		act(() => {
			kb.key(64).dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerId: 1 }));
		});
		// The root is filled, its third and fifth in that octave are dotted.
		expect([...kb.host.querySelectorAll("[data-scale]")].map((e) => (e as HTMLElement).dataset.midi)).toEqual([
			"67",
			"71",
		]);
		kb.unmount();
	});

	it("tints the other members of a chord, leaving the root selected", () => {
		const kb = mount({ selectedPitchClass: 0, tonePitchClasses: [0, 4, 7] });
		expect(kb.key(60).hasAttribute("data-tone")).toBe(false); // the root: selected instead
		expect(kb.key(64).hasAttribute("data-tone")).toBe(true);
		expect(kb.key(67).hasAttribute("data-tone")).toBe(true);
		expect(kb.key(62).hasAttribute("data-tone")).toBe(false);
		kb.unmount();
	});

	it("draws the range as a band labelled with its ends", () => {
		const kb = mount();
		expect(kb.host.querySelector(".pk-band")?.textContent).toBe("Guitar E2 – D6");
		expect(mount({ range: undefined }).host.querySelector(".pk-band")).toBeNull();
		kb.unmount();
	});
});
