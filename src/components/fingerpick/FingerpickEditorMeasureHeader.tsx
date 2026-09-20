import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpToLine, Copy, RotateCcw, X as XIcon } from "lucide-react";
import type { Measure } from "@/lib/fingerpickTypes";
import {
	canShiftMeasureStrings,
	cloneMeasure,
	deleteMeasure,
	shiftMeasureStrings,
	swapMeasures,
} from "@/lib/fingerpickEdit";
import {
	measureDiffersFromHints,
	replaceMeasureWithHints,
	type FretHint,
} from "@/lib/fingerpickChords";
import type { CommitPattern } from "./useEditHistory";

export interface FingerpickEditorMeasureHeaderProps {
	measure: Measure;
	measureIndex: number;
	measureCount: number;
	commit: CommitPattern;
	/** Whether the pattern carries any chord marks (shows the replace-with-shapes control). */
	hasChords: boolean;
	/** What each string plays in the shape under every slot of this measure. */
	hints: readonly (FretHint[] | null)[] | undefined;
	/** Focus a measure box (the denim glow) — the one just copied or moved. */
	onHighlight: (measureId: string) => void;
	/** A move: the box plays a short slide-in from the side it came from. */
	onNudge: (dir: "left" | "right") => void;
}

// The row above a measure's grid: its number, the copy / move controls, and
// on the right the string shifts, the replace-with-shapes and delete controls.
export default function FingerpickEditorMeasureHeader({
	measure,
	measureIndex,
	measureCount,
	commit,
	hasChords,
	hints,
	onHighlight,
	onNudge,
}: FingerpickEditorMeasureHeaderProps) {
	const hintFor = (si: number) => hints?.[si] ?? null;

	// Rewrite every fretted cell in the measure to the chord shape's frets.
	function applyReplaceMeasure() {
		commit((prev) => replaceMeasureWithHints(prev, measureIndex, hintFor));
	}

	const ICON =
		"flex items-center justify-center p-1 rounded text-ink-dim hover:text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim disabled:hover:bg-transparent transition-colors";

	// One line, always: the label never wraps, and every control sits in one
	// right-hand group — the measure-level three (copy, move) tight together,
	// then a divider, then what acts inside the measure.
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="shrink-0 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
				Measure {measureIndex + 1}
			</span>
			<div className="flex shrink-0 items-center gap-1">
				<div className="flex items-center gap-0.5">
					<button
						onClick={() => {
							// Pre-generate the clone's id so the newly appended box can be
							// highlighted (the copy lands at the last position).
							const cloneId = crypto.randomUUID();
							commit((p) => ({ ...p, measures: cloneMeasure(p.measures, measureIndex, cloneId) }));
							onHighlight(cloneId);
						}}
						aria-label="Copy measure"
						title="Copy measure"
						className={ICON}
					>
						<Copy size={14} />
					</button>
					<button
						onClick={() => {
							commit((p) => ({
								...p,
								measures: swapMeasures(p.measures, measureIndex, measureIndex - 1),
							}));
							onHighlight(measure.id);
							onNudge("left");
						}}
						disabled={measureIndex === 0}
						aria-label="Move measure left"
						title="Move measure left"
						className={ICON}
					>
						<ArrowLeft size={14} />
					</button>
					<button
						onClick={() => {
							commit((p) => ({
								...p,
								measures: swapMeasures(p.measures, measureIndex, measureIndex + 1),
							}));
							onHighlight(measure.id);
							onNudge("right");
						}}
						disabled={measureIndex === measureCount - 1}
						aria-label="Move measure right"
						title="Move measure right"
						className={ICON}
					>
						<ArrowRight size={14} />
					</button>
				</div>
				<span aria-hidden="true" className="mx-1 h-4 w-px bg-line-strong" />
				{/* Every note a string up or down, frets kept: for a bar read onto
				    the wrong line. Off when a note already sits on the edge string. */}
				{([-1, 1] as const).map((direction) => {
					const can = canShiftMeasureStrings(measure, direction);
					const label = direction === -1 ? "Move all notes up a string" : "Move all notes down a string";
					return (
						<button
							key={direction}
							onClick={() => commit((p) => shiftMeasureStrings(p, measureIndex, direction))}
							disabled={!can}
							aria-label={label}
							title={
								can
									? `${label} (frets stay as they are)`
									: measure.slots.some((s) => s.strings.some((x) => x.fret !== null))
										? "A note is already on the edge string"
										: "Nothing to move"
							}
							className={ICON}
						>
							{direction === -1 ? <ArrowUpToLine size={14} /> : <ArrowDownToLine size={14} />}
						</button>
					);
				})}
				{/* Snap the whole measure back to its chord shapes — live only
				    while some fret differs from what the shape would write. */}
				{hasChords &&
					(() => {
						const differs = measureDiffersFromHints(measure, hintFor);
						return (
							<button
								onClick={applyReplaceMeasure}
								disabled={!differs}
								aria-label="Replace this measure's frets with the chord shapes'"
								title={
									differs
										? "Replace every fret in this measure with the chord shape's"
										: "Every fret in this measure already matches the chord shape"
								}
								className={ICON}
							>
								<RotateCcw size={14} />
							</button>
						);
					})()}
				<button
					onClick={() => commit((p) => deleteMeasure(p, measureIndex))}
					disabled={measureCount <= 1}
					aria-label="Delete measure"
					title="Delete measure"
					className="ml-1 flex items-center gap-1 whitespace-nowrap text-[10px] text-ink-dim hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				>
					<XIcon size={12} /> Delete
				</button>
			</div>
		</div>
	);
}
