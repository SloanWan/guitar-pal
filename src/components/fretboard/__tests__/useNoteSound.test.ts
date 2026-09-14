// The first press downloads the samples; the hook reports that wait, plays the
// note that started it once it lands, and drops presses made in between rather
// than firing them as a burst. Unmount stops everything and closes the context.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { useNoteSound, type NoteSound } from "@/components/fretboard/useNoteSound";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const loader = vi.hoisted(() => ({
	preloadFingerpickPresets: vi.fn<() => Promise<void>>(),
	triggerChordPreview: vi.fn(),
	cancelStrums: vi.fn(),
}));
vi.mock("@/components/strum/useGuitarSampleLoader", () => loader);
const piano = vi.hoisted(() => ({
	preloadPianoPreset: vi.fn<() => Promise<void>>(),
	triggerPianoNote: vi.fn(),
	cancelPianoNotes: vi.fn(),
}));
vi.mock("@/components/fretboard/pianoSampleLoader", () => piano);

class FakeAudioContext {
	state = "running";
	destination = {};
	currentTime = 1.5;
	close = vi.fn(async () => undefined);
	resume = vi.fn(async () => undefined);
}
vi.stubGlobal("AudioContext", FakeAudioContext);

function deferred() {
	let resolve!: () => void;
	let reject!: (err: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function mount() {
	let latest!: NoteSound;
	function Probe() {
		latest = useNoteSound();
		return null;
	}
	const host = document.createElement("div");
	let root!: Root;
	act(() => {
		root = createRoot(host);
		root.render(createElement(Probe));
	});
	return { hook: () => latest, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
	loader.preloadFingerpickPresets.mockReset();
	loader.triggerChordPreview.mockReset();
	loader.cancelStrums.mockReset();
	piano.preloadPianoPreset.mockReset().mockResolvedValue(undefined);
	piano.triggerPianoNote.mockReset();
	piano.cancelPianoNotes.mockReset();
});

describe("useNoteSound", () => {
	it("reports loading on the first press, plays that note when the samples land, and drops presses in between", async () => {
		const load = deferred();
		loader.preloadFingerpickPresets.mockReturnValue(load.promise);
		const { hook, unmount } = mount();
		expect(hook().isLoading).toBe(false);

		let first!: Promise<void>;
		await act(async () => {
			first = hook().play(45);
		});
		expect(hook().isLoading).toBe(true);
		expect(loader.preloadFingerpickPresets).toHaveBeenCalledTimes(1);

		await act(async () => {
			await hook().play(50); // resolves at once, no burst later
		});
		expect(loader.triggerChordPreview).not.toHaveBeenCalled();

		await act(async () => {
			load.resolve();
			await first;
		});
		expect(hook().isLoading).toBe(false);
		expect(loader.triggerChordPreview).toHaveBeenCalledTimes(1);
		expect(loader.triggerChordPreview.mock.calls[0][0]).toEqual([45]);

		await act(async () => {
			await hook().play(52);
		});
		expect(loader.triggerChordPreview).toHaveBeenCalledTimes(2);
		expect(loader.preloadFingerpickPresets).toHaveBeenCalledTimes(1);
		unmount();
	});

	it("forgets a failed download so the next press retries", async () => {
		loader.preloadFingerpickPresets.mockRejectedValueOnce(new Error("offline"));
		loader.preloadFingerpickPresets.mockResolvedValueOnce(undefined);
		const { hook, unmount } = mount();

		await act(async () => {
			await expect(hook().play(45)).rejects.toThrow("offline");
		});
		expect(hook().isLoading).toBe(false);

		await act(async () => {
			await hook().play(45);
		});
		expect(loader.preloadFingerpickPresets).toHaveBeenCalledTimes(2);
		expect(loader.triggerChordPreview).toHaveBeenCalledTimes(1);
		unmount();
	});

	it("keeps the piano voice apart: its own preload, its own trigger, loading while either downloads", async () => {
		const guitarLoad = deferred();
		loader.preloadFingerpickPresets.mockReturnValue(guitarLoad.promise);
		const { hook, unmount } = mount();

		await act(async () => {
			await hook().play(60, "piano");
		});
		expect(piano.preloadPianoPreset).toHaveBeenCalledTimes(1);
		expect(piano.triggerPianoNote).toHaveBeenCalledTimes(1);
		expect(piano.triggerPianoNote.mock.calls[0][0]).toBe(60);
		expect(loader.triggerChordPreview).not.toHaveBeenCalled();
		expect(hook().isLoading).toBe(false);

		let guitar!: Promise<void>;
		await act(async () => {
			guitar = hook().play(45); // guitar by default
		});
		expect(hook().isLoading).toBe(true);
		await act(async () => {
			await hook().play(64, "piano"); // the piano is ready: plays at once, even mid guitar download
		});
		expect(piano.triggerPianoNote).toHaveBeenCalledTimes(2);
		expect(hook().isLoading).toBe(true);

		await act(async () => {
			guitarLoad.resolve();
			await guitar;
		});
		expect(hook().isLoading).toBe(false);
		expect(loader.triggerChordPreview).toHaveBeenCalledTimes(1);
		unmount();
		expect(piano.cancelPianoNotes).toHaveBeenCalledTimes(1);
	});

	it("stops ringing notes and closes the context on unmount, and never plays into a dead context", async () => {
		const load = deferred();
		loader.preloadFingerpickPresets.mockReturnValue(load.promise);
		const { hook, unmount } = mount();
		let first!: Promise<void>;
		await act(async () => {
			first = hook().play(45);
		});
		unmount();
		expect(loader.cancelStrums).toHaveBeenCalledTimes(1);

		await act(async () => {
			load.resolve();
			await first;
		});
		expect(loader.triggerChordPreview).not.toHaveBeenCalled();
	});
});
