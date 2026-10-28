import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ChordsHubPage from "@/components/chords/hub/ChordsHubPage";
import { withGlyphs } from "@/lib/chordFormulas";
import { slugToRoot } from "@/lib/chordSlug";
import { ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import type { BoardParams } from "@/lib/chordBoard";
import { DEFAULT_HUB_QUALITY } from "@/lib/chordsHub";

type Props = { params: Promise<{ rootSlug: string }>; searchParams: Promise<BoardParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { rootSlug } = await params;
	return { title: `${withGlyphs(slugToRoot(rootSlug))} Chords — Chord Charts | Guitar Pal` };
}

// The hub, opened on one root's chords: a root keeps an address of its own.
export default async function RootPage({ params, searchParams }: Props) {
	const { rootSlug } = await params;
	const root = slugToRoot(rootSlug);
	if (!ROOT_CHROMATIC_ORDER.includes(root)) notFound();
	const board = await searchParams;
	return <ChordsHubPage view="root" root={root} quality={DEFAULT_HUB_QUALITY} board={board.board === undefined ? null : board} />;
}
