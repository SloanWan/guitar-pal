import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trigger = vi.hoisted(() => vi.fn());
vi.mock("@/components/strum/useGuitarSampleLoader", () => ({
	preloadFingerpickPresets: () => Promise.resolve(),
	triggerChordPreview: trigger,
	CHORD_PREVIEW_DURATION_S: 2,
	SOURCE_STOP_BUFFER_S: 0.05,
}));

import { ARPEGGIO_GAP_S, useChordPreview } from "@/components/chords/useChordPreview";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// No testing-library in this project: render the hook in a bare harness.
function renderPreview() {
	const result = {} as { current: ReturnType<typeof useChordPreview> };
	function Harness() {
		result.current = useChordPreview();
		return null;
	}
	act(() => createRoot(document.createElement("div")).render(<Harness />));
	return { result };
}

class FakeAudioContext {
	currentTime = 10;
	state = "running";
	destination = {};
	resume() {
		return Promise.resolve();
	}
	close() {
		return Promise.resolve();
	}
}

describe("useChordPreview", () => {
	beforeEach(() => {
		vi.stubGlobal("AudioContext", FakeAudioContext);
		vi.useFakeTimers();
		trigger.mockClear();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it("strums the chord as one preview", async () => {
		const { result } = renderPreview();
		await act(() => result.current.play([48, 52, 55]));
		expect(trigger).toHaveBeenCalledTimes(1);
		expect(trigger.mock.calls[0][0]).toEqual([48, 52, 55]);
		expect(result.current.playing).toBe("strum");
	});

	it("plays an arpeggio a note at a time, in the order given", async () => {
		const { result } = renderPreview();
		await act(() => result.current.arpeggiate([48, 52, 55]));
		expect(trigger.mock.calls.map((c) => [c[0], c[3]])).toEqual([
			[[48], 10],
			[[52], 10 + ARPEGGIO_GAP_S],
			[[55], 10 + 2 * ARPEGGIO_GAP_S],
		]);
		expect(result.current.playing).toBe("arpeggio");
		// Counted once its notes are scheduled, so a diagram's plucks start with the sound.
		expect(result.current.arpeggioRun).toBe(1);
	});

	it("counts the arpeggio as playing until its last note has rung", async () => {
		const { result } = renderPreview();
		await act(() => result.current.arpeggiate([48, 52, 55]));
		act(() => vi.advanceTimersByTime((2 * ARPEGGIO_GAP_S + 2) * 1000));
		expect(result.current.isPlaying).toBe(true);
		act(() => vi.advanceTimersByTime(100));
		expect(result.current.isPlaying).toBe(false);
	});
});
