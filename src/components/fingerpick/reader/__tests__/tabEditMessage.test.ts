import { describe, it, expect } from "vitest";
import { tabEditMessage, type TabEdit } from "../useTabHandoff";

const base = { patternId: "p1", patternName: "Travis" };

describe("tabEditMessage", () => {
	it("names a delete and a rename by what the save settled on", () => {
		expect(tabEditMessage({ ...base, kind: "fingerpick-delete" }, "Travis", { name: "Travis", bpm: 90 }, false)).toBe('Deleted "Travis".');
		const rename: TabEdit = { ...base, kind: "fingerpick-rename", newName: "Waltz" };
		expect(tabEditMessage(rename, "Travis", { name: "Waltz (1)", bpm: 90 }, false)).toBe('Renamed "Travis" to "Waltz (1)".');
	});

	it("says the tempo that was stored, and that a preset was copied", () => {
		const set: TabEdit = { ...base, kind: "fingerpick-set", bpm: 300, timeSignature: [6, 8] };
		expect(tabEditMessage(set, "Travis", { name: "Travis", bpm: 140 }, false)).toBe('Set "Travis" to 6/8 at 140 BPM.');
		expect(tabEditMessage(set, "Travis", { name: "Travis (mine)", bpm: 140 }, true)).toBe(
			'Saved "Travis (mine)" at 6/8 at 140 BPM — the shipped tab stays as it was.',
		);
	});

	it("counts the bars added or rewritten", () => {
		const append: TabEdit = { ...base, kind: "fingerpick-edit", op: "append", barIndex: null, replaceCount: 1, measures: [] };
		expect(tabEditMessage({ ...append, measures: [{ id: "m", slots: [] }] }, "Travis", { name: "Travis", bpm: 90 }, false)).toBe(
			'Added 1 bar to "Travis".',
		);
		const replace: TabEdit = { ...base, kind: "fingerpick-edit", op: "replace", barIndex: 2, replaceCount: 3, measures: [] };
		expect(tabEditMessage(replace, "Travis", { name: "Travis", bpm: 90 }, false)).toBe('Rewrote bars 3–5 of "Travis".');
	});
});
