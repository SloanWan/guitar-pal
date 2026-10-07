import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { headers } from "next/headers";
import DocLangSwitch from "@/components/docs/DocLangSwitch";
import DocToc from "@/components/docs/DocToc";
import { isDocLang, preferredDocLang, type DocLang } from "@/lib/docs/docLang";
import { renderDoc, type RenderedDoc } from "@/lib/docs/renderDoc";
import "./doc.css";

/**
 * `docs/assistant-grammar.md` as a page: what the Strum and Tab assistants
 * read, with the outline beside it. The Markdown is the one source — this
 * page renders it, and the panel links here.
 *
 * Two documents, one per language, kept in step by hand. `?lang=zh` picks
 * one; without it the browser's own preference does. The file is read on
 * the server: this segment renders per request (the topbar reads the
 * session), so the read is cached once in production and repeated in
 * development, where the document is being edited.
 */

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** Listed in next.config so the standalone build carries the files. */
const DOC_FILES: Record<DocLang, string> = {
	en: "assistant-grammar.md",
	zh: "assistant-grammar.zh.md",
};

const COPY: Record<DocLang, { title: string; description: string; toc: string }> = {
	en: {
		title: "What the assistant reads | Guitar Pal",
		description: "The sentences the Strum and Tab assistants understand, with examples.",
		toc: "On this page",
	},
	zh: {
		title: "助手能读懂什么 | Guitar Pal",
		description: "Strum 和 Tab 助手能读懂的句子，附例句。",
		toc: "本页目录",
	},
};

const cached = new Map<DocLang, RenderedDoc>();

function loadDoc(lang: DocLang): RenderedDoc {
	const hit = cached.get(lang);
	if (hit && process.env.NODE_ENV !== "development") return hit;
	const doc = renderDoc(readFileSync(path.join(process.cwd(), "docs", DOC_FILES[lang]), "utf8"));
	cached.set(lang, doc);
	return doc;
}

async function resolveLang(searchParams: SearchParams): Promise<DocLang> {
	const { lang } = await searchParams;
	if (isDocLang(lang)) return lang;
	return preferredDocLang((await headers()).get("accept-language"));
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
	const lang = await resolveLang(searchParams);
	return { title: COPY[lang].title, description: COPY[lang].description };
}

export default async function AssistantGrammarPage({ searchParams }: { searchParams: SearchParams }) {
	const lang = await resolveLang(searchParams);
	const doc = loadDoc(lang);
	return (
		<div className="mx-auto flex w-full max-w-300 flex-col gap-0 px-(--gutter) py-8 max-sm:py-6 md:flex-row md:gap-12">
			<DocToc entries={doc.toc} label={COPY[lang].toc} />
			<div className="min-w-0 flex-1">
				<div className="mb-5 flex justify-end md:mb-2">
					<DocLangSwitch lang={lang} />
				</div>
				<article lang={lang} className="doc-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
			</div>
		</div>
	);
}
