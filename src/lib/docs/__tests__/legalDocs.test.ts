import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_LANGS } from "@/lib/docs/docLang";
import { CONTACT_EMAIL, LEGAL_DOC_NAMES, LEGAL_DOCS, legalDocFile } from "@/lib/docs/legalDocs";
import { renderDoc } from "@/lib/docs/renderDoc";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (file: string) => readFileSync(path.join(ROOT, "docs", file), "utf8");

describe("the legal documents", () => {
	for (const name of LEGAL_DOC_NAMES) {
		it(`${name}: both languages exist, carry their title and the contact, and keep the same outline`, () => {
			const outlines = DOC_LANGS.map((lang) => {
				const file = legalDocFile(name, lang);
				expect(existsSync(path.join(ROOT, "docs", file)), file).toBe(true);
				const doc = renderDoc(read(file));
				expect(doc.title, file).toBe(LEGAL_DOCS[name][lang].title);
				expect(read(file), file).toContain(CONTACT_EMAIL);
				return doc.toc.map((t) => t.depth);
			});
			expect(outlines[1]).toEqual(outlines[0]);
		});
	}

	it("are all carried into the standalone build", () => {
		const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
		for (const name of LEGAL_DOC_NAMES) {
			for (const lang of DOC_LANGS) expect(config).toContain(`./docs/${legalDocFile(name, lang)}`);
		}
	});
});
