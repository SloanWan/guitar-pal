import type { Metadata } from "next";
import Link from "@/components/AppLink";
import DocIndexCards from "@/components/docs/DocIndexCards";
import DocLangSwitch from "@/components/docs/DocLangSwitch";
import { PAGE_GUTTER, TEXT_LINK } from "@/components/auth/formText";
import { MCP_REFERENCE_URL } from "@/components/docs/mcpGuideCopy";
import { DOC_INDEX_COPY } from "@/lib/docs/docIndex";
import { LEGAL_DOC_NAMES, LEGAL_DOCS } from "@/lib/docs/legalDocs";
import { resolveDocLang, type DocSearchParams } from "@/lib/docs/markdownDoc";
import "@/components/docs/guide.css";

/**
 * `/docs` (#500): one card per guide, then the developers' reference and the
 * legal pages. Reached from the account menu and ⋯ More, which is how an
 * installed app — no address bar — gets here.
 */

export async function generateMetadata({ searchParams }: { searchParams: DocSearchParams }): Promise<Metadata> {
	const copy = DOC_INDEX_COPY[await resolveDocLang(searchParams)];
	return { title: copy.title, description: copy.description };
}

export default async function DocsIndexPage({ searchParams }: { searchParams: DocSearchParams }) {
	const lang = await resolveDocLang(searchParams);
	const copy = DOC_INDEX_COPY[lang];
	return (
		<div className={`gp-rise mx-auto flex w-full max-w-180 flex-col py-8 max-sm:py-6 ${PAGE_GUTTER}`}>
			<article lang={lang} className="guide-page">
				<header>
					<div className="guide-title-row">
						<h1>{copy.heading}</h1>
						<DocLangSwitch lang={lang} />
					</div>
					<p className="guide-lead">{copy.lead}</p>
				</header>

				<DocIndexCards lang={lang} />

				<footer className="guide-reference flex flex-col gap-3">
					<p>
						{copy.devLead}{" "}
						<a href={MCP_REFERENCE_URL} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
							{copy.devLink}
						</a>
					</p>
					<nav aria-label="Legal">
						<ul className="flex flex-wrap gap-x-5 gap-y-2">
							{LEGAL_DOC_NAMES.map((name) => (
								<li key={name}>
									<Link href={`/${name}?lang=${lang}`} className={TEXT_LINK}>
										{LEGAL_DOCS[name][lang].label}
									</Link>
								</li>
							))}
						</ul>
					</nav>
				</footer>
			</article>
		</div>
	);
}
