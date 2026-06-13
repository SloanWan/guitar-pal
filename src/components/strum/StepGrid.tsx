import { Beat } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot } from "lucide-react";
import { Card, CardContent, CardTitle, CardHeader } from "@/components/ui/card";

const BEAT_LABELS = {
	1: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	2: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	3: (_beatIdx: number) => ["tri", "p", "let"],
	4: (beatIdx: number) => [`${beatIdx + 1}`, "e", "+", "a"],
};

export default function StepGrid({
	beats,
	activeCell,
	size = "md",
	showLabels = true,
}: {
	beats: Beat[];
	activeCell: {
		beatIdx: number;
		cellIdx: number;
	} | null;
	size?: "sm" | "md"; // default md
	showLabels?: boolean; // default true
}) {
	const isSm = size === "sm";

	// sm: cells are w-3 (12px), 4 cells × 12px = w-12 beat; gap-1 between beats → 4×48+3×4 ≈ 200px total
	const tripletCss = isSm
		? "w-4 flex justify-center"
		: "w-6 nav:w-12 flex justify-center px-auto";
	const eighthCss = isSm ? "w-3 flex justify-center" : "w-8 nav:w-9 flex justify-center px-auto";

	const CELL_ARROW_MAP = {
		D: () => <MoveDown className={eighthCss} />,
		U: () => <MoveUp className={eighthCss} />,
		X: () => <X className={eighthCss} />,
		G: () => <div className={isSm ? "w-3" : "w-9"}></div>,
		DG: () => <MoveDown className={eighthCss} color="#cfcfcf" />,
		UG: () => <MoveUp className={eighthCss} color="#cfcfcf" />,
		D3: () => <MoveDown className={tripletCss} />,
		U3: () => <MoveUp className={tripletCss} />,
		"": () => <Dot className={eighthCss} />,
	};

	const beatWidth = isSm ? "w-12" : "w-24 nav:w-36";
	const beatPy = isSm ? "py-1" : "py-2";
	const containerGap = isSm ? "gap-1" : "gap-2";
	const labelFontSize = isSm ? "text-[8px]" : "text-[12px]";

	return (
		<div>
			{/* container for the whole bar */}
			<div className={`flex ${containerGap}`}>
				{/* map each beat */}
				{beats.map((beat, beatIdx) => {
					const paddedCells =
						beat.length === 1
							? [beat[0], "G", "UG", "G"]
							: beat.length === 2
								? [beat[0], "G", beat[1], "G"]
								: beat;
					const isTriplet = beat.length === 3;
					return (
						// match each cell in this beat
						<div className="flex flex-col gap-2" key={beatIdx}>
							<div
								className={`flex ${beatWidth} border rounded-sm justify-between ${beatPy}`}
							>
								{paddedCells.map((cell, cellIdx) => {
									const Icon =
										CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
									return <Icon key={cellIdx} />;
								})}
							</div>
							{showLabels && (
								<div className={`flex ${beatWidth} justify-between`}>
									{paddedCells.map((_, cellIdx) => {
										const label =
											BEAT_LABELS[beat.length as keyof typeof BEAT_LABELS](
												beatIdx,
											)[cellIdx];
										return (
											<div
												className={`${isTriplet ? tripletCss : eighthCss} ${labelFontSize}`}
												key={cellIdx}
											>
												{label}
											</div>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
