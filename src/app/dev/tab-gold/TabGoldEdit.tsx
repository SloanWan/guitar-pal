"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import TabEditPage from "@/components/fingerpick/editor/TabEditPage";
import { makeDefaultPattern } from "@/lib/fingerpickEdit";
import { isDropped, modelPattern, unplacedChords, type TabGoldRecord } from "@/lib/tabGold";
import type { EditorTarget } from "@/lib/tabEditorEntry";
import { cropSrc, fetchRecord, putReview, reviewHref } from "./tabGoldApi";

/**
 * The tab editor on one exercise, the crop beside it. It opens on the
 * correction when there is one, else on the model's reading; Save keeps the
 * tab as the exercise's gold (`corrected`) and goes back to the review.
 */
export default function TabGoldEdit({ set, id }: { set: string; id: string }) {
	const [record, setRecord] = useState<TabGoldRecord | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchRecord(set, id)
			.then(setRecord)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
	}, [set, id]);

	const target = useMemo<EditorTarget | null>(() => {
		if (!record) return null;
		const pattern = record.gold ?? modelPattern(record).pattern ?? makeDefaultPattern();
		const chords = unplacedChords(record, pattern);
		return {
			pattern,
			notice: {
				title: record.name,
				text:
					(isDropped(record)
						? "The parse lost this exercise, so there is no reading to start from: write the tab from the crop, then Save. The tab you save is this exercise's gold."
						: "Fix what the model misread — frets, strings, durations, rests, bars — then Save. The tab you save is this exercise's gold.") +
					(chords.length > 0
						? ` The page prints chords the model read but did not place (${chords.join(" ")}): select the note each starts on and pick it under Slot → Chord.`
						: ""),
				warnings: record.model.warnings.map((w) => w.message),
			},
			source: { src: cropSrc(record), page: record.page, wide: true },
			saveTitle: "Save as this exercise's gold",
			save: async (tab) => {
				await putReview(set, id, { status: "corrected", gold: tab, jianpu: record.jianpu, note: record.note });
			},
			back: reviewHref(set, id),
		};
	}, [record, set, id]);

	if (error) {
		return (
			<main className="tg">
				<p className="tg-error">{error}</p>
				<Link href={reviewHref(set, id)}>Back to the review</Link>
			</main>
		);
	}
	if (!target) return <main className="tg tg-meta">Loading…</main>;
	return <TabEditPage id="new" target={target} />;
}
