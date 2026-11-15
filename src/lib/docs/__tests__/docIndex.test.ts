import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_GUIDES, docHref } from "@/lib/docs/docIndex";

const DOCS_ROUTES = path.resolve(__dirname, "../../../app/(main)/docs");

describe("the docs index", () => {
	it("lists every page under /docs, and nothing else", () => {
		const pages = readdirSync(DOCS_ROUTES, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
		expect(DOC_GUIDES.map((g) => g.slug).sort()).toEqual(pages);
	});

	it("links a guide in the language asked for", () => {
		expect(docHref("install")).toBe("/docs/install");
		expect(docHref("mcp", "zh")).toBe("/docs/mcp?lang=zh");
	});
});
