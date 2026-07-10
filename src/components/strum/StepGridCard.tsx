import { useState } from "react";
import { Music } from "lucide-react";
import { StrumPattern } from "@/lib/strumPatterns";
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
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
			<Card className="shadow-sm border-slate-200">
				<CardHeader className="border-b border-slate-100 px-5 py-4">
					<div className="flex items-start justify-between gap-2">
						<div className="flex flex-col gap-0.5">
							<CardTitle className="capitalize text-base font-semibold text-slate-800">
								{pattern.name}
							</CardTitle>
							<CardDescription className="text-xs text-slate-400">
								{pattern.description}
							</CardDescription>
						</div>
						<button
							onClick={() => setPickerOpen(true)}
							className={`flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border ${
								selectedChord
									? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-white"
									: "border-slate-200 text-slate-400 hover:border-denim hover:text-denim hover:bg-denim-tint"
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
				</CardHeader>
				<CardContent className="flex flex-col items-center px-5 py-5">
					<StepGrid beats={pattern.beats} activeCell={activeCell} />
				</CardContent>
			</Card>

			<ChordPickerModal
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onConfirm={handleConfirm}
				initialChord={selectedChord}
			/>
		</>
	);
}
