import { describe, expect, it } from "vitest";
import {
	FINGERPICK_DEMO_BPM_FROM,
	FINGERPICK_DEMO_BPM_TO,
	FINGERPICK_DEMO_MEASURES,
	FINGERPICK_DEMO_SLOT_COUNT,
	fingerpickStage,
} from "../fingerpickStage";

describe("the demo measures", () => {
	it("are two bars of eighths, one pick per slot, chords on the downbeats", () => {
		expect(FINGERPICK_DEMO_MEASURES).toHaveLength(2);
		expect(FINGERPICK_DEMO_SLOT_COUNT).toBe(16);
		for (const m of FINGERPICK_DEMO_MEASURES) {
			expect(m.slots).toHaveLength(8);
			for (const s of m.slots) {
				expect(s.duration).toBe("eighth");
				expect(s.strings.filter((sf) => sf.fret !== null)).toHaveLength(1);
			}
		}
		expect(FINGERPICK_DEMO_MEASURES[0].slots[0].chord).toEqual({ root: "A", suffix: "minor" });
		expect(FINGERPICK_DEMO_MEASURES[1].slots[0].chord).toEqual({ root: "C", suffix: "major" });
	});

	it("show a hammer-on, a slide and a pull-off, each on the string of the note before it", () => {
		const techniques = FINGERPICK_DEMO_MEASURES.flatMap((m, mi) =>
			m.slots.flatMap((s, si) =>
				s.strings.flatMap((sf, str) => (sf.technique ? [{ mi, si, str, technique: sf.technique }] : [])),
			),
		);
		expect(techniques.map((t) => t.technique)).toEqual(["hammer-on", "slide-up", "pull-off"]);
		for (const t of techniques) {
			const prev = FINGERPICK_DEMO_MEASURES[t.mi].slots[t.si - 1];
			expect(prev.strings[t.str].fret).not.toBeNull();
		}
	});
});

describe("fingerpickStage", () => {
	it("writes the notes in over the first phase", () => {
		expect(fingerpickStage(0).revealedSlots).toBe(0);
		expect(fingerpickStage(0.15).revealedSlots).toBe(8);
		expect(fingerpickStage(0.3).revealedSlots).toBe(16);
		expect(fingerpickStage(1).revealedSlots).toBe(16);
	});

	it("plays through both bars, slot by slot, with a fraction towards the next note", () => {
		expect(fingerpickStage(0.2).cursor).toBeNull();
		expect(fingerpickStage(0.3).cursor).toBeNull();
		expect(fingerpickStage(0.31).cursor).toEqual({ measureIndex: 0, slotIndex: 0, within: expect.closeTo(0.4, 5) });
		expect(fingerpickStage(0.5).cursor).toEqual({ measureIndex: 1, slotIndex: 0, within: expect.closeTo(0, 5) });
		expect(fingerpickStage(0.6875).cursor).toEqual({ measureIndex: 1, slotIndex: 7, within: expect.closeTo(0.5, 5) });
		expect(fingerpickStage(0.75).cursor).toBeNull();
	});

	it("reads the position off the cursor, then off the loop", () => {
		expect(fingerpickStage(0).position).toBe("BAR 01 · BEAT 1 · PASS 01");
		expect(fingerpickStage(0.5).position).toBe("BAR 02 · BEAT 1 · PASS 01");
		expect(fingerpickStage(0.66).position).toBe("BAR 02 · BEAT 4 · PASS 01");
		expect(fingerpickStage(0.8).position).toBe("LOOP · BAR 02");
	});

	it("keeps its focus on the bar being written, then the cursor's, then the loop's", () => {
		expect(fingerpickStage(0).focusMeasure).toBe(0);
		expect(fingerpickStage(0.15).focusMeasure).toBe(0);
		expect(fingerpickStage(0.2).focusMeasure).toBe(1);
		expect(fingerpickStage(0.4).focusMeasure).toBe(0);
		expect(fingerpickStage(0.6).focusMeasure).toBe(1);
		expect(fingerpickStage(0.71).focusMeasure).toBe(1);
		expect(fingerpickStage(0.9).focusMeasure).toBe(1);
	});

	it("loops the second bar and slows it down", () => {
		expect(fingerpickStage(0.7).loop).toBe(false);
		expect(fingerpickStage(0.7).bpm).toBe(FINGERPICK_DEMO_BPM_FROM);
		expect(fingerpickStage(0.72).loop).toBe(true);
		expect(fingerpickStage(0.84).bpm).toBe(75);
		expect(fingerpickStage(1).bpm).toBe(FINGERPICK_DEMO_BPM_TO);
	});
});
