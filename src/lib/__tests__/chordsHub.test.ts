import { describe, it, expect } from "vitest";
import {
	HUB_QUALITIES,
	hubCategoryId,
	hubQualityHref,
	hubRootHref,
	hubViewHref,
	parseHubQuality,
	parseHubView,
	qualityLabel,
} from "@/lib/chordsHub";

describe("chords hub addresses", () => {
	it("puts a root in the path and everything else in the query", () => {
		expect(hubRootHref("C#")).toBe("/chords/c-sharp");
		expect(hubRootHref("?")).toBe("/chords");
		expect(hubQualityHref("7#9")).toBe("/chords?view=quality&quality=7%239");
		expect(hubViewHref("table", "C", "m7")).toBe("/chords?view=table");
		expect(hubViewHref("favourites", "C", "m7")).toBe("/chords?view=favourites");
		expect(hubViewHref("root", "Eb", "m7")).toBe("/chords/e-flat");
	});

	it("reads a view and a quality, falling back for anything else", () => {
		expect(parseHubView("mine")).toBe("mine");
		expect(parseHubView("favourites")).toBe("favourites");
		expect(parseHubView("grid")).toBe("root");
		expect(parseHubView(undefined)).toBe("root");
		expect(parseHubQuality("maj7")).toBe("maj7");
		expect(parseHubQuality("7sg")).toBe("m7");
	});

	it("offers every categorised quality once", () => {
		expect(new Set(HUB_QUALITIES).size).toBe(HUB_QUALITIES.length);
		expect(HUB_QUALITIES).toContain("major");
	});

	it("names a category's anchor and a quality's chip", () => {
		expect(hubCategoryId("Dominant 7th")).toBe("cat-dominant-7th");
		expect(qualityLabel("major")).toBe("maj");
		expect(qualityLabel("minor")).toBe("m");
		expect(qualityLabel("m7b5")).toBe("m7b5");
	});
});
