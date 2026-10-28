import ChordsHub from "./ChordsHub";
import { getChordIndex, getChordsByRoot, getChordsBySuffix } from "@/lib/chordsData";
import type { BoardParams } from "@/lib/chordBoard";
import type { HubView } from "@/lib/chordsHub";

interface Props {
	view: HubView;
	root: string;
	quality: string;
	board: BoardParams | null;
}

/** The hub with what its library view needs read on the server, so it draws on first paint. */
export default async function ChordsHubPage({ view, root, quality, board }: Props) {
	const [index, chords] = await Promise.all([
		getChordIndex(),
		view === "root" ? getChordsByRoot(root) : view === "quality" ? getChordsBySuffix(quality) : Promise.resolve([]),
	]);
	return <ChordsHub view={view} root={root} quality={quality} chords={chords} index={index} board={board} />;
}
