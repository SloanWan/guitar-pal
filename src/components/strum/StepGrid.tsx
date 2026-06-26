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

	const iconCls = isSm ? "size-3" : "size-4 md:size-5";
	const beatPy = isSm ? "py-1" : "py-2";
	const containerGap = isSm ? "gap-1" : "gap-2";
	const labelFontSize = isSm ? "text-[8px]" : "text-[12px]";

	const CELL_ARROW_MAP = {
		D: () => <MoveDown className={iconCls} />,
		U: () => <MoveUp className={iconCls} />,
		X: () => <X className={iconCls} />,
		G: () => <></>,
		DG: () => <MoveDown className={iconCls} color="#cfcfcf" />,
		UG: () => <MoveUp className={iconCls} color="#cfcfcf" />,
		D3: () => <MoveDown className={iconCls} />,
		U3: () => <MoveUp className={iconCls} />,
		"": () => <Dot className={iconCls} />,
	};

	return (
		<div className={`flex w-full ${containerGap}`}>
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
					<div className="flex flex-col gap-2 flex-1" key={beatIdx}>
						<div
							className={`flex border rounded-sm ${beatPy} transition-colors duration-100 ${
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
										className={`flex-1 flex justify-center items-center rounded-sm transition-colors duration-100 ${
											isActiveCell ? "text-denim" : ""
										}`}
									>
										<Icon />
									</div>
								);
							})}
						</div>
						{showLabels && (
							<div className="flex">
								{paddedCells.map((_, cellIdx) => {
									const label =
										BEAT_LABELS[beat.length as keyof typeof BEAT_LABELS](
											beatIdx,
										)[cellIdx];
									return (
										<div
											className={`flex-1 flex justify-center ${labelFontSize} text-slate-400`}
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
