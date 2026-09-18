import { describe, it, expect } from "vitest";
import { uniquePatternName } from "@/lib/uniquePatternName";

describe("uniquePatternName", () => {
	it("keeps a free name, trimmed", () => {
		expect(uniquePatternName("  Waltz ", ["Travis Picking"])).toBe("Waltz");
	});

	it("appends the first free counter when the name is taken, ignoring case", () => {
		expect(uniquePatternName("Waltz", ["waltz"])).toBe("Waltz (1)");
		expect(uniquePatternName("Waltz", ["Waltz", "Waltz (1)"])).toBe("Waltz (2)");
		expect(uniquePatternName("Waltz", ["Waltz", "Waltz (2)"])).toBe("Waltz (1)");
	});

	it("counts up from an existing counter rather than nesting one", () => {
		expect(uniquePatternName("Waltz (1)", ["Waltz", "Waltz (1)"])).toBe("Waltz (2)");
		expect(uniquePatternName("Waltz (1)", ["Waltz"])).toBe("Waltz (1)");
	});

	it("treats a bracketed number without a space as part of the name", () => {
		expect(uniquePatternName("Take(2)", ["Take(2)"])).toBe("Take(2) (1)");
	});
});
