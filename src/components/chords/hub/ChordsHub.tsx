"use client";

import "./hub.css";
import { useMemo } from "react";
import { useFavouriteChords } from "@/components/chords/useFavouriteChords";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useUser } from "@/hooks/useUser";
import { addToBoard, type BoardParams } from "@/lib/chordBoard";
import { buildChordLookup } from "@/lib/chordBatchResolve";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordWithVoicings } from "@/lib/chordsData";
import type { HubView } from "@/lib/chordsHub";
import { chordIndexWithUser } from "@/lib/userChordVoicings";
import AskBar from "./AskBar";
import Board from "./Board";
import HubLibrary from "./HubLibrary";
import { useBoard } from "./useBoard";

export interface ChordsHubProps {
	view: HubView;
	root: string;
	quality: string;
	chords: readonly ChordWithVoicings[];
	index: readonly ChordIndexEntry[];
	/** The board's parameters as the page was asked for them; null when the URL carries no board. */
	board: BoardParams | null;
}

/** /chords: look chords up, lay them side by side on the board, and browse the library. */
export default function ChordsHub({ view, root, quality, chords, index, board }: ChordsHubProps) {
	const { user, loading } = useUser();
	const { voicings: userVoicings } = useUserChordVoicings(user, loading);
	const favourites = useFavouriteChords(user, loading);
	const searchIndex = useMemo(() => chordIndexWithUser(index, userVoicings), [index, userVoicings]);
	const lookup = useMemo(() => buildChordLookup(searchIndex), [searchIndex]);
	const { items, transpose, capo, cards, update, setTranspose, setCapo } = useBoard(board, index, userVoicings);

	return (
		<div className="hb-page">
			<div className="hb-in">
				<AskBar index={searchIndex} lookup={lookup} onAdd={(added) => update(addToBoard(items, added))} />
				<Board
					items={items}
					cards={cards}
					transpose={transpose}
					capo={capo}
					onChange={update}
					onTranspose={setTranspose}
					onCapo={setCapo}
				/>
				<HubLibrary
					view={view}
					root={root}
					quality={quality}
					chords={chords}
					index={index}
					userVoicings={userVoicings}
					favourites={favourites}
					onAdd={(added) => update(addToBoard(items, added))}
				/>
				<p className="hb-credit">
					Voicing data via{" "}
					<a href="https://github.com/tombatossals/chords-db" target="_blank" rel="noopener noreferrer">
						tombatossals/chords-db
					</a>{" "}
					· audio samples via{" "}
					<a href="https://github.com/surikov/webaudiofontdata" target="_blank" rel="noopener noreferrer">
						WebAudioFont
					</a>
				</p>
			</div>
		</div>
	);
}
