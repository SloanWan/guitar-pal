/**
 * Which language a document page shows. Two documents, one per language,
 * kept in step by hand; the page picks one from the URL, else from the
 * browser's preference.
 */

export type DocLang = "en" | "zh";

export const DOC_LANGS: readonly DocLang[] = ["en", "zh"];

export function isDocLang(value: unknown): value is DocLang {
	return value === "en" || value === "zh";
}

/**
 * The language an `Accept-Language` header asks for, among the ones we have:
 * the first tag by weight that is Chinese or English, English when neither
 * is asked for or the header is missing.
 */
export function preferredDocLang(acceptLanguage: string | null | undefined): DocLang {
	if (!acceptLanguage) return "en";
	const tags = acceptLanguage
		.split(",")
		.map((part, index) => {
			const [tag, ...params] = part.trim().split(";");
			const q = params
				.map((p) => /^\s*q\s*=\s*([\d.]+)/i.exec(p)?.[1])
				.find((v) => v !== undefined);
			return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q) || 0, index };
		})
		.filter((t) => t.tag !== "" && t.q > 0)
		.sort((a, b) => b.q - a.q || a.index - b.index);
	for (const { tag } of tags) {
		if (tag === "zh" || tag.startsWith("zh-")) return "zh";
		if (tag === "en" || tag.startsWith("en-")) return "en";
	}
	return "en";
}
