import { describe, it, expect, beforeEach } from "vitest";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import { toBars } from "@/lib/strumBars";
import {
	HANDOFF_EVENT,
	stashHandoff,
	takeHandoff,
	type FingerpickHandoff,
	type PatternHandoff,
} from "@/lib/assistant/handoff";

const KEY = "guitarpal:assistantHandoff";

// One measure with a note in it; no repeat markers, which the validator
// does not carry.
function tabPattern(): FingerpickPattern {
	const pattern = { ...makeDefaultPattern(), id: "from-assistant", name: "Am arpeggio" };
	pattern.measures[0].slots[0].strings[4].fret = 0;
	return pattern;
}

const tab = (): FingerpickHandoff => ({
	kind: "fingerpick",
	pattern: tabPattern(),
	warnings: [{ code: "UNSUPPORTED_TECHNIQUE", path: "measures[0]", message: "bend was dropped" }],
});

const strum = (): PatternHandoff => ({
	kind: "pattern",
	name: "From the assistant",
	bars: toBars(PRESET_STRUM_PATTERNS[0]),
	bpm: 90,
	chords: [],
	capo: null,
});

beforeEach(() => sessionStorage.clear());

describe("a fingerpick handoff", () => {
	it("round-trips a valid pattern, warnings and all", () => {
		const stashed = tab();
		stashHandoff(stashed);
		const taken = takeHandoff("fingerpick");
		expect(taken).not.toBeNull();
		expect(taken?.pattern).toEqual(stashed.pattern);
		expect(taken?.warnings).toEqual(stashed.warnings);
		expect(sessionStorage.getItem(KEY)).toBeNull();
	});

	it("returns null for a pattern the validator rejects", () => {
		sessionStorage.setItem(
			KEY,
			JSON.stringify({ kind: "fingerpick", pattern: { measures: [] }, warnings: [] }),
		);
		expect(takeHandoff("fingerpick")).toBeNull();
		expect(sessionStorage.getItem(KEY)).toBeNull();
	});

	it("adds the validator's own warnings and drops stashed ones that are not warnings", () => {
		const pattern = tabPattern();
		// A fret past the neck: repaired with a warning, not rejected.
		pattern.measures[0].slots[0].strings[0].fret = 40;
		sessionStorage.setItem(
			KEY,
			JSON.stringify({ kind: "fingerpick", pattern, warnings: ["not an issue", null] }),
		);
		const taken = takeHandoff("fingerpick");
		expect(taken?.warnings.length).toBeGreaterThan(0);
		expect(taken?.warnings.every((w) => typeof w.code === "string")).toBe(true);
	});

	it("announces itself the way a strum handoff does", () => {
		let heard = 0;
		const listener = () => heard++;
		window.addEventListener(HANDOFF_EVENT, listener);
		stashHandoff(tab());
		window.removeEventListener(HANDOFF_EVENT, listener);
		expect(heard).toBe(1);
	});
});

describe("one stash, two pages", () => {
	it("leaves a fingerpick handoff in place when the strum page reads", () => {
		stashHandoff(tab());
		expect(takeHandoff()).toBeNull();
		expect(sessionStorage.getItem(KEY)).not.toBeNull();
		expect(takeHandoff("fingerpick")?.kind).toBe("fingerpick");
	});

	it("leaves a strum handoff in place when the fingerpick page reads", () => {
		stashHandoff(strum());
		expect(takeHandoff("fingerpick")).toBeNull();
		expect(sessionStorage.getItem(KEY)).not.toBeNull();
		expect(takeHandoff()?.kind).toBe("pattern");
	});

	it("clears a stash nobody can read, whichever page reads first", () => {
		sessionStorage.setItem(KEY, "{not json");
		expect(takeHandoff("fingerpick")).toBeNull();
		expect(sessionStorage.getItem(KEY)).toBeNull();
	});

	it("still reads a strum handoff stashed before kinds had domains", () => {
		const { kind: _kind, ...legacy } = strum();
		void _kind;
		sessionStorage.setItem(KEY, JSON.stringify(legacy));
		expect(takeHandoff()?.kind).toBe("pattern");
	});
});
