import { describe, it, expect } from "vitest";
import { isOrderWord, parsePickOrder } from "@/lib/tabAssistant/parsePickOrder";

const ok = (text: string) => {
	const parsed = parsePickOrder(text);
	if (!parsed.ok) throw new Error(parsed.error);
	return parsed;
};
/** String numbers as a guitarist counts them, for reading a result. */
const numbers = (parsed: ReturnType<typeof ok>) =>
	parsed.order.map((t) => ("rest" in t ? "-" : t.strings.map((s) => s + 1).join("+")));

describe("parsePickOrder", () => {
	it("reads spaced string numbers", () => {
		expect(numbers(ok("5 3 2 1 3 2 1 3"))).toEqual(["5", "3", "2", "1", "3", "2", "1", "3"]);
	});

	it("reads the compact form the editor's Pick box takes", () => {
		expect(numbers(ok("6(32)1(32)"))).toEqual(["6", "3+2", "1", "3+2"]);
	});

	it("reads rests as 0 or -", () => {
		expect(numbers(ok("5 0 3 -"))).toEqual(["5", "-", "3", "-"]);
	});

	it("writes an alternating bass out as two passes", () => {
		const parsed = ok("5/4 2 1 3");
		expect(parsed.alternated).toBe(true);
		expect(numbers(parsed)).toEqual(["5", "2", "1", "3", "4", "2", "1", "3"]);
	});

	it("alternates every thumb in the order, each on its own pair", () => {
		expect(numbers(ok("6/4 3 5/4 2"))).toEqual(["6", "3", "5", "2", "4", "3", "4", "2"]);
	});

	it("refuses a string that does not exist", () => {
		const parsed = parsePickOrder("5 7 2");
		expect(parsed.ok).toBe(false);
	});

	it("refuses a word that is not an order", () => {
		expect(parsePickOrder("5 3 2 travis").ok).toBe(false);
		expect(parsePickOrder("").ok).toBe(false);
	});

	it("keeps 4/4 for the meter and treble pairs for nothing", () => {
		expect(isOrderWord("4/4")).toBe(false);
		expect(isOrderWord("3/2")).toBe(false);
		expect(isOrderWord("5/4")).toBe(true);
		expect(isOrderWord("6/5")).toBe(true);
	});
});
