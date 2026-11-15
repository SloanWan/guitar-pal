import type { Metadata } from "next";
import MarkdownDocPage from "@/components/docs/MarkdownDocPage";
import type { DocLang } from "@/lib/docs/docLang";
import { loadMarkdownDoc, resolveDocLang, type DocSearchParams } from "@/lib/docs/markdownDoc";

/**
 * `docs/assistant-grammar.md` as a page: what the Strum and Tab assistants
 * read, with the outline beside it. The Markdown is the one source — this
 * page renders it, and the panel links here.
 *
 * Two documents, one per language, kept in step by hand. `?lang=zh` picks
 * one; without it the browser's own preference does.
 */

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

export async function generateMetadata({ searchParams }: { searchParams: DocSearchParams }): Promise<Metadata> {
	const lang = await resolveDocLang(searchParams);
	return { title: COPY[lang].title, description: COPY[lang].description };
}

export default async function AssistantGrammarPage({ searchParams }: { searchParams: DocSearchParams }) {
	const lang = await resolveDocLang(searchParams);
	return <MarkdownDocPage lang={lang} doc={loadMarkdownDoc(DOC_FILES[lang])} tocLabel={COPY[lang].toc} guide />;
}
