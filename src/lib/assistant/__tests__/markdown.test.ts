import { describe, it, expect } from "vitest";
import { parseReply, safeHref, visibleLength } from "@/lib/assistant/markdown";

describe("parseReply", () => {
	it("reads emphasis, code and a single newline as a break", () => {
		expect(parseReply("Use **C & G** and `x<y`\nthen *rest*")).toEqual([
			{
				kind: "p",
				children: [
					{ kind: "text", text: "Use " },
					{ kind: "strong", children: [{ kind: "text", text: "C & G" }] },
					{ kind: "text", text: " and " },
					{ kind: "code", text: "x<y" },
					{ kind: "br" },
					{ kind: "text", text: "then " },
					{ kind: "em", children: [{ kind: "text", text: "rest" }] },
				],
			},
		]);
	});

	it("reads headings, lists, code blocks, quotes and rules", () => {
		const tree = parseReply("## Steps\n\n1. Fret **C**\n2. Strum\n\n- a\n- b\n\n```\nD DU UDU\n```\n\n> Slow first\n\n---");
		expect(tree.map((block) => block.kind)).toEqual(["heading", "list", "list", "pre", "quote", "hr"]);
		expect(tree[0]).toEqual({ kind: "heading", level: 2, children: [{ kind: "text", text: "Steps" }] });
		expect(tree[1]).toMatchObject({ kind: "list", ordered: true, start: 1 });
		expect(tree[1].kind === "list" && tree[1].items[0]).toEqual([
			{ kind: "p", children: [{ kind: "text", text: "Fret " }, { kind: "strong", children: [{ kind: "text", text: "C" }] }] },
		]);
		expect(tree[2]).toMatchObject({ kind: "list", ordered: false });
		expect(tree[3]).toEqual({ kind: "pre", text: "D DU UDU" });
	});

	it("keeps an ordered list's start", () => {
		expect(parseReply("3. three\n4. four")[0]).toMatchObject({ kind: "list", ordered: true, start: 3 });
	});

	it("reads a table with its alignment", () => {
		expect(parseReply("| Chord | Fret |\n|:-|-:|\n| C | 3 |")).toEqual([
			{
				kind: "table",
				align: ["left", "right"],
				header: [[{ kind: "text", text: "Chord" }], [{ kind: "text", text: "Fret" }]],
				rows: [[[{ kind: "text", text: "C" }], [{ kind: "text", text: "3" }]]],
			},
		]);
	});

	it("never lets the model's words become markup", () => {
		const tree = parseReply('<b>hi</b> ![pic](http://x/y.png) <script>alert(1)</script>\n\n<div onclick="x">block</div>');
		expect(JSON.stringify(tree)).not.toContain("<");
		expect(tree[0]).toEqual({
			kind: "p",
			children: [
				{ kind: "text", text: "hi" },
				{ kind: "text", text: " " },
				{ kind: "text", text: "pic" },
				{ kind: "text", text: " " },
				{ kind: "text", text: "alert(1)" },
			],
		});
	});

	it("keeps a link only to the web, mail or our own pages", () => {
		const [p] = parseReply("[doc](/docs/assistant-grammar) [web](https://x.org) [bad](javascript:alert(1)) [far](//evil.com)");
		expect(p.kind === "p" && p.children.filter((node) => node.kind === "link")).toEqual([
			{ kind: "link", href: "/docs/assistant-grammar", children: [{ kind: "text", text: "doc" }] },
			{ kind: "link", href: "https://x.org", children: [{ kind: "text", text: "web" }] },
		]);
		expect(JSON.stringify(p)).toContain('"bad"');
		expect(JSON.stringify(p)).not.toContain("javascript");
	});

	it("reads plain prose as one paragraph", () => {
		expect(parseReply("Just words.")).toEqual([{ kind: "p", children: [{ kind: "text", text: "Just words." }] }]);
	});
});

describe("safeHref", () => {
	it("allows the web, mail and site paths only", () => {
		expect(safeHref("https://a.b")).toBe("https://a.b");
		expect(safeHref("MAILTO:a@b.c")).toBe("MAILTO:a@b.c");
		expect(safeHref("/strum")).toBe("/strum");
		expect(safeHref("//a.b")).toBeNull();
		expect(safeHref("javascript:x")).toBeNull();
		expect(safeHref("data:text/html,x")).toBeNull();
	});
});

describe("visibleLength", () => {
	it("counts what the reader sees, not the markup", () => {
		expect(visibleLength(parseReply("**ab** `cd`"))).toBe(5);
		expect(visibleLength(parseReply("a\nb"))).toBe(3);
		expect(visibleLength(parseReply("- ab\n- c\n\n---"))).toBe(4);
		expect(visibleLength(parseReply("| a | b |\n|-|-|\n| cd | e |"))).toBe(5);
	});
});
