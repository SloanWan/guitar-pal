import { useState } from "react";
import type { Duration, FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { remapMeasure, resetMeasure, slotHasStringData } from "@/lib/fingerpickEdit";
import { DEFAULT_REPEAT_TIMES } from "@/lib/fingerpickRepeats";
import {
	applyPickSequence,
	parsePickSequence,
	type PickSequenceParse,
} from "@/lib/fingerpickPickSequence";
import { selectRefVoicing } from "@/lib/strumBars";
import { isCompound } from "@/lib/strumMeter";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicingsState } from "./useChordVoicings";
import type { CommitPattern } from "./useEditHistory";
import { DurationIcon } from "./fingerpickEditorShared";

// Upper bound for the repeat play-count stepper (kept well under the lib's hard cap).
const REPEAT_TIMES_MAX = 16;

// The "All" row's fills, by meter. A compound bar's natural fills are its
// dotted beats, eighths and sixteenths (2 / 6 / 12 in 6/8): a quarter is not a
// beat there, and its beat already divides in three, so the eighth-triplet
// fill (12 in 4/4, 9 in 3/4) is a simple-meter thing.
const COMPOUND_METER_PRESET_DURATIONS: readonly Duration[] = ["dotted-quarter", "eighth", "sixteenth"];
// An example the Pick field's own meter would accept: four or eight tokens in
// 4/4, three in 3/4, six in 6/8 (see parsePickSequence).
function pickPlaceholder(timeSignature: [number, number]): string {
	if (isCompound(timeSignature)) return timeSignature[0] === 6 ? "e.g. 632123 or 6(32)" : "e.g. 632123632123";
	if (timeSignature[0] === 3) return "e.g. 321 or 6(32)1";
	if (timeSignature[0] === 2) return "e.g. 32 or 3212";
	return "e.g. 3212 or 6(32)1(32)";
}

const SIMPLE_METER_PRESET_DURATIONS: readonly Duration[] = [
	"quarter",
	"eighth",
	"eighth-triplet",
	"sixteenth",
	"32nd",
];

export interface FingerpickEditorMeasureFooterProps {
	measure: Measure;
	measureIndex: number;
	working: FingerpickPattern;
	commit: CommitPattern;
	/** The chord in effect at each slot of this measure (null where none). */
	chordsInEffect: readonly (ChordRef | null)[];
	voicingsFor: (ref: ChordRef) => ChordVoicingsState;
	/** Patch this measure's repeat flags (start / end barline, play-count). */
	onSetRepeat: (
		patch: Partial<Pick<Measure, "repeatStart" | "repeatEnd" | "repeatTimes">>,
	) => void;
}

// The rows under a measure's grid: the "All" quick-preset row with the repeat
// barline toggles, the play-count stepper, and the Pick field — plus the inline
// confirmations and notices those raise. Each measure block owns its own draft
// and confirms; the block is keyed by measure id, so a moved measure keeps them.
export default function FingerpickEditorMeasureFooter({
	measure,
	measureIndex,
	working,
	commit,
	chordsInEffect,
	voicingsFor,
	onSetRepeat,
}: FingerpickEditorMeasureFooterProps) {
	// Inline confirmation for the quick-preset row: the note value waiting on
	// "keep (remap) or clear?" because the measure already holds notes.
	const [presetConfirm, setPresetConfirm] = useState<Duration | null>(null);
	// The right-hand sequence typed into the Pick field.
	const [pickInput, setPickInput] = useState("");
	// What the last Pick apply had to say: a parse error, or the notes it could
	// not write as asked. Cleared by the next keystroke.
	const [pickNotice, setPickNotice] = useState<{
		kind: "error" | "warning";
		lines: string[];
	} | null>(null);
	// A sequence waiting on "overwrite this measure?" — the measure already has notes.
	const [pickConfirm, setPickConfirm] = useState<Extract<PickSequenceParse, { ok: true }> | null>(
		null,
	);

	// Replace the measure's slots via a Measure[] transform (reset/remap operate on
	// the measure array, not the whole pattern).
	function applyMeasures(measures: Measure[]) {
		commit((prev) => ({ ...prev, measures }));
	}

	// ── Quick preset row ─────────────────────────────────────────────────────

	function requestPreset(duration: Duration) {
		const res = resetMeasure(working.measures, measureIndex, duration, working.timeSignature);
		if (res.type === "confirm") {
			setPresetConfirm(duration);
		} else {
			applyMeasures(res.measures);
		}
	}

	function applyPresetRemap() {
		if (!presetConfirm) return;
		applyMeasures(
			remapMeasure(working.measures, measureIndex, presetConfirm, working.timeSignature),
		);
		setPresetConfirm(null);
	}

	function applyPresetClear() {
		if (!presetConfirm) return;
		const res = resetMeasure(working.measures, measureIndex, presetConfirm, working.timeSignature);
		applyMeasures(res.measures);
		setPresetConfirm(null);
	}

	// ── Pick sequence ────────────────────────────────────────────────────────

	// Parse the typed sequence and write it, asking first when the measure
	// already holds notes. Shapes still on their way block the apply rather than
	// silently writing open strings.
	function requestPickSequence() {
		const parsed = parsePickSequence(pickInput, working.timeSignature);
		if (!parsed.ok) {
			setPickNotice({ kind: "error", lines: [parsed.error] });
			return;
		}
		const pendingShapes = chordsInEffect.some(
			(ref) => ref !== null && voicingsFor(ref).status === "loading",
		);
		if (pendingShapes) {
			setPickNotice({
				kind: "error",
				lines: ["Chord shapes are still loading — try again in a moment."],
			});
			return;
		}
		if (measure.slots.some(slotHasStringData)) {
			setPickConfirm(parsed);
			return;
		}
		applyPickSequenceNow(parsed);
	}

	function applyPickSequenceNow(parsed: Extract<PickSequenceParse, { ok: true }>) {
		const result = applyPickSequence(working, measureIndex, parsed, (ref) => {
			const state = voicingsFor(ref);
			return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
		});
		commit(() => result.pattern);
		setPickConfirm(null);
		setPickNotice(result.warnings.length > 0 ? { kind: "warning", lines: result.warnings } : null);
	}

	return (
		<>
			{/* Quick preset row: fill the whole measure with one note value.
			    The repeat-barline toggles (|: start, :| end) sit at the row's
			    bottom-right; the play-count stepper drops to its own line below
			    when a repeat end is set. */}
			<div className="flex items-center gap-1 border-t border-line pt-2">
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint mr-0.5">
					All
				</span>
				{(isCompound(working.timeSignature)
					? COMPOUND_METER_PRESET_DURATIONS
					: SIMPLE_METER_PRESET_DURATIONS
				).map((d) => (
					<button
						key={d}
						onClick={() => requestPreset(d)}
						title={`Fill measure with ${d} notes`}
						className="flex items-center justify-center h-7 w-8 border border-line-strong text-ink-dim hover:border-denim hover:text-denim active:bg-denim-tint transition-colors"
					>
						<DurationIcon duration={d} />
					</button>
				))}
				<div className="flex items-center gap-1 ml-auto">
					<button
						onClick={() => onSetRepeat({ repeatStart: !measure.repeatStart })}
						title="Repeat start (|:) — the section repeats from here"
						aria-pressed={!!measure.repeatStart}
						className={`flex items-center justify-center h-7 w-8 border font-mono text-xs transition-colors ${
							measure.repeatStart
								? "border-denim bg-denim-tint text-denim"
								: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
						}`}
					>
						|:
					</button>
					<button
						onClick={() => onSetRepeat({ repeatEnd: !measure.repeatEnd })}
						title="Repeat end (:|) — loop back to the repeat start"
						aria-pressed={!!measure.repeatEnd}
						className={`flex items-center justify-center h-7 w-8 border font-mono text-xs transition-colors ${
							measure.repeatEnd
								? "border-denim bg-denim-tint text-denim"
								: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
						}`}
					>
						:|
					</button>
				</div>
			</div>

			{/* Play-count stepper — only when this measure ends a repeat. */}
			{measure.repeatEnd && (
				<div className="flex items-center gap-0.5 justify-end">
					<button
						onClick={() =>
							onSetRepeat({
								repeatTimes: Math.max(
									DEFAULT_REPEAT_TIMES,
									(measure.repeatTimes ?? DEFAULT_REPEAT_TIMES) - 1,
								),
							})
						}
						title="Play fewer times"
						className="flex items-center justify-center h-7 w-6 border border-line-strong text-ink-dim hover:border-denim hover:text-denim transition-colors"
					>
						−
					</button>
					<span className="font-mono text-xs w-7 text-center text-ink">
						×{measure.repeatTimes ?? DEFAULT_REPEAT_TIMES}
					</span>
					<button
						onClick={() =>
							onSetRepeat({
								repeatTimes: Math.min(
									REPEAT_TIMES_MAX,
									(measure.repeatTimes ?? DEFAULT_REPEAT_TIMES) + 1,
								),
							})
						}
						title="Play more times"
						className="flex items-center justify-center h-7 w-6 border border-line-strong text-ink-dim hover:border-denim hover:text-denim transition-colors"
					>
						+
					</button>
				</div>
			)}

			{/* Pick row: type a right-hand sequence (3212, 6(32)1(32), 0 or -
			    for a rest, _ or ^ to hold the note before) and Enter rewrites
			    the measure, fretting each string from the chord in effect at
			    that beat. */}
			<div className="flex items-center gap-1.5">
				<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint mr-0.5">
					Pick
				</span>
				<input
					type="text"
					value={pickInput}
					onChange={(e) => {
						setPickInput(e.target.value);
						setPickNotice(null);
						setPickConfirm(null);
					}}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						e.preventDefault();
						e.stopPropagation();
						requestPickSequence();
					}}
					placeholder={pickPlaceholder(working.timeSignature)}
					aria-label={`Right-hand sequence for measure ${measureIndex + 1}`}
					title="String numbers, 1 = high e … 6 = low E. Parentheses pluck strings together; 0 or - is a rest; _ or ^ holds the note before it one cell longer. Enter writes the measure, fretted from its chord."
					className="h-7 min-w-0 flex-1 border border-line-strong bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:outline-none focus-visible:border-denim"
				/>
				<button
					type="button"
					onClick={requestPickSequence}
					disabled={!pickInput.trim()}
					title="Write the sequence into this measure"
					className="h-7 px-2 border border-line-strong font-mono text-xs font-semibold text-ink-dim hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				>
					Write
				</button>
			</div>
			{pickNotice && (
				<ul
					className={`flex flex-col gap-0.5 text-[10px] leading-snug ${
						pickNotice.kind === "error" ? "text-destructive" : "text-ink-dim"
					}`}
				>
					{pickNotice.lines.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
			)}
			{pickConfirm && (
				<div className="flex flex-col gap-1.5 border border-line bg-raise p-2">
					<span className="text-[11px] text-ink-dim">
						This will replace the measure&apos;s notes. Continue?
					</span>
					<div className="flex gap-1">
						<button
							onClick={() => applyPickSequenceNow(pickConfirm)}
							className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
						>
							Replace
						</button>
						<button
							onClick={() => setPickConfirm(null)}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
			{presetConfirm && (
				<div className="flex flex-col gap-1.5 border border-line bg-raise p-2">
					<span className="text-[11px] text-ink-dim">Keep existing data (remap) or clear?</span>
					<div className="flex gap-1">
						<button
							onClick={applyPresetRemap}
							className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
						>
							Remap
						</button>
						<button
							onClick={applyPresetClear}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
						>
							Clear
						</button>
						<button
							onClick={() => setPresetConfirm(null)}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			)}
		</>
	);
}
