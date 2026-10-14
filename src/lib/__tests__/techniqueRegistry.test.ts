import { describe, it, expect } from "vitest";

import {
	EFFECT_KINDS,
	EFFECT_STACK_ORDER,
	LINK_KINDS,
	PERCUSSION_KINDS,
	SPAN_KINDS,
	TECHNIQUES,
	effectsSchema,
	linkSchema,
	percussionSchema,
	spanSchema,
	supportOf,
	techniqueDef,
	type NoteContext,
} from "@/lib/techniqueRegistry";
import { TECHNIQUE_SUPPORT } from "@/lib/tabImport";
import { noteToV2 } from "@/lib/fingerpickCompat";
import type { Technique } from "@/lib/fingerpickTypes";

describe("technique registry", () => {
	it("has unique kinds, each in one category", () => {
		const kinds = TECHNIQUES.map((t) => t.kind);
		expect(new Set(kinds).size).toBe(kinds.length);
		expect(LINK_KINDS).toEqual(["tie", "hammer", "pull", "slide"]);
		expect(EFFECT_KINDS).toContain("bend");
		expect(SPAN_KINDS).toEqual(["palmMute", "letRing", "slur"]);
		expect(PERCUSSION_KINDS).toEqual(["slap", "thumbSlap", "bodyTap"]);
	});

	it("stacks effects in a stable order with bend first", () => {
		expect(EFFECT_STACK_ORDER[0]).toBe("bend");
		expect(new Set(EFFECT_STACK_ORDER).size).toBe(EFFECT_KINDS.length);
	});

	it("agrees with the v1 support table for every v1 technique that maps to a kind", () => {
		for (const [technique, support] of Object.entries(TECHNIQUE_SUPPORT)) {
			const v2 = noteToV2({ fret: 7, technique: technique as Technique, tied: false, muted: false });
			const kind = v2.link?.kind ?? (v2.effects ? Object.keys(v2.effects)[0] : undefined);
			if (!kind) continue; // grace-note: a slot flag now
			// vibrato-bar folds into vibrato, which renders and plays; everything else matches.
			if (technique === "vibrato-bar") continue;
			expect(supportOf(kind), technique).toEqual({ render: support.renderSupported, audio: support.audioSupported });
		}
	});

	it("validates parameters through the registry schemas", () => {
		expect(linkSchema.safeParse({ kind: "slide", picked: true }).success).toBe(true);
		expect(linkSchema.safeParse({ kind: "slide", picked: "yes" }).success).toBe(false);
		expect(linkSchema.safeParse({ kind: "glide" }).success).toBe(false);
		expect(effectsSchema.safeParse({ bend: { semitones: 1.5, hold: true }, vibrato: {} }).success).toBe(true);
		expect(effectsSchema.safeParse({ bend: { semitones: 3.25 } }).success).toBe(false);
		expect(effectsSchema.safeParse({ tap: true }).success).toBe(true);
		expect(effectsSchema.safeParse({ tap: false }).success).toBe(false);
		expect(percussionSchema.safeParse({ kind: "slap", accent: true }).success).toBe(true);
		expect(percussionSchema.safeParse({ kind: "clap" }).success).toBe(false);
		expect(spanSchema.safeParse({ id: "s", kind: "palmMute", from: "a", to: "b", strings: [0, 5] }).success).toBe(true);
		expect(spanSchema.safeParse({ id: "s", kind: "palmMute", from: "a", to: "b", strings: [6] }).success).toBe(false);
	});

	it("availability rules read the note and its predecessor", () => {
		const ctx = (fret: number | null, prev: NoteContext["prev"], muted = false): NoteContext => ({ fret, muted, prev, maxFret: 24 });
		const avail = (kind: string, c: NoteContext) => techniqueDef(kind)!.available!(c);
		expect(avail("hammer", ctx(7, { fret: 5, muted: false }))).toBeNull();
		expect(avail("hammer", ctx(5, { fret: 7, muted: false }))).toBe("wrong-direction");
		expect(avail("pull", ctx(5, { fret: 7, muted: false }))).toBeNull();
		expect(avail("slide", ctx(5, { fret: 5, muted: false }))).toBe("different-fret");
		expect(avail("tie", ctx(5, { fret: 5, muted: false }))).toBeNull();
		expect(avail("tie", ctx(5, { fret: 7, muted: false }))).toBe("different-fret");
		expect(avail("hammer", ctx(7, null))).toBe("no-previous-note");
		expect(avail("hammer", ctx(7, { fret: 5, muted: true }))).toBe("previous-muted");
		expect(avail("bend", ctx(0, null))).toBe("open-string");
		expect(avail("bend", ctx(null, null))).toBe("no-note");
		expect(avail("bend", ctx(null, null, true))).toBe("muted");
		expect(avail("accent", ctx(0, null))).toBeNull();
		expect(avail("vibrato", ctx(7, null))).toBeNull();
	});

	it("knows nothing about kinds it does not have", () => {
		expect(techniqueDef("flutter")).toBeUndefined();
		expect(supportOf("flutter")).toEqual({ render: false, audio: false });
	});
});
