"use client";

import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { countStatuses, type TabGoldSet } from "@/lib/tabGold";
import StatusChip from "./StatusChip";
import { fetchSets, reviewHref } from "./tabGoldApi";

/** Every gold set, how far its review has got, and a way into each exercise. */
export default function TabGoldIndex() {
	const [data, setData] = useState<{ root: string; sets: TabGoldSet[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchSets()
			.then(setData)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
	}, []);

	return (
		<main className="tg tg-index">
			<h1 className="tg-title">Tab gold review</h1>
			<p className="tg-lede">
				Each exercise is a crop the tab extractor read and the draft it made. Check the reading against the page: mark
				it correct, fix it in the editor, or set it aside. What you save is the gold the extractor is scored against.
			</p>
			{error && <p className="tg-error">{error}</p>}
			{data && data.sets.length === 0 && (
				<p className="tg-empty">
					Nothing to review under <code>{data.root}</code>. Seed it with{" "}
					<code>cd book-service &amp;&amp; python -m evals.tab.seed</code>, or point <code>TAB_GOLD_DIR</code> at a
					checkout that has the materials.
				</p>
			)}
			{data?.sets.map((set) => {
				const counts = countStatuses(set.items);
				const done = set.items.length - counts.unchecked;
				const first = set.items.find((item) => item.status === "unchecked") ?? set.items[0];
				return (
					<section key={set.name} className="tg-set" aria-label={set.title}>
						<header className="tg-set-head">
							<div>
								<h2>{set.title}</h2>
								<p className="tg-meta">
									{done} of {set.items.length} reviewed · {counts.confirmed} correct as read · {counts.corrected}{" "}
									corrected · {counts.unusable} unusable
								</p>
							</div>
							{first && (
								<Link className="tg-go" href={reviewHref(set.name, first.id)}>
									{counts.unchecked > 0 ? "Review next" : "Open"}
								</Link>
							)}
						</header>
						<ol className="tg-list">
							{set.items.map((item) => (
								<li key={item.id}>
									<Link href={reviewHref(set.name, item.id)}>
										<span className="tg-page">p.{item.page ?? "?"}</span>
										<span className="tg-name">{item.name}</span>
										<span className="tg-id">{item.id}</span>
										<StatusChip status={item.status} />
									</Link>
								</li>
							))}
						</ol>
					</section>
				);
			})}
		</main>
	);
}
