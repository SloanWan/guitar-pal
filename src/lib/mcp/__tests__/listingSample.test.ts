import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INDEX } from "@/lib/assistant/tab/__tests__/fixtures";
import { playOrder } from "@/lib/fingerpickRepeats";
import { patternToAsciiTab } from "@/lib/mcp/asciiTab";
import { importTab, type ImportTabInput } from "@/lib/mcp/importTab";

/**
 * The listing's Greensleeves: the image's (public/listing/sample-tab.png) and
 * the text tab's (public/listing/sample-tab.txt) test cases are scored against
 * docs/listing/sample-tab/greensleeves.json, so the three must say the same
 * music. The text tab is the app's own ASCII preview of the JSON, laid out in
 * the image's four systems under a two-line header.
 */
const dir = path.join(process.cwd(), "docs/listing/sample-tab");
const gold = JSON.parse(readFileSync(path.join(dir, "greensleeves.json"), "utf8")) as ImportTabInput;
const SYSTEMS: [number, number][] = [[0, 5], [5, 9], [9, 13], [13, 18]];

describe("the listing's Greensleeves sample", () => {
	const result = importTab(gold, INDEX);

	it("imports as written, its one note before bar 2 read as a pickup", () => {
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings.map((w) => w.code)).toEqual(["PICKUP"]);
		expect(result.pattern.measures).toHaveLength(18);
	});

	it("plays as printed: 1, 2–9, 2–8, 10, 11–18, 11–18", () => {
		if (!result.ok) throw new Error("did not import");
		const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
		expect(playOrder(result.pattern.measures).order.map((i) => i + 1)).toEqual([1, ...range(2, 9), ...range(2, 8), 10, ...range(11, 18), ...range(11, 18)]);
	});

	it("the text tab is the JSON's ASCII, system by system", () => {
		if (!result.ok) throw new Error("did not import");
		const text = readFileSync(path.join(process.cwd(), "public/listing/sample-tab.txt"), "utf8");
		const body = text.split("\n").slice(3).join("\n");
		const written = SYSTEMS.map(([a, b]) => patternToAsciiTab({ ...result.pattern, measures: result.pattern.measures.slice(a, b) })).join("\n\n") + "\n";
		expect(body).toBe(written);
	});
});
