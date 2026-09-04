import { useState } from "react";
import { Bar, StrumPattern } from "@/lib/strumPatterns";
import StepGrid, { type ActiveCell } from "./StepGrid";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

interface Props {
	pattern: StrumPattern;
	/** The bars actually playing — carries any chord the user picked this session. */
	bars: Bar[];
	activeCell: ActiveCell | null;
	onBarChordChange?: (barIdx: number, chord: ConfirmedChord | null) => void;
}

export default function StepGridCard({ pattern, bars, activeCell, onBarChordChange }: Props) {
	const [pickerBarIdx, setPickerBarIdx] = useState<number | null>(null);

	function handleConfirm(chord: ConfirmedChord | null) {
		if (pickerBarIdx !== null) onBarChordChange?.(pickerBarIdx, chord);
		setPickerBarIdx(null);
	}

	return (
		<>
			{/* v3 card: hairline border, no shadow, radius 0, dedicated --step-grid-bg surface */}
			<div className="flex max-h-full flex-col overflow-hidden border border-line bg-step-grid">
				<div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-5 py-4">
					<div className="flex flex-col gap-0.5">
						<h3 className="font-heading capitalize text-base font-semibold text-ink">
							{pattern.name}
						</h3>
						<p className="text-xs text-ink-dim">{pattern.description}</p>
					</div>
				</div>
				{/* Scrolls internally: a capped-height column cannot grow with the bar count. */}
				<div className="flex min-h-0 flex-col items-center overflow-y-auto px-5 py-5">
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
