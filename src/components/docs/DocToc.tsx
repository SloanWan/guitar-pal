"use client";

import { useEffect, useState } from "react";
import type { TocEntry } from "@/lib/docs/renderDoc";

/**
 * The outline beside a document page: every `##` and `###`, the one the
 * reader is at marked. Wide screens get it as a sidebar that stays put while
 * the article scrolls; a phone gets the same list folded under a summary at
 * the top, since a column beside a 16px gutter is no column at all.
 *
 * Which heading is current is watched, not computed on scroll: an observer
 * over a band at the top of the viewport, and the first visible heading in
 * document order wins. When none is in the band — a long section, or a jump
 * from the outline that lands a heading above it — the last heading that has
 * gone past the band is the one the reader is under.
 */

/** The top 35% of the viewport: a heading in it is "the one you're at". */
const ACTIVE_BAND = "0px 0px -65% 0px";
const ACTIVE_BAND_BOTTOM = 0.35;

function List({ entries, active }: { entries: readonly TocEntry[]; active: string | null }) {
	return (
		<ol className="space-y-0.5">
			{entries.map((entry) => (
				<li key={entry.id} className={entry.depth === 3 ? "pl-3" : "pt-1.5 first:pt-0"}>
					<a
						href={`#${entry.id}`}
						aria-current={active === entry.id ? "location" : undefined}
						className={`block border-l py-0.5 pl-3 leading-snug transition-colors duration-(--dur-hover) hover:text-ink focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 ${
							active === entry.id
								? "border-denim text-denim-accent"
								: entry.depth === 3
									? "border-transparent text-ink-faint"
									: "border-transparent text-ink-dim"
						}`}
					>
						{entry.text}
					</a>
				</li>
			))}
		</ol>
	);
}

export default function DocToc({ entries, label }: { entries: readonly TocEntry[]; label: string }) {
	const [active, setActive] = useState<string | null>(null);

	useEffect(() => {
		const headings = entries
			.map((entry) => document.getElementById(entry.id))
			.filter((el): el is HTMLElement => el !== null);
		if (headings.length === 0) return;

		const visible = new Set<string>();
		const observer = new IntersectionObserver(
			(records) => {
				for (const record of records) {
					if (record.isIntersecting) visible.add(record.target.id);
					else visible.delete(record.target.id);
				}
				const first = headings.find((el) => visible.has(el.id));
				if (first) {
					setActive(first.id);
					return;
				}
				const limit = window.innerHeight * ACTIVE_BAND_BOTTOM;
				const passed = headings.filter((el) => el.getBoundingClientRect().top < limit);
				if (passed.length > 0) setActive(passed[passed.length - 1].id);
			},
			{ rootMargin: ACTIVE_BAND },
		);
		for (const el of headings) observer.observe(el);
		return () => {
			observer.disconnect();
			// A new document (the other language) starts with nothing marked.
			setActive(null);
		};
	}, [entries]);

	return (
		<>
			<details className="mb-6 border border-line bg-panel px-3 py-2 md:hidden">
				<summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					{label}
				</summary>
				<nav aria-label={label} className="mt-3 text-[13px]">
					<List entries={entries} active={active} />
				</nav>
			</details>
			<nav
				aria-label={label}
				className="sticky top-6 hidden w-56 flex-none self-start text-[13px] md:block"
			>
				<p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-faint">{label}</p>
				<List entries={entries} active={active} />
			</nav>
		</>
	);
}
