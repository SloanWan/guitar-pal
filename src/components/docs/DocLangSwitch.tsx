import Link from "@/components/AppLink";
import { DOC_LANGS, type DocLang } from "@/lib/docs/docLang";

/**
 * The language switch on a document page: one segment per language the
 * document exists in, the current one marked. Each is a link to the same
 * page with `?lang=`, so the choice is in the URL — shareable, and what the
 * page renders on the server — rather than in a store.
 */

const LABELS: Record<DocLang, string> = { en: "EN", zh: "中文" };

export default function DocLangSwitch({ lang }: { lang: DocLang }) {
	return (
		<nav aria-label="Language" className="flex border border-line-strong font-mono text-[11px] uppercase tracking-[0.08em]">
			{DOC_LANGS.map((option) => {
				const current = option === lang;
				return (
					<Link
						key={option}
						href={`?lang=${option}`}
						aria-current={current ? "page" : undefined}
						hrefLang={option}
						className={`px-2.5 py-1 transition-colors duration-(--dur-hover) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 ${
							current ? "bg-denim-tint text-denim-accent" : "text-ink-dim hover:text-ink"
						}`}
					>
						{LABELS[option]}
					</Link>
				);
			})}
		</nav>
	);
}
