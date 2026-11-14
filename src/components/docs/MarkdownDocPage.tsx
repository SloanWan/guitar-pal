import DocBackLink from "@/components/docs/DocBackLink";
import DocLangSwitch from "@/components/docs/DocLangSwitch";
import DocToc from "@/components/docs/DocToc";
import { PAGE_GUTTER } from "@/components/auth/formText";
import type { DocLang } from "@/lib/docs/docLang";
import type { RenderedDoc } from "@/lib/docs/renderDoc";
import "./doc.css";

/**
 * A document from `docs/` as a page: the outline beside it from 960px, the
 * title and the language switch on one row above the prose. The documents are
 * the repo's own, never a visitor's, so their HTML is set as rendered
 * (`renderDoc`).
 */
export default function MarkdownDocPage({
	lang,
	doc,
	tocLabel,
	guide = false,
}: {
	lang: DocLang;
	doc: RenderedDoc;
	tocLabel: string;
	/** One of the guides `/docs` lists: it leads with the link back to the index. */
	guide?: boolean;
}) {
	return (
		<div
			className={`gp-rise mx-auto flex w-full max-w-300 flex-col py-8 max-sm:py-6 min-[960px]:flex-row min-[960px]:gap-12 ${PAGE_GUTTER}`}
		>
			<DocToc entries={doc.toc} label={tocLabel} />
			<div className="doc-column min-w-0 flex-1">
				{guide && <DocBackLink lang={lang} />}
				<header lang={lang} className="doc-title-row">
					<h1 className="doc-title" dangerouslySetInnerHTML={{ __html: doc.titleHtml }} />
					<DocLangSwitch lang={lang} />
				</header>
				<article lang={lang} className="doc-prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
			</div>
		</div>
	);
}
