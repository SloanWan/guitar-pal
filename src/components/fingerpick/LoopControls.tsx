import Segmented from "./Segmented";
import { LOOP_GAP_OPTIONS, type LoopGapSeconds } from "./playbackConstants";

export interface LoopGapPickerProps {
	value: LoopGapSeconds;
	onChange: (gap: LoopGapSeconds) => void;
}

// Silence between loop passes — the same picker in the desktop panel and the
// mobile drawer; both show it only while looping.
export function LoopGapPicker({ value, onChange }: LoopGapPickerProps) {
	return (
		<Segmented
			options={LOOP_GAP_OPTIONS.map((gap) => ({
				value: String(gap),
				label: `${gap}S`,
			}))}
			value={String(value)}
			onChange={(v) => onChange(Number(v) as LoopGapSeconds)}
		/>
	);
}
