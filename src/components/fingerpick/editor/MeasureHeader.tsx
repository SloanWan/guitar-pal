import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpToLine, Copy, RotateCcw, X as XIcon } from "lucide-react";
import type { Measure } from "@/lib/fingerpickTypes";
import {
	canShiftMeasureStrings,
	cloneMeasureInPattern,
	deleteMeasure,
	shiftMeasureStrings,
	swapMeasures,
	withMeasures,
} from "@/lib/fingerpickEdit";
import { measureDiffersFromHints, replaceMeasureWithHints, type FretHint } from "@/lib/fingerpickChords";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";

export interface MeasureHeaderProps {
	measure: Measure;
	measureIndex: number;
	measureCount: number;
	commit: CommitPattern;
	/** Whether the pattern carries any chord marks (shows the snap-to-shapes control). */
	hasChords: boolean;
	/** What each string plays in the shape under every slot of this measure. */
	hints: readonly (FretHint[] | null)[] | undefined;
	/** Where the bar a copy or a move landed now is: the cursor follows it. */
	onBar: (measureIndex: number) => void;
	/** A move: the block plays a short slide-in from the side it came from. */
	onNudge: (dir: "left" | "right") => void;
}

// The row above a bar's grid: its number, the copy / move controls, and on the
// right the string shifts, the snap-to-shapes and delete controls. One line,
// always: the bar-level three tight together, a divider, then what acts inside.
export default function MeasureHeader({
	measure,
	measureIndex,
	measureCount,
	commit,
	hasChords,
	hints,
	onBar,
	onNudge,
}: MeasureHeaderProps) {
	const hintFor = (si: number) => hints?.[si] ?? null;
	const differs = hasChords && measureDiffersFromHints(measure, hintFor);
	const hasNotes = measure.slots.some((s) => s.strings.some((x) => x.fret !== null));

	return (
		<div className="te-mb-head">
			<span className="te-mb-lab">Bar {measureIndex + 1}</span>
			<div className="te-mb-tools">
				<button
					type="button"
					className="te-mb-ic"
					onClick={() => {
						commit((p) => cloneMeasureInPattern(p, measureIndex, crypto.randomUUID()));
						onBar(measureCount);
					}}
					aria-label="Copy measure"
					title="Copy the bar to the end"
				>
					<Copy aria-hidden />
				</button>
				<button
					type="button"
					className="te-mb-ic"
					onClick={() => {
						commit((p) => withMeasures(p, swapMeasures(p.measures, measureIndex, measureIndex - 1)));
						onBar(measureIndex - 1);
						onNudge("left");
					}}
					disabled={measureIndex === 0}
					aria-label="Move measure left"
					title="Move the bar left"
				>
					<ArrowLeft aria-hidden />
				</button>
				<button
					type="button"
					className="te-mb-ic"
					onClick={() => {
						commit((p) => withMeasures(p, swapMeasures(p.measures, measureIndex, measureIndex + 1)));
						onBar(measureIndex + 1);
						onNudge("right");
					}}
					disabled={measureIndex === measureCount - 1}
					aria-label="Move measure right"
					title="Move the bar right"
				>
					<ArrowRight aria-hidden />
				</button>
				<span aria-hidden className="te-mb-div" />
				{/* Every note a string up or down, frets kept: for a bar read onto
				    the wrong line. Off when a note already sits on the edge string. */}
				{([-1, 1] as const).map((direction) => {
					const can = canShiftMeasureStrings(measure, direction);
					const label = direction === -1 ? "Move all notes up a string" : "Move all notes down a string";
					return (
						<button
							key={direction}
							type="button"
							className="te-mb-ic"
							onClick={() => commit((p) => shiftMeasureStrings(p, measureIndex, direction))}
							disabled={!can}
							aria-label={label}
							title={can ? `${label} (frets stay as they are)` : hasNotes ? "A note is already on the edge string" : "Nothing to move"}
						>
							{direction === -1 ? <ArrowUpToLine aria-hidden /> : <ArrowDownToLine aria-hidden />}
						</button>
					);
				})}
				{/* Snap the whole bar back to its chord shapes — live only while some
				    fret differs from what the shape would write. */}
				{hasChords && (
					<button
						type="button"
						className="te-mb-ic"
						onClick={() => commit((p) => replaceMeasureWithHints(p, measureIndex, hintFor))}
						disabled={!differs}
						aria-label="Replace this measure's frets with the chord shapes'"
						title={differs ? "Snap every fret in the bar to the chord shape's" : "Every fret in the bar already matches the chord shape"}
					>
						<RotateCcw aria-hidden />
					</button>
				)}
				<button
					type="button"
					className="te-mb-ic"
					data-danger=""
					onClick={() => commit((p) => deleteMeasure(p, measureIndex))}
					disabled={measureCount <= 1}
					aria-label="Delete measure"
					title="Delete the bar"
				>
					<XIcon aria-hidden />
				</button>
			</div>
		</div>
	);
}
