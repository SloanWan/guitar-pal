import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { plainText, renderDoc, slugify } from "@/lib/docs/renderDoc";

describe("slugify", () => {
	it("makes an anchor out of a heading", () => {
		expect(slugify("Chords and rhythm on one line")).toBe("chords-and-rhythm-on-one-line");
		expect(slugify("  A chord with a pick order  ")).toBe("a-chord-with-a-pick-order");
		expect(slugify("Strings & frets, written out")).toBe("strings-frets-written-out");
		expect(slugify("读法")).toBe("读法");
	});
});

describe("renderDoc", () => {
	const doc = renderDoc(
		[
			"# The title",
			"",
			"Intro with `code` and **bold**.",
			"",
			"## First section",
			"",
			"### A part",
			"",
			"| Token | Meaning |",
			"| --- | --- |",
			"| `\\|` | bar line |",
			"",
			"## First section",
			"",
			"```",
			"D DU UD | <not html>",
			"```",
			"",
			"#### Too deep for the outline",
		].join("\n"),
	);

	it("takes the first h1 as the title and keeps it out of the outline", () => {
		expect(doc.title).toBe("The title");
		expect(doc.html).toContain("<h1>The title</h1>");
		expect(doc.toc.every((e) => e.text !== "The title")).toBe(true);
	});

	it("lists h2 and h3 with the ids the headings carry, made unique", () => {
		expect(doc.toc).toEqual([
			{ id: "first-section", text: "First section", depth: 2 },
			{ id: "a-part", text: "A part", depth: 3 },
			{ id: "first-section-2", text: "First section", depth: 2 },
		]);
		expect(doc.html).toContain('<h2 id="first-section">First section</h2>');
		expect(doc.html).toContain('<h2 id="first-section-2">First section</h2>');
		expect(doc.html).toContain('<h3 id="a-part">A part</h3>');
		expect(doc.html).toContain("<h4");
	});

	it("renders GFM tables with an escaped pipe, and escapes code", () => {
		expect(doc.html).toContain("<table>");
		expect(doc.html).toContain("<code>|</code>");
		expect(doc.html).toContain("&lt;not html&gt;");
	});

	it("strips markup from the heading text it lists", () => {
		const rendered = renderDoc("## Read `this` **whole**");
		expect(rendered.toc[0]).toEqual({ id: "read-this-whole", text: "Read this whole", depth: 2 });
		expect(plainText([])).toBe("");
	});

	it("renders the assistant grammar with an outline for both modes", () => {
		const markdown = readFileSync(path.join(process.cwd(), "docs", "assistant-grammar.md"), "utf8");
		const rendered = renderDoc(markdown);
		expect(rendered.title).toBe("What the assistant reads");
		const sections = rendered.toc.filter((e) => e.depth === 2).map((e) => e.text);
		expect(sections).toContain("Strum");
		expect(sections).toContain("Tab");
		expect(new Set(rendered.toc.map((e) => e.id)).size).toBe(rendered.toc.length);
	});

	it("keeps the Chinese grammar in step with the English: same outline shape, same examples", () => {
		const read = (file: string) => readFileSync(path.join(process.cwd(), "docs", file), "utf8");
		const enSource = read("assistant-grammar.md");
		const en = renderDoc(enSource);
		const zh = renderDoc(read("assistant-grammar.zh.md"));
		expect(zh.title).toBe("助手能读懂什么");
		expect(zh.toc.map((e) => e.depth)).toEqual(en.toc.map((e) => e.depth));
		expect(new Set(zh.toc.map((e) => e.id)).size).toBe(zh.toc.length);
		// The English page carries no Chinese at all: the Chinese sentence
		// forms are the Chinese page's. The Chinese page lists both languages'
		// forms, so its example blocks, with the Chinese lines taken out, are
		// the English page's blocks, in the same order.
		const cjk = /[　-〿㐀-䶿一-鿿＀-￯]/;
		expect(enSource).not.toMatch(cjk);
		const blocks = (html: string) =>
			[...html.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g)].map((m) =>
				m[1]
					.split("\n")
					// The sentence only: what follows the arrow explains it, in either language.
					.map((line) => line.split(/\s+→\s+/)[0].trimEnd())
					.filter((line) => !cjk.test(line))
					.join("\n"),
			);
		expect(blocks(zh.html)).toEqual(blocks(en.html));
	});
});
