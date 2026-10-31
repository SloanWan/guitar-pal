import { describe, it, expect } from "vitest";

import { DEFAULT_PANELS, parsePanels } from "@/lib/fretboard/panels";

describe("parsePanels", () => {
	it("shows both cards when nothing was stored", () => {
		expect(parsePanels(null)).toEqual(DEFAULT_PANELS);
		expect(DEFAULT_PANELS).toEqual({ piano: true, circle: true });
	});

	it("reads back a stored choice", () => {
		expect(parsePanels(JSON.stringify({ piano: false, circle: true }))).toEqual({ piano: false, circle: true });
		expect(parsePanels(JSON.stringify({ piano: true, circle: false }))).toEqual({ piano: true, circle: false });
	});

	it("falls back to shown for a missing, mistyped or broken value", () => {
		expect(parsePanels(JSON.stringify({ piano: false }))).toEqual({ piano: false, circle: true });
		expect(parsePanels(JSON.stringify({ piano: "no", circle: 0 }))).toEqual(DEFAULT_PANELS);
		expect(parsePanels("[")).toEqual(DEFAULT_PANELS);
		expect(parsePanels("null")).toEqual(DEFAULT_PANELS);
	});
});
