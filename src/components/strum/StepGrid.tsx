import { Beat } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot } from "lucide-react";

const BEAT_LABELS = {
	1: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	2: (beatIdx: number) => [`${beatIdx + 1}`, "", "+", ""],
	3: (_beatIdx: number) => ["tri", "p", "let"],
	4: (beatIdx: number) => [`${beatIdx + 1}`, "e", "+", "a"],
};

// Maps audio engine cellIdx to padded display index (2-cell beats are padded to 4 slots)
function getPaddedCellIdx(beatLength: number, cellIdx: number) {
	if (beatLength === 2) return cellIdx * 2;
	return cellIdx;
}

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
		<div className={`flex ${containerGap}`}>
			{beats.map((beat, beatIdx) => {
				const paddedCells =
					beat.length === 1
						? [beat[0], "G", "UG", "G"]
						: beat.length === 2
							? [beat[0], "G", beat[1], "G"]
							: beat;
				const isTriplet = beat.length === 3;
				const isActiveBeat = activeCell?.beatIdx === beatIdx;
				return (
					<div className="flex flex-col gap-2" key={beatIdx}>
						<div
							className={`flex ${beatWidth} border rounded-sm justify-between ${beatPy} transition-colors duration-100 ${
								isActiveBeat
									? "border-denim/50 bg-denim-tint"
									: "border-slate-200"
							}`}
						>
							{paddedCells.map((cell, cellIdx) => {
								const Icon = CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
								const isActiveCell =
									isActiveBeat &&
									cellIdx === getPaddedCellIdx(beat.length, activeCell!.cellIdx);
								return (
									<div
										key={cellIdx}
										className={`rounded-sm transition-colors duration-100 ${
											isActiveCell ? "text-denim" : ""
										}`}
									>
										<Icon />
									</div>
								);
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
											className={`${isTriplet ? tripletCss : eighthCss} ${labelFontSize} text-slate-400`}
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
	);
}
