import type { Metadata } from "next";
import MarkdownDocPage from "@/components/docs/MarkdownDocPage";
import type { DocLang } from "@/lib/docs/docLang";
import { LEGAL_DOCS, legalDocFile, type LegalDoc } from "@/lib/docs/legalDocs";
import { loadMarkdownDoc, resolveDocLang, type DocSearchParams } from "@/lib/docs/markdownDoc";

const TOC_LABEL: Record<DocLang, string> = { en: "On this page", zh: "本页目录" };

/**
 * `/privacy`, `/terms` and `/support` (#492): one Markdown document each, in
 * English and Chinese, rendered like the assistant's grammar page. Each route
 * file is the two exports this returns.
 */
export function legalDocPage(name: LegalDoc) {
	return {
		async generateMetadata({ searchParams }: { searchParams: DocSearchParams }): Promise<Metadata> {
			const lang = await resolveDocLang(searchParams);
			const { title, description } = LEGAL_DOCS[name][lang];
			return { title: `${title} | Guitar Pal`, description };
		},
		async Page({ searchParams }: { searchParams: DocSearchParams }) {
			const lang = await resolveDocLang(searchParams);
			return <MarkdownDocPage lang={lang} doc={loadMarkdownDoc(legalDocFile(name, lang))} tocLabel={TOC_LABEL[lang]} />;
		},
	};
}
