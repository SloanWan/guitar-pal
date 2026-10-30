import type { CSSProperties } from "react";
import Link from "@/components/AppLink";
import { DOC_LANGS, type DocLang } from "@/lib/docs/docLang";

/**
 * The language switch on a document page: one segment per language the
 * document exists in, the current one raised. Each is a link to the same
 * page with `?lang=`, so the choice is in the URL — shareable, and what the
 * page renders on the server — rather than in a store. It wears the
 * Segmented track (`gp-seg`) but stays links, not a radiogroup.
 */

const LABELS: Record<DocLang, string> = { en: "English", zh: "中文" };

export default function DocLangSwitch({ lang }: { lang: DocLang }) {
	// Segmented's own thumb math, inline: that module is a client one, and
	// this switch renders on the server.
	const index = DOC_LANGS.indexOf(lang);
	return (
		<nav aria-label="Language" data-dense="" className="gp-seg">
			{index >= 0 && (
				<span
					className="gp-seg-thumb"
					aria-hidden
					style={{ "--i": index, "--n": DOC_LANGS.length } as CSSProperties}
				/>
			)}
			{DOC_LANGS.map((option) => {
				const current = option === lang;
				return (
					<Link
						key={option}
						href={`?lang=${option}`}
						aria-current={current ? "page" : undefined}
						hrefLang={option}
						className={`gp-focus relative z-1 flex items-center justify-center rounded-gp-sm px-2.5 text-[13px] leading-none font-semibold whitespace-nowrap transition-colors duration-(--gp-d-state) ${
							current ? "text-gp-ink" : "text-gp-ink-3 hover:text-gp-ink-2"
						}`}
					>
						{LABELS[option]}
					</Link>
				);
			})}
		</nav>
	);
}
