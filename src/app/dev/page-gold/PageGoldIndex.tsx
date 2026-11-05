"use client";

import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import { agreement, type PageGoldSet } from "@/lib/pageGold";
import { countStatuses } from "@/lib/tabGold";
import StatusChip from "../tab-gold/StatusChip";
import { KIND_LABEL } from "./kinds";
import { fetchPageSets, pageHref } from "./pageGoldApi";

/** Every book, how far its review has got, and a way into each page. */
export default function PageGoldIndex() {
	const [data, setData] = useState<{ root: string; sets: PageGoldSet[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchPageSets()
			.then(setData)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
	}, []);

	const all = data?.sets.flatMap((set) => set.items) ?? [];
	const total = agreement(all);
	const firstOpen = data?.sets
		.map((set) => ({ set: set.name, item: set.items.find((item) => item.status === "unchecked") }))
		.find((x) => x.item);

	return (
		<main className="tg tg-index">
			<h1 className="tg-title">Page gold review</h1>
			<p className="tg-lede">
				Each page starts with the classifier&apos;s answer. Check its kind, mark the notation printed on it, and
				count its tab exercises. What you save is the gold the page classifier is scored against.
			</p>
			{error && <p className="tg-error">{error}</p>}
			{data && data.sets.length === 0 && (
				<p className="tg-empty">
					Nothing to review under <code>{data.root}</code>. Seed it with{" "}
					<code>cd book-service &amp;&amp; .venv/bin/python -m evals.classify.seed</code>.
				</p>
			)}
			{data && all.length > 0 && (
				<p className="tg-meta pg-total">
					{all.length - countStatuses(all).unchecked} of {all.length} pages reviewed
					{total.answered > 0 && ` · the model's kind kept on ${total.kept} of ${total.answered}`}
					{firstOpen?.item && (
						<>
							{" · "}
							<Link className="tg-go" href={pageHref(firstOpen.set, firstOpen.item.id)}>
								Review next
							</Link>
						</>
					)}
				</p>
			)}
			{data?.sets.map((set) => {
				const counts = countStatuses(set.items);
				const done = set.items.length - counts.unchecked;
				return (
					<section key={set.name} className="tg-set" aria-label={set.title}>
						<header className="tg-set-head">
							<div>
								<h2>{set.title}</h2>
								<p className="tg-meta">
									{done} of {set.items.length} reviewed · {counts.confirmed} kind kept · {counts.corrected} kind
									changed · {counts.unusable} unusable
								</p>
							</div>
						</header>
						<ol className="tg-list">
							{set.items.map((item) => (
								<li key={item.id}>
									<Link href={pageHref(set.name, item.id)}>
										<span className="tg-page">p.{item.page}</span>
										<span className="tg-name">{item.kind ? KIND_LABEL[item.kind].label : "—"}</span>
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
