"use client";

import type { CSSProperties } from "react";
import type { Beat, StepValue } from "@/lib/strumPatterns";
import { cellCountLabels, type Meter } from "@/lib/strumMeter";

/** Where the playhead is, in the rhythm's own bars. */
export interface RhythmPosition {
	bar: number;
	beat: number;
	cell: number;
}

interface Props {
	rhythm: Beat[][];
	meter: Meter;
	/** Null while stopped. */
	position: RhythmPosition | null;
	/** Cycle a cell. Absent, the grid is read-only (a shared snapshot). */
	onToggle?: (bar: number, beat: number, cell: number) => void;
}

const SAY: Record<StepValue, string> = { "": "rest", D: "down", U: "up", X: "muted" };

function StrokeIcon({ value }: { value: StepValue }) {
	if (value === "") return <i aria-hidden />;
	const path =
		value === "D" ? "M12 4v15M6 13l6 6 6-6" : value === "U" ? "M12 20V5M6 11l6-6 6 6" : "M7 7l10 10M17 7 7 17";
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d={path} />
		</svg>
	);
}

/**
 * The pattern's rhythm, every cell a button: click to cycle it (down / up / muted /
 * rest, leading with the stroke the hand is already travelling in). Each beat is
 * only as wide as its cells; on a phone the beats share the line by cell count.
 */
export default function RhythmGrid({ rhythm, meter, position, onToggle }: Props) {
	const multiBar = rhythm.length > 1;
	return (
		<>
			{rhythm.map((beats, bi) => (
				<div key={bi} className="st-barline">
					{multiBar && <span className="st-lab st-num st-barno">{bi + 1}</span>}
					<div className="st-beats" role="group" aria-label={multiBar ? `Bar ${bi + 1}` : "Rhythm"}>
						{beats.map((beat, ti) => {
							const counts = cellCountLabels(meter, ti, beat.length);
							return (
								<div key={ti} className="st-beat" style={{ "--n": String(beat.length) } as CSSProperties}>
									{beat.map((value, ci) => {
										const now =
											position !== null && position.bar === bi && position.beat === ti && position.cell === ci;
										const label = `${multiBar ? `Bar ${bi + 1}, ` : ""}beat ${ti + 1}, ${counts[ci] || "·"}: ${SAY[value]}`;
										const cellProps = {
											className: "st-cell",
											"data-v": value,
											"data-now": now ? "" : undefined,
										};
										return (
											<div key={ci} className="st-cw">
												{onToggle ? (
													<button
														type="button"
														{...cellProps}
														aria-label={label}
														onClick={() => onToggle(bi, ti, ci)}
													>
														<StrokeIcon value={value} />
													</button>
												) : (
													<span {...cellProps} role="img" aria-label={label}>
														<StrokeIcon value={value} />
													</span>
												)}
												<span className="st-cnt" data-beat={ci === 0 ? "" : undefined} aria-hidden>
													{counts[ci]}
												</span>
											</div>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			))}
		</>
	);
}
