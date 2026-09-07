// Static segment `/chords/create` takes priority over the `/chords/[rootSlug]`
// dynamic route — root slugs are chromatic note names, so none collides with
// "create".
//
// Reached only from the shape search, when nothing in the library was held the
// way the player wrote it. There is no link to it anywhere else, and without a
// shape in the URL there is nothing here to do — so a bare /chords/create is a
// 404 rather than an empty form nobody arrived at on purpose.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "@/components/AppLink";
import { parseTabSequence } from "@/lib/chordTabSequence";
import { identifyChords } from "@/lib/chordIdentify";
import { getAllChordsWithVoicings } from "@/lib/chordsData";
import CreateChordView from "@/components/chords/CreateChordView";

type Props = { searchParams: Promise<{ frets?: string }> };

export const metadata: Metadata = {
	title: "Write a Chord | Guitar Pal",
	description: "Write down a chord shape the library does not carry.",
	// One player's chord, reachable only from their own search: nothing to index.
	robots: { index: false, follow: false },
};

export default async function CreateChordPage({ searchParams }: Props) {
	const { frets } = await searchParams;
	const written = typeof frets === "string" ? frets.trim() : "";
	const parsed = parseTabSequence(written);

	if (!parsed.frets) notFound();

	// Named here rather than in the browser: the whole library with its voicings
	// is what the notes are matched against, and it is already cached on this
	// side. Only the handful of names it comes back with crosses the wire.
	const guesses = identifyChords(await getAllChordsWithVoicings(), parsed.frets);

	return (
		<div className="flex flex-1 flex-col bg-surface">
			<div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
				<div className="flex w-full items-center justify-between">
					<Link href="/chords" className="text-sm text-ink-dim hover:text-ink">
						← Chords
					</Link>
					<h1 className="text-2xl font-semibold text-ink">Write a chord</h1>
					<Link href="/chords/all" className="text-sm text-ink-dim hover:text-ink">
						All Chords →
					</Link>
				</div>
				<div className="flex flex-1 justify-center">
					<CreateChordView frets={parsed.frets} written={written} guesses={guesses} />
				</div>
			</div>
		</div>
	);
}
