// Static segment `/chords/grid` takes priority over the `/chords/[rootSlug]` dynamic
// route — root slugs are chromatic note names, so none collides with "grid".
//
// The ?q= URL is the single source of truth for this page: tokens are resolved and
// voicings loaded server-side, which keeps the result shareable/refreshable and spares
// the client a second round-trip. Editing the query re-navigates.

import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { getChordIndex, getChordsBatch } from "@/lib/chordsData";
import { buildChordLookup, classifyBatchQuery } from "@/lib/chordBatchResolve";
import { batchChordPairs, buildBatchGridCards } from "@/lib/chordCards";
import ChordBatchGrid from "@/components/chords/ChordBatchGrid";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
	const { q } = await searchParams;
	const query = typeof q === "string" ? q.trim() : "";
	return {
		title: query ? `${query} — Chords Result | Guitar Pal` : "Chords Result | Guitar Pal",
		description:
			"View several guitar chords side by side, then open any one for all of its voicings.",
	};
}

export default async function ChordGridPage({ searchParams }: Props) {
	const { q } = await searchParams;
	const query = typeof q === "string" ? q : "";

	const index = await getChordIndex();
	const { tokens, truncated } = classifyBatchQuery(buildChordLookup(index), query);
	const chords = await getChordsBatch(batchChordPairs(tokens));
	const cards = buildBatchGridCards(tokens, chords);

	return (
		<div className="flex-1 bg-surface">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
				<div className="flex items-center justify-between">
					<Link href="/chords" className="text-sm text-ink-dim hover:text-ink">
						← Chords
					</Link>
					<h1 className="text-2xl font-semibold text-ink">Chords Result</h1>
					<Link href="/chords/all" className="text-sm text-ink-dim hover:text-ink">
						All Chords →
					</Link>
				</div>
				<ChordBatchGrid cards={cards} truncated={truncated} />
			</div>
		</div>
	);
}
