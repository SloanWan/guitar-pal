import { readFileSync } from "node:fs";
import path from "node:path";
import { headers } from "next/headers";
import { isDocLang, preferredDocLang, type DocLang } from "@/lib/docs/docLang";
import { renderDoc, type RenderedDoc } from "@/lib/docs/renderDoc";

/**
 * What a Markdown document page needs on the server: the language it shows
 * and the document rendered from `docs/`. Two files per document, one per
 * language, kept in step by hand.
 *
 * The file is read per request: these segments render per request (the
 * topbar reads the session), so the read is cached once in production and
 * repeated in development, where the document is being edited. Every file
 * read here must be listed in next.config's `outputFileTracingIncludes`, or
 * the standalone build ships without it.
 */

export type DocSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** `?lang=` when it names a language we have, else the browser's preference. */
export async function resolveDocLang(searchParams: DocSearchParams): Promise<DocLang> {
	const { lang } = await searchParams;
	if (isDocLang(lang)) return lang;
	return preferredDocLang((await headers()).get("accept-language"));
}

const cached = new Map<string, RenderedDoc>();

/** `docs/<file>` rendered; `file` is relative to `docs/`. */
export function loadMarkdownDoc(file: string): RenderedDoc {
	const hit = cached.get(file);
	if (hit && process.env.NODE_ENV !== "development") return hit;
	const doc = renderDoc(readFileSync(path.join(process.cwd(), "docs", file), "utf8"));
	cached.set(file, doc);
	return doc;
}
