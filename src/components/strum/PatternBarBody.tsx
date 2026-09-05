"use client";

import { useState } from "react";
import { Bar } from "@/lib/strumPatterns";
import StepGrid, { type ActiveCell } from "./StepGrid";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

interface Props {
	/** The bars actually playing — carries any chord the user picked this session. */
	bars: Bar[];
	activeCell: ActiveCell | null;
	/** Given, each bar's chord label becomes a picker. Session-only on a pattern. */
	onBarChordChange?: (barIdx: number, chord: ConfirmedChord | null) => void;
}

/** The grid itself, filling a `StepGridCard` below its header. */
export default function PatternBarBody({ bars, activeCell, onBarChordChange }: Props) {
	const [pickerBarIdx, setPickerBarIdx] = useState<number | null>(null);

	function handleConfirm(chord: ConfirmedChord | null) {
		if (pickerBarIdx !== null) onBarChordChange?.(pickerBarIdx, chord);
		setPickerBarIdx(null);
	}

	return (
		<>
			{/* The card is as tall as this body needs; once the column runs out of
			    room the body shrinks and scrolls instead of overflowing. */}
			<div className="flex min-h-0 flex-col items-center overflow-y-auto px-3 py-5 sm:px-5">
				{/* my-auto centres the grid in the leftover space when the body is
				    capped, without clipping a tall one the way justify-center would. */}
				<div className="my-auto w-full">
					<StepGrid
						bars={bars}
						activeCell={activeCell}
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
