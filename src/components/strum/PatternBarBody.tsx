"use client";

import { useState } from "react";
import { Bar } from "@/lib/strumPatterns";
import StepGrid, { type ActiveCell, type ChordView } from "./StepGrid";
import type { BarChordDiagram } from "./useBarChordDiagrams";
import ChordViewToggle from "./ChordViewToggle";
import { DEFAULT_METER, type Meter } from "@/lib/strumMeter";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

interface Props {
	/** The bars actually playing — carries any chord the user picked this session. */
	bars: Bar[];
	activeCell: ActiveCell | null;
	/** Given, each bar's chord label becomes a picker. Session-only on a pattern. */
	onBarChordChange?: (barIdx: number, chord: ConfirmedChord | null) => void;
	/** The pattern's time signature; decides how the beats are counted. */
	meter?: Meter;
	/** Chord names, or the shapes to hold. Shared with the progressions tab. */
	chordView?: ChordView;
	onChordViewChange?: (view: ChordView) => void;
	barDiagrams?: (BarChordDiagram | null)[];
	onEditChordShape?: (barIdx: number) => void;
}

/** The grid itself, filling a `StepGridCard` below its header. */
export default function PatternBarBody({
	bars,
	activeCell,
	onBarChordChange,
	meter = DEFAULT_METER,
	chordView = "name",
	onChordViewChange,
	barDiagrams,
	onEditChordShape,
}: Props) {
	const [pickerBarIdx, setPickerBarIdx] = useState<number | null>(null);

	function handleConfirm(chord: ConfirmedChord | null) {
		if (pickerBarIdx !== null) onBarChordChange?.(pickerBarIdx, chord);
		setPickerBarIdx(null);
	}

	return (
		<>
			{onChordViewChange && (
				// The same choice the progressions tab offers. A pattern's chords are
				// session-only, but seeing the shape you are playing is as useful here.
				<div className="flex shrink-0 justify-end px-3 pt-2 sm:px-5">
					<ChordViewToggle value={chordView} onChange={onChordViewChange} />
				</div>
			)}
			{/* The card is as tall as this body needs; once the column runs out of
			    room the body shrinks and scrolls instead of overflowing. */}
			<div className="flex min-h-0 flex-col items-center overflow-y-auto px-3 py-5 sm:px-5">
				{/* my-auto centres the grid in the leftover space when the body is
				    capped, without clipping a tall one the way justify-center would. */}
				<div className="my-auto w-full">
					<StepGrid
						bars={bars}
						activeCell={activeCell}
						meter={meter}
						chordView={chordView}
						barDiagrams={barDiagrams}
						onEditChordShape={onEditChordShape}
						onChordClick={onBarChordChange ? setPickerBarIdx : undefined}
					/>
				</div>
			</div>

			<ChordPickerModal
				open={pickerBarIdx !== null}
				onClose={() => setPickerBarIdx(null)}
				onConfirm={handleConfirm}
				initialChord={pickerBarIdx !== null ? bars[pickerBarIdx]?.chord : null}
			/>
		</>
	);
}
