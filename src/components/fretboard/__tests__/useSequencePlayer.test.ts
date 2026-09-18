// A sequence is scheduled on the audio clock a pass at a time, with a parallel
// timer per step to move the playhead. Both are computed from the same start
// time, so they cannot drift; the tests check the schedule, not the wall clock.
// The fake context's clock follows the fake timers, so a loop's second pass
// lands where the first one ends.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useSequencePlayer, type SequencePlayer } from "@/components/fretboard/useSequencePlayer";
import { noteSteps, type SequenceStep } from "@/lib/fretboard/sequence";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const guitar = vi.hoisted(() => ({ triggerChordPreview: vi.fn(), cancelStrums: vi.fn() }));
vi.mock("@/components/strum/useGuitarSampleLoader", () => guitar);
const piano = vi.hoisted(() => ({ triggerPianoNote: vi.fn(), cancelPianoNotes: vi.fn() }));
vi.mock("@/components/fretboard/pianoSampleLoader", () => piano);

const NOTES: SequenceStep[] = noteSteps([
	{ string: 0, fret: 5, midi: 45 },
	{ string: 0, fret: 8, midi: 48 },
	{ string: 1, fret: 5, midi: 50 },
]);
const CHORDS: SequenceStep[] = [
	{ midis: [48, 52, 55], slots: [{ string: 1, fret: 3 }, { string: 2, fret: 2 }, { string: 3, fret: 0 }] },
	{ midis: [43, 47, 50], slots: [{ string: 0, fret: 3 }, { string: 1, fret: 2 }, { string: 2, fret: 0 }] },
];

const guitarBus = { id: "guitar-gain" } as unknown as AudioNode;
const pianoBus = { id: "piano-gain" } as unknown as AudioNode;
let ctx: AudioContext;
const bus = () => ({ ctx, target: (v: "guitar" | "piano") => (v === "piano" ? pianoBus : guitarBus) });

function mount(onStep?: (step: SequenceStep, index: number) => void) {
	let latest!: SequencePlayer;
	function Probe() {
		latest = useSequencePlayer({ audio: bus, onStep });
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

const guitarTimes = () => guitar.triggerChordPreview.mock.calls.map((c) => c[3] as number);

beforeEach(() => {
	vi.useFakeTimers();
	// The audio clock starts at 10 s and advances with the fake timers.
	const t0 = Date.now();
	ctx = {
		get currentTime() {
			return 10 + (Date.now() - t0) / 1000;
		},
	} as AudioContext;
	guitar.triggerChordPreview.mockReset();
	guitar.cancelStrums.mockReset();
	piano.triggerPianoNote.mockReset();
	piano.cancelPianoNotes.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useSequencePlayer", () => {
	it("schedules every step ahead, evenly spaced, on the chosen voice's bus", () => {
		const { player, unmount } = mount();
		act(() => player().play(NOTES, 0.25, "guitar"));
		expect(player().isPlaying).toBe(true);
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(3);
		const calls = guitar.triggerChordPreview.mock.calls;
		expect(calls.map((c) => c[0])).toEqual([[45], [48], [50]]);
		expect(calls.every((c) => c[2] === guitarBus)).toBe(true);
		// One lead-in, then a quarter of a second between steps.
		const times = guitarTimes();
		expect(times[1] - times[0]).toBeCloseTo(0.25);
		expect(times[2] - times[1]).toBeCloseTo(0.25);
		expect(times[0]).toBeGreaterThan(ctx.currentTime);
		expect(piano.triggerPianoNote).not.toHaveBeenCalled();
		unmount();
	});

	it("sounds a chord step as one strum on the guitar and one key per pitch on the piano", () => {
		const { player, unmount } = mount();
		act(() => player().play(CHORDS, 2, "both"));
		expect(guitar.triggerChordPreview.mock.calls.map((c) => c[0])).toEqual([[48, 52, 55], [43, 47, 50]]);
		expect(piano.triggerPianoNote.mock.calls.map((c) => c[0])).toEqual([48, 52, 55, 43, 47, 50]);
		expect(piano.triggerPianoNote.mock.calls.every((c) => c[2] === pianoBus)).toBe(true);
		// The three keys of a chord land at the same instant.
		const pianoTimes = piano.triggerPianoNote.mock.calls.map((c) => c[3] as number);
		expect(pianoTimes[0]).toBe(pianoTimes[2]);
		expect(pianoTimes[3] - pianoTimes[0]).toBeCloseTo(2);
		unmount();
	});

	it("moves the playhead step by step and clears it at the end", () => {
		const seen: number[] = [];
		const { player, unmount } = mount((_s, i) => seen.push(i));
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

	it("loops: the next pass starts where the last ends, and the playhead cycles", () => {
		const seen: number[] = [];
		const { player, unmount } = mount((_s, i) => seen.push(i));
		act(() => player().play(CHORDS, 1, "guitar", { loop: true }));
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(2);
		const first = guitarTimes();
		// The second pass is placed a lead-in before the first runs out, which
		// is one pass after it was placed…
		act(() => vi.advanceTimersByTime(2010));
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(4);
		const second = guitarTimes().slice(2);
		// …and starts exactly one pass after it, however the timers landed.
		expect(second[0]).toBeCloseTo(first[0] + 2, 5);
		expect(second[1]).toBeCloseTo(first[1] + 2, 5);
		act(() => vi.advanceTimersByTime(2000));
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(6);
		expect(seen).toEqual([0, 1, 0, 1]);
		expect(player().isPlaying).toBe(true);
		unmount();
	});

	it("stops everything on stop, on a new sequence, and on unmount — a loop included", () => {
		const { player, unmount } = mount();
		act(() => player().play(CHORDS, 1, "both", { loop: true }));
		act(() => vi.advanceTimersByTime(3000));
		act(() => player().stop());
		expect(player().isPlaying).toBe(false);
		expect(guitar.cancelStrums).toHaveBeenCalled();
		expect(piano.cancelPianoNotes).toHaveBeenCalled();
		// Neither the playhead nor another pass fires after a stop.
		const scheduled = guitar.triggerChordPreview.mock.calls.length;
		act(() => vi.advanceTimersByTime(5000));
		expect(player().currentIndex).toBe(-1);
		expect(guitar.triggerChordPreview).toHaveBeenCalledTimes(scheduled);

		// A second sequence replaces the first rather than layering on it.
		act(() => player().play(NOTES, 0.25, "guitar"));
		guitar.cancelStrums.mockClear();
		act(() => player().play(NOTES, 0.25, "guitar"));
		expect(guitar.cancelStrums).toHaveBeenCalled();

		unmount();
		expect(guitar.cancelStrums).toHaveBeenCalledTimes(2);
	});

	it("does nothing without a bus or without steps", () => {
		let latest!: SequencePlayer;
		function Probe() {
			latest = useSequencePlayer({ audio: () => null });
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
		act(() => player().play([], 0.25, "guitar", { loop: true }));
		expect(player().isPlaying).toBe(false);
		unmount();
	});
});
