import { describe, it, expect } from "vitest";
import type { BeatSlot, FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import {
	clockLabel,
	countSince,
	greeting,
	sortKept,
	tabPreview,
	todayLabel,
	weekIsEmpty,
	weekStart,
	whenLabel,
	type KeptItem,
} from "../home";

// Thursday 29 October 2026, 21:40, local time.
const NOW = new Date(2026, 9, 29, 21, 40);

describe("time on /home", () => {
	it("writes the clock in 24 hours", () => {
		expect(clockLabel(new Date(2026, 9, 29, 9, 5))).toBe("09:05");
		expect(todayLabel(NOW)).toBe("Thursday, 21:40");
	});

	it("says when: the time today, yesterday, the weekday, then the date", () => {
		expect(whenLabel(new Date(2026, 9, 29, 0, 10), NOW)).toBe("00:10");
		expect(whenLabel(new Date(2026, 9, 28, 23, 59), NOW)).toBe("yesterday");
		expect(whenLabel(new Date(2026, 9, 26, 8, 0), NOW)).toBe("Monday");
		expect(whenLabel(new Date(2026, 9, 23, 8, 0), NOW)).toBe("Friday");
		expect(whenLabel(new Date(2026, 9, 22, 8, 0), NOW)).toBe("22 Oct");
	});

	it("counts days by the calendar, not by 24 hours", () => {
		const justAfterMidnight = new Date(2026, 9, 30, 0, 5);
		expect(whenLabel(new Date(2026, 9, 29, 23, 55), justAfterMidnight)).toBe("yesterday");
	});

	it("starts the week on Monday at midnight", () => {
		expect(weekStart(NOW)).toEqual(new Date(2026, 9, 26));
		// a Sunday belongs to the week that began six days before
		expect(weekStart(new Date(2026, 10, 1, 12))).toEqual(new Date(2026, 9, 26));
		expect(weekStart(new Date(2026, 9, 26, 0, 0))).toEqual(new Date(2026, 9, 26));
	});

	it("counts the stamps on or after a moment, skipping missing ones", () => {
		const since = weekStart(NOW);
		const stamps = [new Date(2026, 9, 26).toISOString(), new Date(2026, 9, 25, 23).toISOString(), null, undefined, NOW.toISOString()];
		expect(countSince(stamps, since)).toBe(2);
	});

	it("calls a week empty only when it added nothing", () => {
		expect(weekIsEmpty({ progressions: 0, chords: 0, links: 0 })).toBe(true);
		expect(weekIsEmpty({ progressions: 0, chords: 1, links: 0 })).toBe(false);
	});
});

describe("greeting", () => {
	it("follows the hour", () => {
		expect(greeting(new Date(2026, 9, 29, 7), null)).toBe("Morning. What are we playing?");
		expect(greeting(new Date(2026, 9, 29, 13), null)).toBe("Afternoon. What are we playing?");
		expect(greeting(NOW, null)).toBe("Evening. What are we playing?");
		expect(greeting(new Date(2026, 9, 29, 2), null)).toBe("Evening. What are we playing?");
	});

	it("names the player only by the nickname they gave", () => {
		expect(greeting(NOW, "Sloan")).toBe("Evening, Sloan. What are we playing?");
	});
});

describe("sortKept", () => {
	const item = (key: string, createdAt: string | null): KeptItem => ({
		key,
		module: "strum",
		title: key,
		subline: "",
		href: "/strum",
		createdAt,
	});

	it("lists newest first and undated rows last, in the order given", () => {
		const sorted = sortKept([
			item("undated-a", null),
			item("old", "2026-10-01T10:00:00Z"),
			item("undated-b", null),
			item("new", "2026-10-29T10:00:00Z"),
		]);
		expect(sorted.map((i) => i.key)).toEqual(["new", "old", "undated-a", "undated-b"]);
	});
});

describe("tabPreview", () => {
	const open = (): StringFret => ({ fret: null, muted: false });
	let n = 0;
	const slot = (notes: Record<number, number | "x">, extra: Partial<BeatSlot> = {}): BeatSlot => {
		const strings = [open(), open(), open(), open(), open(), open()] as BeatSlot["strings"];
		for (const [s, f] of Object.entries(notes)) strings[Number(s)] = f === "x" ? { fret: null, muted: true } : { fret: f, muted: false };
		return { id: `s${n++}`, duration: "eighth", strings, ...extra };
	};
	const pattern = (measures: BeatSlot[][]): FingerpickPattern => ({
		id: "p",
		name: "p",
		bpm: 80,
		timeSignature: [4, 4],
		measures: measures.map((slots, i) => ({ id: `m${i}`, slots })),
	});

	it("draws each slot's frets on their strings, high e as 0", () => {
		const preview = tabPreview(pattern([[slot({ 5: 3, 0: 0 }), slot({ 3: "x" })]]), 16);
		expect(preview.columns).toEqual([
			[
				{ string: 0, text: "0" },
				{ string: 5, text: "3" },
			],
			[{ string: 3, text: "x" }],
		]);
		expect(preview.barlines).toEqual([]);
	});

	it("leaves rests empty and grace notes out", () => {
		const preview = tabPreview(pattern([[slot({ 1: 1 }, { isGraceNote: true }), slot({ 2: 2 }, { isRest: true }), slot({ 2: 2 })]]), 16);
		expect(preview.columns).toEqual([[], [{ string: 2, text: "2" }]]);
	});

	it("takes whole measures, with a barline between them, while they fit", () => {
		const bar = () => [slot({ 4: 3 }), slot({ 2: 0 }), slot({ 1: 1 }), slot({ 2: 0 })];
		const preview = tabPreview(pattern([bar(), bar(), bar()]), 10);
		expect(preview.columns).toHaveLength(8);
		expect(preview.barlines).toEqual([4]);
	});

	it("cuts a first measure longer than the room", () => {
		const long = Array.from({ length: 12 }, () => slot({ 0: 0 }));
		expect(tabPreview(pattern([long]), 8).columns).toHaveLength(8);
	});
});
