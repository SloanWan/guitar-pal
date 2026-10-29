"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TocEntry } from "@/lib/docs/renderDoc";

/**
 * The outline beside a document page: every `##` and `###`, the one the
 * reader is at lifted onto a pale tint. From 960px it is a sidebar that stays
 * put while the article scrolls; below, the same list folds under a summary
 * at the top, since a column beside a phone gutter is no column at all.
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
		<ol className="flex flex-col gap-0.5">
			{entries.map((entry) => (
				<li key={entry.id} className={entry.depth === 3 ? "pl-3" : "pt-1.5 first:pt-0"}>
					<a
						href={`#${entry.id}`}
						aria-current={active === entry.id ? "location" : undefined}
						className={`gp-focus block rounded-gp-sm px-2.5 py-1 leading-snug transition-colors duration-(--gp-d-state) hover:text-gp-ink ${
							active === entry.id
								? "bg-gp-well font-semibold text-gp-ink"
								: entry.depth === 3
									? "text-gp-ink-3"
									: "font-medium text-gp-ink-2"
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
			<details className="group mb-6 rounded-gp-lg bg-gp-card px-4 py-3 min-[960px]:hidden">
				<summary className="gp-focus flex cursor-pointer list-none items-center justify-between rounded-gp-sm text-(length:--gp-t-ui) font-semibold text-gp-ink [&::-webkit-details-marker]:hidden">
					{label}
					<ChevronDown
						className="size-4 text-gp-ink-3 transition-transform duration-(--gp-d-state) group-open:rotate-180"
						aria-hidden="true"
					/>
				</summary>
				<nav aria-label={label} className="mt-3 text-[13.5px]">
					<List entries={entries} active={active} />
				</nav>
			</details>
			<nav
				aria-label={label}
				className="sticky top-6 hidden w-60 flex-none self-start text-[13.5px] min-[960px]:block"
			>
				<p className="mb-2 px-2.5 text-(length:--gp-t-cap) font-semibold text-gp-ink-3">{label}</p>
				<List entries={entries} active={active} />
			</nav>
		</>
	);
}
