// A run is scheduled on the audio clock in one go, with a parallel timer per
// note to move the playhead. Both are computed from the same start time, so
// they cannot drift; the tests check the schedule, not the wall clock.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useScalePlayer, type ScalePlayer } from "@/components/fretboard/useScalePlayer";
import type { SlotNote } from "@/lib/fretboard/positions";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const guitar = vi.hoisted(() => ({ triggerChordPreview: vi.fn(), cancelStrums: vi.fn() }));
vi.mock("@/components/strum/useGuitarSampleLoader", () => guitar);
const piano = vi.hoisted(() => ({ triggerPianoNote: vi.fn(), cancelPianoNotes: vi.fn() }));
vi.mock("@/components/fretboard/pianoSampleLoader", () => piano);

const NOTES: SlotNote[] = [
	{ string: 0, fret: 5, midi: 45 },
	{ string: 0, fret: 8, midi: 48 },
	{ string: 1, fret: 5, midi: 50 },
];

const guitarBus = { id: "guitar-gain" } as unknown as AudioNode;
const pianoBus = { id: "piano-gain" } as unknown as AudioNode;
const ctx = { currentTime: 10 } as AudioContext;
const bus = () => ({ ctx, target: (v: "guitar" | "piano") => (v === "piano" ? pianoBus : guitarBus) });

function mount(onNote?: (note: SlotNote, index: number) => void) {
	let latest!: ScalePlayer;
	function Probe() {
		latest = useScalePlayer({ audio: bus, onNote });
		return null;
	}
	const host = document.createElement("div");
	let root!: Root;
	act(() => {
		root = createRoot(host);
		root.render(createElement(Probe));
	});
	return { player: () => latest, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
	vi.useFakeTimers();
	guitar.triggerChordPreview.mockReset();
	guitar.cancelStrums.mockReset();
	piano.triggerPianoNote.mockReset();
	piano.cancelPianoNotes.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useScalePlayer", () => {
	it("schedules every note ahead, evenly spaced, on the chosen voice's bus", () => {
		const { player, unmount } = mount();
		act(() => player().play(NOTES, 0.25, "guitar"));
		expect(player().isPlaying).toBe(true);
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(3);
		const calls = guitar.triggerChordPreview.mock.calls;
		expect(calls.map((c) => c[0])).toEqual([[45], [48], [50]]);
		expect(calls.every((c) => c[2] === guitarBus)).toBe(true);
		// One lead-in, then a quarter of a second between notes.
		const times = calls.map((c) => c[3]);
		expect(times[1] - times[0]).toBeCloseTo(0.25);
		expect(times[2] - times[1]).toBeCloseTo(0.25);
		expect(times[0]).toBeGreaterThan(ctx.currentTime);
		expect(piano.triggerPianoNote).not.toHaveBeenCalled();
		unmount();
	});

	it("plays both instruments when asked, each into its own bus", () => {
		const { player, unmount } = mount();
		act(() => player().play(NOTES, 0.25, "both"));
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(3);
		expect(piano.triggerPianoNote).toHaveBeenCalledTimes(3);
		expect(piano.triggerPianoNote.mock.calls.map((c) => c[0])).toEqual([45, 48, 50]);
		expect(piano.triggerPianoNote.mock.calls.every((c) => c[2] === pianoBus)).toBe(true);
		unmount();
	});

	it("moves the playhead note by note and clears it at the end", () => {
		const seen: number[] = [];
		const { player, unmount } = mount((_n, i) => seen.push(i));
		act(() => player().play(NOTES, 0.25, "piano"));
		expect(player().currentIndex).toBe(-1);
		act(() => vi.advanceTimersByTime(130)); // past the lead-in
		expect(player().currentIndex).toBe(0);
		act(() => vi.advanceTimersByTime(250));
		expect(player().currentIndex).toBe(1);
		act(() => vi.advanceTimersByTime(600));
		expect(seen).toEqual([0, 1, 2]);
		expect(player().isPlaying).toBe(false);
		expect(player().currentIndex).toBe(-1);
		unmount();
	});

	it("stops everything on stop, on a new run, and on unmount", () => {
		const { player, unmount } = mount();
		act(() => player().play(NOTES, 0.25, "both"));
		act(() => player().stop());
		expect(player().isPlaying).toBe(false);
		expect(guitar.cancelStrums).toHaveBeenCalled();
		expect(piano.cancelPianoNotes).toHaveBeenCalled();
		// The playhead does not fire after a stop.
		act(() => vi.advanceTimersByTime(2000));
		expect(player().currentIndex).toBe(-1);

		// A second run replaces the first rather than layering on it.
		act(() => player().play(NOTES, 0.25, "guitar"));
		guitar.cancelStrums.mockClear();
		act(() => player().play(NOTES, 0.25, "guitar"));
		expect(guitar.cancelStrums).toHaveBeenCalled();

		unmount();
		expect(guitar.cancelStrums).toHaveBeenCalledTimes(2);
	});

	it("does nothing without a bus or without notes", () => {
		let latest!: ScalePlayer;
		function Probe() {
			latest = useScalePlayer({ audio: () => null });
			return null;
		}
		const host = document.createElement("div");
		let root!: Root;
		act(() => {
			root = createRoot(host);
			root.render(createElement(Probe));
		});
		act(() => latest.play(NOTES, 0.25, "guitar"));
		expect(latest.isPlaying).toBe(false);
		expect(guitar.triggerChordPreview).not.toHaveBeenCalled();
		act(() => root.unmount());

		const { player, unmount } = mount();
		act(() => player().play([], 0.25, "guitar"));
		expect(player().isPlaying).toBe(false);
		unmount();
	});
});
