"use client";

import { Measure, Duration, durationToWidthMultiplier } from "@/lib/fingerpickTypes";

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"] as const;

const DURATION_SYMBOLS: Record<Duration, string> = {
	whole: "w",
	half: "h",
	quarter: "q",
	eighth: "♪",
	sixteenth: "♬",
	rest: "𝄽",
};

// 48 px per quarter-note base unit — pure, unit-testable via durationToWidthMultiplier
const BASE_WIDTH_PX = 48;

const STRING_SPACING = 18; // px between adjacent string lines
const STRING_COUNT = 6;
const LEFT_MARGIN = 30; // space for string labels
const TOP_MARGIN = 24; // space for duration symbols
const BOTTOM_PADDING = 8;
const RIGHT_PADDING = 12;

interface TabMeasureProps {
	measure: Measure;
}

export default function TabMeasure({ measure }: TabMeasureProps) {
	// Compute each slot's x origin from cumulative widths
	let xAcc = LEFT_MARGIN;
	const slotLayouts = measure.slots.map((slot) => {
		const slotX = xAcc;
		const width = BASE_WIDTH_PX * durationToWidthMultiplier(slot.duration);
		xAcc += width;
		return { slot, slotX, width };
	});

	const staffRight = xAcc; // x of right barline
	const svgWidth = staffRight + RIGHT_PADDING;
	const svgHeight = TOP_MARGIN + STRING_SPACING * (STRING_COUNT - 1) + BOTTOM_PADDING;

	const stringY = (idx: number) => TOP_MARGIN + idx * STRING_SPACING;

	return (
		<svg
			width={svgWidth}
			height={svgHeight}
			className="font-mono overflow-visible"
			role="img"
			aria-label="Guitar TAB measure"
		>
			{/* String labels — e B G D A E */}
			{STRING_LABELS.map((label, i) => (
				<text
					key={label}
					x={LEFT_MARGIN - 5}
					y={stringY(i)}
					textAnchor="end"
					dominantBaseline="middle"
					fontSize={11}
					fill="#94a3b8"
				>
					{label}
				</text>
			))}

			{/* Continuous horizontal string lines */}
			{Array.from({ length: STRING_COUNT }, (_, i) => (
				<line
					key={i}
					x1={LEFT_MARGIN}
					y1={stringY(i)}
					x2={staffRight}
					y2={stringY(i)}
					stroke="#cbd5e1"
					strokeWidth={1}
				/>
			))}

			{/* Left barline */}
			<line
				x1={LEFT_MARGIN}
				y1={stringY(0)}
				x2={LEFT_MARGIN}
				y2={stringY(STRING_COUNT - 1)}
				stroke="#64748b"
				strokeWidth={2}
			/>

			{/* Right barline */}
			<line
				x1={staffRight}
				y1={stringY(0)}
				x2={staffRight}
				y2={stringY(STRING_COUNT - 1)}
				stroke="#64748b"
				strokeWidth={2}
			/>

			{/* Beat slots */}
			{slotLayouts.map(({ slot, slotX, width }) => {
				const cx = slotX + width / 2;

				return (
					<g key={slot.id}>
						{/* Duration symbol above the staff */}
						<text
							x={cx}
							y={TOP_MARGIN - 8}
							textAnchor="middle"
							dominantBaseline="auto"
							fontSize={10}
							fill="#94a3b8"
						>
							{DURATION_SYMBOLS[slot.duration]}
						</text>

						{/* Fret numbers / dashes on each string */}
						{slot.strings.map((fret, stringIdx) => {
							const cy = stringY(stringIdx);
							const isPlayed = fret !== null;
							const label = isPlayed ? String(fret) : "-";
							// Wider knockout for two-digit fret numbers
							const knockoutW = fret !== null && fret >= 10 ? 17 : 10;

							return (
								<g key={stringIdx}>
									{/* White rectangle cuts the string line behind the label */}
									<rect
										x={cx - knockoutW / 2}
										y={cy - 7}
										width={knockoutW}
										height={13}
										fill="white"
									/>
									<text
										x={cx}
										y={cy}
										textAnchor="middle"
										dominantBaseline="middle"
										fontSize={11}
										fill={isPlayed ? "#1e293b" : "#94a3b8"}
									>
										{label}
									</text>
								</g>
							);
						})}
					</g>
				);
			})}
		</svg>
	);
}
