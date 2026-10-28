import type { Metadata } from "next";
import ChordsHubPage from "@/components/chords/hub/ChordsHubPage";
import type { BoardParams } from "@/lib/chordBoard";
import { DEFAULT_HUB_ROOT, parseHubQuality, parseHubView } from "@/lib/chordsHub";

export const metadata: Metadata = {
	title: "Guitar Chord Charts | Guitar Pal",
	description: "Look up guitar chords by name or by shape, lay several side by side, and browse every chord by root or quality.",
};

type Props = { searchParams: Promise<{ view?: string; quality?: string } & BoardParams> };

export default async function ChordsPage({ searchParams }: Props) {
	const { view, quality, ...board } = await searchParams;
	return (
		<ChordsHubPage
			view={parseHubView(view)}
			root={DEFAULT_HUB_ROOT}
			quality={parseHubQuality(quality)}
			board={board.board === undefined ? null : board}
		/>
	);
}
