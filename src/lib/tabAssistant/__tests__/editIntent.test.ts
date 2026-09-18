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

describe("chord marks", () => {
	const four: FingerpickPattern = {
		...makeDefaultPattern(),
		id: "four",
		name: "four bars",
		measures: Array.from({ length: 4 }, () => makeDefaultPattern().measures[0]),
	};
	const readFour = (text: string) => readTabEdit({ text, index: INDEX, patterns: [...PATTERNS, four], voicingFor });
	const chordOn = (r: ReturnType<typeof readFour>, bar: number, slot: number) =>
		r?.kind === "chords" ? r.measures[bar - r.barIndex - 1]?.slots[slot]?.chord?.root : undefined;

	it("marks one chord on one bar, on the first beat unless told otherwise", () => {
		const r = readFour("add chord Am to bar 2 of four bars");
		expect(r?.kind).toBe("chords");
		expect(r?.kind === "chords" && r.barIndex).toBe(1);
		expect(r?.kind === "chords" && r.measures).toHaveLength(1);
		expect(chordOn(r, 2, 0)).toBe("A");
		expect(r?.kind === "chords" && r.marks).toEqual([{ bar: 2, beat: 1, chord: { root: "A", suffix: "minor", voicingId: null } }]);
		// Four quarters in the bar: beat 3 is the third slot.
		const onThree = readFour("add chord Am to bar 2 beat 3 of four bars");
		expect(chordOn(onThree, 2, 2)).toBe("A");
		expect(chordOn(onThree, 2, 0)).toBeUndefined();
	});

	it("reads the colon form and the Chinese form", () => {
		expect(chordOn(readFour("four bars bar 3 beat 2: G"), 3, 1)).toBe("G");
		expect(chordOn(readFour("chords for four bars bar 1: C"), 1, 0)).toBe("C");
		expect(chordOn(readFour("给 four bars 第 2 小节第 3 拍加和弦 Am"), 2, 2)).toBe("A");
		expect(chordOn(readFour("把 four bars 的第 1 小节配和弦 C"), 1, 0)).toBe("C");
	});

	it("writes one chord per bar across a range, or one chord on every bar", () => {
		const r = readFour("mark C G Am F on bars 1-4 of four bars");
		expect(r?.kind === "chords" && r.measures).toHaveLength(4);
		expect([1, 2, 3, 4].map((b) => chordOn(r, b, 0))).toEqual(["C", "G", "A", "F"]);
		const all = readFour("four bars bars 2-4: Am");
		expect([2, 3, 4].map((b) => chordOn(all, b, 0))).toEqual(["A", "A", "A"]);
		expect(all?.kind === "chords" && all.barIndex).toBe(1);
		// No range: the list sets it, starting at the bar named.
		const list = readFour("four bars bar 2: G Am F");
		expect(list?.kind === "chords" && list.measures).toHaveLength(3);
		expect(chordOn(list, 4, 0)).toBe("F");
		expect(readFour("four bars 第 1-4 小节和弦：C G Am F")?.kind).toBe("chords");
	});

	it("reads a bar-by-bar list with the target named once, or on the first item", () => {
		const r = readFour("in four bars, add Cm7 to bar 1, add F7 to bar 2, add Bbmaj7 to bar 3, add Ebmaj7 to bar 4");
		expect(r?.kind).toBe("chords");
		expect(r?.kind === "chords" && r.marks.map((m) => `${m.bar}:${m.chord.root}${m.chord.suffix}`)).toEqual(["1:Cm7", "2:F7", "3:Bbmaj7", "4:Ebmaj7"]);
		expect(r?.kind === "chords" && r.measures).toHaveLength(4);
		const onFirst = readFour("add Cm7 to bar 1 of four bars, F7 to bar 2 beat 3, mark Bbmaj7 on bar 4");
		expect(onFirst?.kind === "chords" && onFirst.marks.map((m) => `${m.bar}.${m.beat}`)).toEqual(["1.1", "2.3", "4.1"]);
		// Bars 1–4 are handed over as one run, bar 3 untouched.
		expect(onFirst?.kind === "chords" && onFirst.measures).toHaveLength(4);
		expect(chordOn(onFirst, 3, 0)).toBeUndefined();
		const zh = readFour("给 four bars 第 1 小节加 Cm7，第 2 小节第 3 拍加 F7，第 4 小节 Bbmaj7");
		expect(zh?.kind === "chords" && zh.marks.map((m) => `${m.bar}.${m.beat}:${m.chord.root}`)).toEqual(["1.1:C", "2.3:F", "4.1:Bb"]);
	});

	it("keeps a chord already on a beat that is not being marked", () => {
		const marked = { ...four, measures: four.measures.map((m, i) => (i === 1 ? { ...m, slots: m.slots.map((s, j) => (j === 2 ? { ...s, chord: { root: "E", suffix: "major" } } : s)) } : m)) };
		const r = readTabEdit({ text: "add chord Am to bar 2 of four bars", index: INDEX, patterns: [marked], voicingFor });
		expect(chordOn(r, 2, 0)).toBe("A");
		expect(chordOn(r, 2, 2)).toBe("E");
	});

	it("says what is wrong: a bar, a beat, a count, a word that is no chord", () => {
		expect(readFour("add chord Am to bar 9 of four bars")).toMatchObject({ kind: "bar-out-of-range", bar: 9 });
		expect(readFour("four bars bar 3: G Am F")).toMatchObject({ kind: "bar-out-of-range", bar: 5 });
		expect(readFour("add chord Am to bar 1 beat 5 of four bars")).toMatchObject({ kind: "beat-out-of-range", beat: 5 });
		expect(readFour("mark C G on bars 1-4 of four bars")).toMatchObject({ kind: "chords-mismatch", bars: 4, chords: 2 });
		expect(readFour("add chord gently to bar 1 of four bars")).toMatchObject({ kind: "segment-unread" });
		expect(readFour("mark C Xmaj on bars 1-2 of four bars")).toMatchObject({ kind: "segment-unread" });
		const partly = readFour("mark C Cmaj13#11 on bars 1-2 of four bars");
		expect(partly?.kind === "chords" && partly.marks).toHaveLength(1);
		expect(partly?.kind === "chords" && partly.warnings[0].message).toMatch(/Cmaj13#11/);
	});

	it("is not taken for a replace or an append", () => {
		expect(readFour("replace bar 2 of four bars: Am: 5 3 2 1")?.kind).toBe("replace");
		expect(readFour("add to four bars: Am: 5 3 2 1")?.kind).toBe("append");
	});

	it("goes through the turn as a card, and through the handoff as a range", async () => {
		const out = await resolveTabTurn({ text: "mark C G Am F on bars 1-4 of four bars", index: INDEX, patterns: [four], voicings: async () => voicingFor });
		expect(out.edit?.kind).toBe("chords");
		expect(out.text).toBe('Mark C G Am F on bars 1–4 of "four bars"? Nothing is saved until you say so.');
		const beat = await resolveTabTurn({ text: "给 four bars 第 2 小节第 3 拍加和弦 Am", index: INDEX, patterns: [four], uiLang: "zh", voicings: async () => voicingFor });
		expect(beat.text).toMatch(/在「four bars」的第 2 小节第 3 拍标上 Am？/);
		const list = await resolveTabTurn({ text: "in four bars, add Cm7 to bar 1, add F7 to bar 2 beat 3", index: INDEX, patterns: [four], voicings: async () => voicingFor });
		expect(list.text).toBe('Mark Cm7 on bar 1, F7 on bar 2 beat 3 of "four bars"? Nothing is saved until you say so.');
		if (out.edit?.kind !== "chords") return;
		const next = applyTabEdit(four, "replace", out.edit.barIndex, out.edit.measures, out.edit.measures.length);
		expect(next.measures).toHaveLength(4);
		expect(next.measures.map((m) => m.slots[0].chord?.root)).toEqual(["C", "G", "A", "F"]);
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
		stashHandoff({ kind: "fingerpick-edit", op: "append", patternId: "mine", patternName: "my arp", barIndex: null, replaceCount: 0, measures });
		const taken = takeHandoff("fingerpick");
		expect(taken?.kind).toBe("fingerpick-edit");
		if (taken?.kind !== "fingerpick-edit") return;
		expect(taken.measures).toHaveLength(1);
		expect(taken.measures[0].slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
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
