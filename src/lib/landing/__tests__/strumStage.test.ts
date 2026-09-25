import { describe, expect, it } from "vitest";
import {
	STRUM_DEMO_BEATS,
	STRUM_DEMO_BPM_FROM,
	STRUM_DEMO_BPM_TO,
	STRUM_DEMO_CAPO,
	cellAt,
	strumStage,
} from "../strumStage";

const struck = (bars: ReturnType<typeof strumStage>["bars"]) =>
	bars.flatMap((b) => b.beats.flat()).filter((v) => v !== "").length;

describe("strumStage", () => {
	it("uses the old faithful preset", () => {
		expect(STRUM_DEMO_BEATS).toEqual([
			["D", ""],
			["D", "U"],
			["", "U"],
			["D", ""],
		]);
	});

	it("starts with two blank bars and taps the rhythm in cell by cell", () => {
		expect(struck(strumStage(0).bars)).toBe(0);
		const half = strumStage(0.06).bars; // eight of sixteen cells: the whole first bar
		expect(struck(half)).toBe(5);
		expect(struck([half[1]])).toBe(0);
		const full = strumStage(0.12).bars;
		expect(struck(full)).toBe(10);
		expect(full[0].chord).toEqual({ root: "C", suffix: "major" });
		expect(full[1].chord).toEqual({ root: "G", suffix: "major" });
	});

	it("keeps the playhead off until the sweep, then walks every cell of both bars", () => {
		expect(strumStage(0.1).activeCell).toBeNull();
		expect(strumStage(0.13).activeCell).toEqual({ barIdx: 0, beatIdx: 0, cellIdx: 0 });
		expect(strumStage(0.34).activeCell).toEqual({ barIdx: 1, beatIdx: 0, cellIdx: 0 });
		expect(strumStage(0.555).activeCell).toEqual({ barIdx: 1, beatIdx: 3, cellIdx: 1 });
		expect(strumStage(0.7).activeCell).toBeNull();
	});

	it("reads the position off the playhead", () => {
		expect(strumStage(0).position).toBe("BAR 01 · BEAT 1");
		expect(strumStage(0.34).position).toBe("BAR 02 · BEAT 1");
		expect(strumStage(0.555).position).toBe("BAR 02 · BEAT 4");
	});

	it("counts the tempo up through the sweep and holds it", () => {
		expect(strumStage(0).bpm).toBe(STRUM_DEMO_BPM_FROM);
		expect(strumStage(0.22).bpm).toBe(86);
		expect(strumStage(0.5).bpm).toBe(STRUM_DEMO_BPM_TO);
		expect(strumStage(1).bpm).toBe(STRUM_DEMO_BPM_TO);
	});

	it("types the progression and lands a chip per word", () => {
		expect(strumStage(0.5).progressionText).toBeNull();
		expect(strumStage(0.58).progressionText).toBe("");
		expect(strumStage(0.68).progressionText).toBe("C G ");
		expect(strumStage(0.68).chipsShown).toBe(2);
		expect(strumStage(0.78).progressionText).toBe("C G Am F");
		expect(strumStage(0.78).chipsShown).toBe(4);
		expect(strumStage(0.78).currentChip).toBeNull();
		expect(strumStage(0.85).currentChip).toBe(1);
		expect(strumStage(1).currentChip).toBe(3);
	});

	it("ends with a capo on and the chords drawn as shapes", () => {
		expect(strumStage(0.8).capo).toBeNull();
		expect(strumStage(0.8).chordView).toBe("name");
		expect(strumStage(1).capo).toBe(STRUM_DEMO_CAPO);
		expect(strumStage(1).chordView).toBe("diagram");
	});
});

describe("cellAt", () => {
	const beats = [["D", ""], ["D", "U", "U"], ["X"]];
	it("walks flat indices into (beat, cell)", () => {
		expect(cellAt(beats, 0)).toEqual({ beatIdx: 0, cellIdx: 0 });
		expect(cellAt(beats, 2)).toEqual({ beatIdx: 1, cellIdx: 0 });
		expect(cellAt(beats, 4)).toEqual({ beatIdx: 1, cellIdx: 2 });
		expect(cellAt(beats, 5)).toEqual({ beatIdx: 2, cellIdx: 0 });
	});
	it("clamps past the end to the last cell", () => {
		expect(cellAt(beats, 99)).toEqual({ beatIdx: 2, cellIdx: 0 });
	});
});
