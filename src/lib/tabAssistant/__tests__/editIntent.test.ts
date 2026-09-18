import { describe, it, expect } from "vitest";
import { applyTabEdit, findTabPattern, readTabEdit, tabEditClause } from "@/lib/tabAssistant/editIntent";
import { resolveTabTurn } from "@/lib/tabAssistant/turn";
import { takeHandoff, stashHandoff } from "@/lib/strumAssistant/handoff";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { INDEX, voicingFor } from "./fixtures";

const mine: FingerpickPattern = { ...makeDefaultPattern(), id: "mine", name: "my arp", timeSignature: [3, 4] };
const PATTERNS = [...PRESET_FINGERPICK_PATTERNS, mine];
const read = (text: string) => readTabEdit({ text, index: INDEX, patterns: PATTERNS, voicingFor });
const bars = (r: ReturnType<typeof read>) => (r && (r.kind === "append" || r.kind === "replace") ? r.measures : []);

describe("tabEditClause", () => {
	it("reads the verb, the target and the bars, in either language", () => {
		expect(tabEditClause("add to travis picking: Am: 5 3 2 1")).toMatchObject({ op: "append", name: "travis picking", spec: "Am: 5 3 2 1" });
		expect(tabEditClause("append a bar to my arp: string:654, fret:0-2-2")).toMatchObject({ op: "append", name: "my arp" });
		expect(tabEditClause("replace bar 2 of my arp: C: 5/4 2 1 3")).toMatchObject({ op: "replace", name: "my arp" });
		expect(tabEditClause("set bar 1 in my arp to travis in C")).toMatchObject({ op: "replace", spec: "travis in C" });
		expect(tabEditClause("给 my arp 加：string:654, fret:0-2-2")).toMatchObject({ op: "append", name: "my arp" });
		expect(tabEditClause("在 my arp 里加上 Am: 5 3 2 1")).toMatchObject({ op: "append", name: "my arp", spec: "Am: 5 3 2 1" });
		expect(tabEditClause("把 my arp 的第 2 小节改成 Am: 5 3 2 1")).toMatchObject({ op: "replace", name: "my arp" });
	});

	it("is not an edit without a verb and a target", () => {
		expect(tabEditClause("Am: 5 3 2 1")).toBeNull();
		expect(tabEditClause("string:654, fret:0-2-2")).toBeNull();
	});
});

describe("readTabEdit", () => {
	it("builds every segment to the target's meter and appends them", () => {
		const r = read("add to my arp: string:654, fret:0-2-2; Am: 5 3 2 1 3 2; waltz in C");
		expect(r?.kind).toBe("append");
		const m = bars(r);
		expect(m).toHaveLength(3);
		// 3/4 throughout, whatever the segment: 6 eighths, not 8.
		expect(m[1].slots).toHaveLength(6);
		// A 4/4 style bar forced into 3/4 spills into a second, padded bar.
		expect(bars(read("add to my arp: travis in C"))).toHaveLength(2);
		expect(m[0].slots[0].strings[5].fret).toBe(0);
		expect(m[1].slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
	});

	it("replaces one bar, counted from one", () => {
		const r = read("replace bar 1 of my arp: Am: 5 3 2 1 3 2");
		expect(r?.kind).toBe("replace");
		expect(r?.kind === "replace" && r.barIndex).toBe(0);
		const next = applyTabEdit(mine, "replace", 0, bars(r));
		expect(next.measures).toHaveLength(1);
		expect(next.measures[0].slots[0].chord).toBeDefined();
	});

	it("appends after the last bar", () => {
		const r = read("add to my arp: Am: 5 3 2 1 3 2");
		const next = applyTabEdit(mine, "append", null, bars(r));
		expect(next.measures).toHaveLength(2);
		expect(next.measures[0]).toBe(mine.measures[0]);
	});

	it("names a preset too — the page makes the copy", () => {
		const r = read("add to Travis Picking: string:654, fret:0-2-2");
		expect(r?.kind).toBe("append");
		expect(r?.kind === "append" && r.pattern.id).toBe("travis-picking");
	});

	it("reports a name the library does not have", () => {
		expect(read("add to nothing here: Am: 5 3 2 1")).toEqual({ kind: "unknown-pattern", op: "append", name: "nothing here" });
		expect(findTabPattern("MY ARP", PATTERNS)?.id).toBe("mine");
		expect(findTabPattern("\"my arp\"", PATTERNS)?.id).toBe("mine");
	});

	it("reports a bar that is not there, and a segment it could not read", () => {
		expect(read("replace bar 5 of my arp: Am: 5 3 2 1")).toMatchObject({ kind: "bar-out-of-range", bar: 5 });
		expect(read("add to my arp: something nice")).toMatchObject({ kind: "segment-unread", segment: "something nice" });
		expect(read("add to my arp: Am: 5 3 2 1; something nice")).toMatchObject({ kind: "segment-unread", segment: "something nice" });
		expect(read("add to my arp:   ")).toMatchObject({ kind: "nothing-to-write" });
	});
});

describe("an edit through the turn", () => {
	const resolve = (text: string, uiLang: "en" | "zh" = "en") =>
		resolveTabTurn({ text, index: INDEX, patterns: PATTERNS, uiLang, voicings: async () => voicingFor });

	it("asks before writing, and carries the bars for the card", async () => {
		const out = await resolve("add to my arp: string:654, fret:0-2-2; Am: 5 3 2 1 3 2");
		expect(out.edit?.kind).toBe("append");
		expect(out.edit?.measures).toHaveLength(2);
		expect(out.text).toBe('Add 2 bars to the end of "my arp"? Nothing is saved until you say so.');
		expect(out.proposal).toBeUndefined();
	});

	it("says a preset will be copied", async () => {
		const out = await resolve("add to travis picking: Am: 5 3 2 1");
		expect(out.text).toMatch(/shipped pattern, so this saves a copy/);
	});

	it("answers in Chinese", async () => {
		const out = await resolve("把 my arp 的第 1 小节改成 Am: 5 3 2 1 3 2", "zh");
		expect(out.edit?.kind).toBe("replace");
		expect(out.text).toMatch(/把「my arp」的第 1 小节换成这一小节？/);
	});

	it("explains a miss without a card", async () => {
		const out = await resolve("add to nowhere: Am: 5 3 2 1");
		expect(out.edit).toBeUndefined();
		expect(out.text).toMatch(/no pattern called "nowhere"/);
		expect(out.templates?.length).toBeGreaterThan(0);
	});
});

describe("the edit handoff", () => {
	it("round-trips through the stash, validated", () => {
		const r = read("add to my arp: Am: 5 3 2 1 3 2");
		const measures = bars(r);
		stashHandoff({ kind: "fingerpick-edit", op: "append", patternId: "mine", patternName: "my arp", barIndex: null, measures });
		const taken = takeHandoff("fingerpick");
		expect(taken?.kind).toBe("fingerpick-edit");
		if (taken?.kind !== "fingerpick-edit") return;
		expect(taken.measures).toHaveLength(1);
		expect(taken.measures[0].slots[0].chord).toBeUndefined();
		expect(taken.op).toBe("append");
	});

	it("refuses a replace without a bar, and garbage measures", () => {
		sessionStorage.setItem(
			"guitarpal:strumAssistantHandoff",
			JSON.stringify({ kind: "fingerpick-edit", op: "replace", patternId: "mine", patternName: "x", barIndex: null, measures: [{}] }),
		);
		expect(takeHandoff("fingerpick")).toBeNull();
		sessionStorage.setItem(
			"guitarpal:strumAssistantHandoff",
			JSON.stringify({ kind: "fingerpick-edit", op: "append", patternId: "mine", patternName: "x", barIndex: null, measures: [] }),
		);
		expect(takeHandoff("fingerpick")).toBeNull();
	});
});
