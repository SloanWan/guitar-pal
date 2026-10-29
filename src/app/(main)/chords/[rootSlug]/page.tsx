import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import ChordsHubPage from "@/components/chords/hub/ChordsHubPage";
import { withGlyphs } from "@/lib/chordFormulas";
import { canonicalSlug, libraryRoot, rootToSlug, slugToRoot } from "@/lib/chordSlug";
import { ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import type { BoardParams } from "@/lib/chordBoard";
import { DEFAULT_HUB_QUALITY } from "@/lib/chordsHub";

type Props = { params: Promise<{ rootSlug: string }>; searchParams: Promise<BoardParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { rootSlug } = await params;
	const root = libraryRoot(slugToRoot(rootSlug));
	return {
		title: `${withGlyphs(root)} Chords — Chord Charts | Guitar Pal`,
		alternates: { canonical: `/chords/${rootToSlug(root)}` },
	};
}

// The hub, opened on one root's chords: a root keeps an address of its own, under
// either spelling — /chords/g-sharp and /chords/a-flat are the same chords.
export default async function RootPage({ params, searchParams }: Props) {
	const { rootSlug } = await params;
	const board = await searchParams;
	const moved = canonicalSlug(rootSlug, slugToRoot, rootToSlug);
	if (moved !== null) {
		const query = new URLSearchParams(Object.entries(board).filter((e): e is [string, string] => typeof e[1] === "string"));
		permanentRedirect(`/chords/${moved}${query.size > 0 ? `?${query}` : ""}`);
	}
	const root = libraryRoot(slugToRoot(rootSlug));
	if (!ROOT_CHROMATIC_ORDER.includes(root)) notFound();
	return <ChordsHubPage view="root" root={root} quality={DEFAULT_HUB_QUALITY} board={board.board === undefined ? null : board} />;
}
