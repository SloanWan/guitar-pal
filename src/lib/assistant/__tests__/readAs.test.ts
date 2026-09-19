import { describe, it, expect } from "vitest";
import { otherDomainReads } from "@/lib/assistant/readAs";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";

const ctx = {
	index: INDEX,
	strumPatterns: [...PRESET_STRUM_PATTERNS, { id: "u1", name: "belief" }],
	tabPatterns: PRESET_FINGERPICK_PATTERNS,
};

describe("otherDomainReads", () => {
	it("offers tab for a pick order typed at the strum assistant", () => {
		expect(otherDomainReads("strum", "Am: 5 3 2 1 3 2 1 3", ctx)).toBe("tab");
	});

	it("offers tab for string and fret lists", () => {
		expect(otherDomainReads("strum", "string:66544322, fret:8-11-10-8-10-8-8-11", ctx)).toBe("tab");
	});

	it("offers tab for an edit that names a fingerpick pattern", () => {
		expect(otherDomainReads("strum", "add to travis picking: Am: 5 3 2 1", ctx)).toBe("tab");
	});

	it("offers strum for a rhythm typed at the tab assistant", () => {
		expect(otherDomainReads("tab", "D DU UDU", ctx)).toBe("strum");
	});

	it("offers strum for an edit that names a strum pattern", () => {
		expect(otherDomainReads("tab", "add C G to belief", ctx)).toBe("strum");
	});

	it("offers nothing when the other assistant would miss too", () => {
		expect(otherDomainReads("strum", "make it sound sadder", ctx)).toBeNull();
		expect(otherDomainReads("tab", "make it sound sadder", ctx)).toBeNull();
		expect(otherDomainReads("strum", "add C G to nosuchpattern", ctx)).toBeNull();
	});

	it("offers nothing for an empty sentence", () => {
		expect(otherDomainReads("strum", "   ", ctx)).toBeNull();
	});
});
