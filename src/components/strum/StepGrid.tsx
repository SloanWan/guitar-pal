import { Bar } from "@/lib/strumPatterns";

import { MoveDown, MoveUp, X, Dot, Music } from "lucide-react";

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

export interface ActiveCell {
	barIdx: number;
	/** Beat index within its bar, not into the flattened sequence. */
	beatIdx: number;
	cellIdx: number;
}

export default function StepGrid({
	bars,
	activeCell,
	size = "md",
	showLabels = true,
	onChordClick,
}: {
	bars: Bar[];
	activeCell: ActiveCell | null;
	size?: "sm" | "md"; // default md
	showLabels?: boolean; // default true
	/** When given, each bar's chord label becomes a button scoped to that bar. */
	onChordClick?: (barIdx: number) => void;
}) {
	const isSm = size === "sm";
	const isMultiBar = bars.length > 1;

	const iconCls = isSm ? "size-3" : "size-4 md:size-5";
	const beatPy = isSm ? "py-1" : "py-2";
	const beatGap = isSm ? "gap-1" : "gap-2";
	const labelFontSize = isSm ? "text-[8px]" : "text-[12px]";
	// The chord row is the interaction surface on the playing card; the small
	// library preview stays a bare grid.
	const showChordRow = !isSm;

	const CELL_ARROW_MAP = {
		D: () => <MoveDown className={iconCls} />,
		U: () => <MoveUp className={iconCls} />,
		X: () => <X className={iconCls} />,
		G: () => <></>,
		DG: () => <MoveDown className={iconCls} color="var(--ink-faint)" />,
		UG: () => <MoveUp className={iconCls} color="var(--ink-faint)" />,
		D3: () => <MoveDown className={iconCls} />,
		U3: () => <MoveUp className={iconCls} />,
		"": () => <Dot className={iconCls} />,
	};

	return (
		// One bar per row, two per row from md upwards. A single-bar pattern fills
		// the row and lays out exactly as it did before bars existed.
		<div
			className={`grid w-full grid-cols-1 ${isSm ? "gap-2" : "gap-x-6 gap-y-4"} ${
				isMultiBar && !isSm ? "md:grid-cols-2" : ""
			}`}
		>
			{bars.map((bar, barIdx) => {
				const isActiveBar = activeCell?.barIdx === barIdx;
				const chordLabel = bar.chord ? `${bar.chord.root} ${bar.chord.suffix}` : null;
				return (
					<div
						key={barIdx}
						// The bar line: a hairline down the left edge of every bar.
						className={`flex flex-col gap-1.5 ${
							isMultiBar ? "border-l border-line-strong pl-2" : ""
						}`}
					>
						{showChordRow && (
							<div className="flex items-center gap-2">
								{isMultiBar && (
									<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">
										{barIdx + 1}
									</span>
								)}
								{onChordClick ? (
									<button
										onClick={() => onChordClick(barIdx)}
										className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold transition-colors ${
											chordLabel
												? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-on-denim"
												: "border-line-strong text-ink-dim hover:border-denim hover:bg-denim-tint hover:text-denim"
										}`}
									>
										<Music size={10} />
										<span>{chordLabel ?? "No chord"}</span>
									</button>
								) : (
									chordLabel && (
										<span className="text-[11px] font-semibold text-denim">
											{chordLabel}
										</span>
									)
								)}
							</div>
						)}

						<div className={`flex w-full ${beatGap}`}>
							{bar.beats.map((beat, beatIdx) => {
								const paddedCells =
									beat.length === 1
										? [beat[0], "G", "UG", "G"]
										: beat.length === 2
											? [beat[0], "G", beat[1], "G"]
											: beat;
								const isActiveBeat = isActiveBar && activeCell?.beatIdx === beatIdx;
								return (
									<div className="flex flex-col gap-2 flex-1" key={beatIdx}>
										<div
											className={`flex border ${beatPy} transition-colors duration-100 ${
												isActiveBeat
													? "border-denim/50 bg-denim-tint"
													: "border-line"
											}`}
										>
											{paddedCells.map((cell, cellIdx) => {
												const Icon =
													CELL_ARROW_MAP[cell as keyof typeof CELL_ARROW_MAP];
												const isActiveCell =
													isActiveBeat &&
													cellIdx ===
														getPaddedCellIdx(beat.length, activeCell!.cellIdx);
												return (
													<div
														key={cellIdx}
														className={`flex-1 flex justify-center items-center transition-colors duration-100 ${
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
														BEAT_LABELS[
															beat.length as keyof typeof BEAT_LABELS
														](beatIdx)[cellIdx];
													return (
														<div
															className={`flex-1 flex justify-center ${labelFontSize} text-ink-dim`}
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
			})}
		</div>
	);
}
