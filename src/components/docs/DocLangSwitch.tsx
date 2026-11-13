"use client";

import { useState } from "react";
import Link from "@/components/AppLink";
import type { DocLang } from "@/lib/docs/docLang";
import "./langSwitch.css";

/**
 * The language switch on a document page, shaped like the theme switch: a
 * round thumb carrying the current language (EN left on a neutral track, 中
 * right on the module's), the other one faint in the empty side. It is a link
 * to the same page with `?lang=`, so the choice is in the URL — shareable, and
 * what the page renders on the server — and it works before hydration. A press
 * slides the thumb at once; the page follows when the navigation lands.
 */

const THUMB: Record<DocLang, string> = { en: "EN", zh: "中" };
const NAME: Record<DocLang, string> = { en: "English", zh: "中文" };

export default function DocLangSwitch({ lang }: { lang: DocLang }) {
	const next: DocLang = lang === "en" ? "zh" : "en";
	// The language a press is heading to, until the page arrives in it.
	const [heading, setHeading] = useState<DocLang | null>(null);
	const shown = heading !== null && heading !== lang ? heading : lang;
	const other: DocLang = shown === "en" ? "zh" : "en";

	return (
		<nav aria-label="Language" className="doc-lang-nav">
			<Link
				href={`?lang=${next}`}
				hrefLang={next}
				aria-label={`${NAME[lang]}. Switch to ${NAME[next]}`}
				data-lang={shown}
				className="doc-lang gp-focus"
				onNavigate={() => setHeading(next)}
			>
				<span className="doc-lang-other" aria-hidden>
					{THUMB[other]}
				</span>
				<span className="doc-lang-thumb" aria-hidden>
					{THUMB[shown]}
				</span>
			</Link>
		</nav>
	);
}
