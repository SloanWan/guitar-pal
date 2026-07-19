import { useState } from "react";
import { Music } from "lucide-react";
import { StrumPattern } from "@/lib/strumPatterns";
import StepGrid from "./StepGrid";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

interface Props {
	pattern: StrumPattern;
	activeCell: {
		beatIdx: number;
		cellIdx: number;
	} | null;
	selectedChord?: ConfirmedChord | null;
	onChordChange?: (chord: ConfirmedChord | null) => void;
}

export default function StepGridCard({ pattern, activeCell, selectedChord, onChordChange }: Props) {
	const [pickerOpen, setPickerOpen] = useState(false);

	function handleConfirm(chord: ConfirmedChord | null) {
		onChordChange?.(chord);
		setPickerOpen(false);
	}

	return (
		<>
			{/* v3 card: hairline border, no shadow, radius 0, dedicated --step-grid-bg surface */}
			<div className="flex flex-col overflow-hidden border border-line bg-step-grid">
				<div className="flex items-start justify-between gap-2 border-b border-line px-5 py-4">
					<div className="flex flex-col gap-0.5">
						<h3 className="font-heading capitalize text-base font-semibold text-ink">
							{pattern.name}
						</h3>
						<p className="text-xs text-ink-dim">{pattern.description}</p>
					</div>
					<button
						onClick={() => setPickerOpen(true)}
						className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs font-semibold transition-colors border ${
							selectedChord
								? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-on-denim"
								: "border-line-strong text-ink-dim hover:border-denim hover:text-denim hover:bg-denim-tint"
						}`}
					>
						<Music size={11} />
						<span>
							{selectedChord
								? `${selectedChord.root} ${selectedChord.suffix}`
								: "No chord"}
						</span>
					</button>
				</div>
				<div className="flex flex-col items-center px-5 py-5">
					<StepGrid beats={pattern.beats} activeCell={activeCell} />
				</div>
			</div>

			<ChordPickerModal
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onConfirm={handleConfirm}
				initialChord={selectedChord}
			/>
		</>
	);
}
