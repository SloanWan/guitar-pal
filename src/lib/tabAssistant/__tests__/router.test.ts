import { describe, it, expect } from "vitest";
import { routeTabInput } from "@/lib/tabAssistant/router";
import { INDEX } from "./fixtures";

const route = (input: string) => routeTabInput(input, INDEX);

const TAB = [
	"e|------0-------0-|",
	"B|----1-------1---|",
	"G|--0-------0-----|",
	"D|----------------|",
	"A|3-------3-------|",
	"E|----------------|",
].join("\n");

describe("routeTabInput", () => {
	it("sends a chord and an order to pick-order", () => {
		const r = route("Am: 5 3 2 1 3 2 1 3");
		expect(r.path).toBe("pick-order");
		if (r.path !== "pick-order") return;
		expect(r.reading.chordWords.map((w) => w.text)).toEqual(["Am"]);
		expect(r.reading.order).toHaveLength(8);
	});

	it("sends a style word to style, with its preset", () => {
		const r = route("travis picking in Am");
		expect(r.path).toBe("style");
		if (r.path !== "style") return;
		expect(r.preset.id).toBe("travis-picking");
		const zh = route("Am 三指法");
		expect(zh.path).toBe("style");
	});

	it("prefers a written order over a style word", () => {
		const r = route("travis in Am: 5 3 2 1");
		expect(r.path).toBe("pick-order");
	});

	it("sends a bare chord line to chords", () => {
		const r = route("C G Am F");
		expect(r.path).toBe("chords");
	});

	it("sends a pasted tab to ascii, reading the prose around it for a name and a meter", () => {
		const r = route(`name it blackbird, 3/4\n${TAB}`);
		expect(r.path).toBe("ascii");
		if (r.path !== "ascii") return;
		expect(r.name).toBe("blackbird");
		expect(r.draft.timeSignature).toEqual([3, 4]);
		expect(r.draft.measures).toHaveLength(1);
	});

	it("does not hold a pasted tab's title against it", () => {
		const r = route(`Blackbird intro\n${TAB}`);
		expect(r.path).toBe("ascii");
	});

	it("sends what it could not read whole to the model, with the reason", () => {
		expect(route("")).toEqual({ path: "llm", reason: "empty" });
		expect(route("something gentle for a rainy day")).toEqual({ path: "llm", reason: "unread" });
		expect(route("D DU UD")).toEqual({ path: "llm", reason: "unread" });
		expect(route("Am 5")).toEqual({ path: "llm", reason: "unread" });
		expect(route("please")).toEqual({ path: "llm", reason: "nothing-musical" });
	});

	it("sends a style whose preset is missing to the model", () => {
		expect(routeTabInput("travis in Am", INDEX, [])).toEqual({ path: "llm", reason: "style-unavailable" });
	});
});
