import { describe, expect, it } from "vitest";
import { isDocLang, preferredDocLang } from "@/lib/docs/docLang";

describe("preferredDocLang", () => {
	it("is English with no header, an empty one, or one asking for neither", () => {
		expect(preferredDocLang(null)).toBe("en");
		expect(preferredDocLang(undefined)).toBe("en");
		expect(preferredDocLang("")).toBe("en");
		expect(preferredDocLang("fr-FR,fr;q=0.9")).toBe("en");
	});

	it("reads Chinese in any region, and English in any", () => {
		expect(preferredDocLang("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
		expect(preferredDocLang("zh-TW")).toBe("zh");
		expect(preferredDocLang("ZH-Hans-CN")).toBe("zh");
		expect(preferredDocLang("en-GB,en;q=0.9,zh;q=0.8")).toBe("en");
	});

	it("goes by weight, not by position, and skips a language weighted to zero", () => {
		expect(preferredDocLang("en;q=0.5, zh;q=0.9")).toBe("zh");
		expect(preferredDocLang("fr, zh;q=0.8, en;q=0.9")).toBe("en");
		expect(preferredDocLang("zh;q=0, en;q=0.5")).toBe("en");
	});

	it("does not take Zulu for Chinese", () => {
		expect(preferredDocLang("zu-ZA")).toBe("en");
	});
});

describe("isDocLang", () => {
	it("accepts the two languages and nothing else", () => {
		expect(isDocLang("en")).toBe(true);
		expect(isDocLang("zh")).toBe(true);
		expect(isDocLang("fr")).toBe(false);
		expect(isDocLang(["zh"])).toBe(false);
		expect(isDocLang(undefined)).toBe(false);
	});
});
