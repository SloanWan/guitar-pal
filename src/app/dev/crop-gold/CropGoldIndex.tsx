"use client";

import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import type { CropGoldBatch } from "@/lib/cropGold";
import { fetchBatches, pageHref } from "./cropGoldApi";

/** Every batch, how far its review has got, and a way into each page. */
export default function CropGoldIndex() {
	const [data, setData] = useState<{ root: string; batches: CropGoldBatch[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchBatches()
			.then(setData)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
	}, []);

	return (
		<main className="tg tg-index">
			<h1 className="tg-title">Crop review</h1>
			<p className="tg-lede">
				Before any model reads a tab, check what it will be given: each page with the boxes the segmenter drew round its
				exercises. Fix a box that cuts off a heading or the marks under the last staff, box an exercise it missed, and
				mark one that is not an exercise. The crops are rendered again from what you save.
			</p>
			{error && <p className="tg-error">{error}</p>}
			{data && data.batches.length === 0 && (
				<p className="tg-empty">
					No batch under <code>{data.root}</code>: a batch is a folder with a <code>segments.json</code> and its{" "}
					<code>pages/</code>. Point <code>CROP_GOLD_DIR</code> at a checkout that has the materials.
				</p>
			)}
			{data?.batches.map((batch) => {
				const done = batch.items.filter((item) => item.status === "reviewed").length;
				const first = batch.items.find((item) => item.status === "unchecked") ?? batch.items[0];
				const boxed = batch.items.reduce((n, item) => n + item.exercises, 0);
				const counted = batch.items.reduce((n, item) => n + (item.goldExercises ?? 0), 0);
				return (
					<section key={batch.name} className="tg-set" aria-label={batch.name}>
						<header className="tg-set-head">
							<div>
								<h2>{batch.name}</h2>
								<p className="tg-meta">
									{done} of {batch.items.length} pages reviewed · {boxed} boxed for {counted} exercises on the pages
								</p>
							</div>
							{first && (
								<Link className="tg-go" href={pageHref(batch.name, first.id)}>
									{done < batch.items.length ? "Review next" : "Open"}
								</Link>
							)}
						</header>
						<ol className="tg-list">
							{batch.items.map((item) => {
								const { adjusted, added, removed } = item.changes;
								const changed = [
									adjusted && `${adjusted} adjusted`,
									added && `${added} added`,
									removed && `${removed} not an exercise`,
								].filter(Boolean);
								return (
									<li key={item.id}>
										<Link href={pageHref(batch.name, item.id)}>
											<span className="tg-page">p.{item.page}</span>
											<span className="tg-name">
												{item.set} ·{" "}
												<span className="cg-count" data-off={item.exercises !== item.goldExercises || undefined}>
													{item.exercises} boxed / {item.goldExercises ?? "?"}
												</span>
												{changed.length > 0 && ` · ${changed.join(", ")}`}
											</span>
											<span className="tg-status" data-status={item.status === "reviewed" ? "confirmed" : "unchecked"}>
												{item.status === "reviewed" ? "Reviewed" : "Unchecked"}
											</span>
										</Link>
									</li>
								);
							})}
						</ol>
					</section>
				);
			})}
		</main>
	);
}
