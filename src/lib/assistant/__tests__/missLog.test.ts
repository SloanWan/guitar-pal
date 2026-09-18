import { describe, it, expect, beforeEach } from "vitest";
import { recordMiss, recordPick, readMisses, exportMisses } from "@/lib/assistant/missLog";
import { explainEditIntent } from "@/lib/assistant/strum/editIntent";

const seen = (text: string) => explainEditIntent(text, [{ id: "b", name: "belief" }]);

beforeEach(() => localStorage.clear());

describe("the record of misses", () => {
	it("keeps the sentence, what was seen, and what was offered", () => {
		recordMiss("add C G somewhere", seen("add C G somewhere"), ["add C G to ___"]);
		const [entry] = readMisses();
		expect(entry.input).toBe("add C G somewhere");
		expect(entry.seen).toMatchObject({ op: "attach", chordWords: ["C", "G"], matchedName: null });
		expect(entry.offered).toEqual(["add C G to ___"]);
		expect(entry.picked).toBeUndefined();
	});

	it("keeps which assistant was selected, and the one that would have read it", () => {
		recordMiss("Am: 5 3 2 1", seen("Am: 5 3 2 1"), [], { mode: "strum", readAs: "tab" });
		recordMiss("make it sadder", seen("make it sadder"), [], { mode: "strum", readAs: null });
		const [first, second] = readMisses();
		expect(first).toMatchObject({ mode: "strum", readAs: "tab" });
		expect(second.mode).toBe("strum");
		expect(second).not.toHaveProperty("readAs");
	});

	it("attaches a pick to the miss it answers", () => {
		recordMiss("add C G somewhere", seen("add C G somewhere"), ["add C G to ___", "C G"]);
		recordPick("add C G somewhere", "add C G to ___");
		expect(readMisses()[0].picked).toBe("add C G to ___");
		// A second pick for the same sentence has nothing open to attach to.
		recordPick("add C G somewhere", "C G");
		expect(readMisses()[0].picked).toBe("add C G to ___");
	});

	it("stays bounded", () => {
		for (let i = 0; i < 230; i++) recordMiss(`miss ${i}`, seen(`miss ${i}`), []);
		const entries = readMisses();
		expect(entries.length).toBe(200);
		expect(entries[0].input).toBe("miss 30");
	});

	it("exports as JSON fit for the eval set", () => {
		recordMiss("what a day", seen("what a day"), ["C G Am F"]);
		expect(JSON.parse(exportMisses())).toHaveLength(1);
	});

	it("survives storage that is not there", () => {
		localStorage.setItem("guitarpal:assistantMisses", "not json");
		expect(readMisses()).toEqual([]);
	});
});
