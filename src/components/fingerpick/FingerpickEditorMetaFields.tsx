import { useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo, setPatternCapo } from "@/lib/fingerpickChords";
import {
	FINGERPICK_TIME_SIGNATURES,
	changeTimeSignature,
	type TimeSignatureChange,
} from "@/lib/fingerpickEdit";
import { meterLabel, metersEqual } from "@/lib/strumMeter";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import type { CommitPattern } from "./useEditHistory";

export const MIN_BPM = 40;
export const MAX_BPM = 220;

export interface FingerpickEditorMetaFieldsProps {
	working: FingerpickPattern;
	commit: CommitPattern;
}

// The metadata bar pinned above the measure grid: name, BPM, capo, time
// signature and description. Every field writes straight to the working pattern
// through `commit`, so each keystroke is its own undo step, as before.
export default function FingerpickEditorMetaFields({
	working,
	commit,
}: FingerpickEditorMetaFieldsProps) {
	const nameValid = working.name.trim().length > 0;
	// A meter change that would drop notes waits here for the player to choose
	// how: keep what fits, cut the bars into equal shorter ones, or clear them.
	const [meterConfirm, setMeterConfirm] = useState<TimeSignatureChange | null>(null);

	function requestTimeSignature(value: string) {
		const next = FINGERPICK_TIME_SIGNATURES.find((ts) => meterLabel(ts) === value);
		if (!next || metersEqual(next, working.timeSignature)) return;
		const change = changeTimeSignature(working, next);
		if (change.affectedMeasures.length === 0) commit(() => change.fitted);
		else setMeterConfirm(change);
	}

	function applyMeter(pattern: FingerpickPattern) {
		commit(() => pattern);
		setMeterConfirm(null);
	}

	return (
		<div className="shrink-0 flex flex-col gap-2 px-4">
		<div className="flex flex-wrap items-end gap-3">
			<div className="flex flex-col gap-1 min-w-40 flex-[2]">
				<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					Name
				</label>
				<input
					type="text"
					value={working.name}
					onChange={(e) => commit((p) => ({ ...p, name: e.target.value }))}
					placeholder="Pattern name"
					className={`w-full border bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent ${
						nameValid ? "border-line-strong" : "border-destructive"
					}`}
				/>
			</div>
			<div className="flex flex-col gap-1 w-20 shrink-0">
				<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					BPM
				</label>
				<input
					type="number"
					min={MIN_BPM}
					max={MAX_BPM}
					value={working.bpm}
					onChange={(e) => commit((p) => ({ ...p, bpm: Number(e.target.value) || 0 }))}
					className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
				/>
			</div>
			<div className="flex flex-col gap-1 w-20 shrink-0">
				<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					Capo
				</label>
				{/* The TAB is written relative to the capo, so playback sounds this
				    many semitones higher. Empty = no capo. */}
				<input
					type="number"
					min={0}
					max={STRUM_CAPO_MAX}
					value={patternCapo(working) === 0 ? "" : patternCapo(working)}
					onChange={(e) => commit((p) => setPatternCapo(p, Number(e.target.value) || 0))}
					placeholder="0"
					aria-label="Capo fret — empty means no capo"
					className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
				/>
			</div>
			<div className="flex flex-col gap-1 w-20 shrink-0">
				<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					Time Sig.
				</label>
				{/* A compound meter (6/8, 12/8) is counted in dotted-quarter beats;
				    the grid, the stave and the metronome all follow the choice. */}
				<select
					value={meterLabel(working.timeSignature)}
					onChange={(e) => requestTimeSignature(e.target.value)}
					aria-label="Time signature"
					className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
				>
					{FINGERPICK_TIME_SIGNATURES.map((ts) => (
						<option key={meterLabel(ts)} value={meterLabel(ts)}>
							{meterLabel(ts)}
						</option>
					))}
				</select>
			</div>
			<div className="flex flex-col gap-1 min-w-40 flex-[2]">
				<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					Description
				</label>
				<input
					type="text"
					value={working.description ?? ""}
					onChange={(e) => commit((p) => ({ ...p, description: e.target.value }))}
					placeholder="Optional"
					className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
				/>
			</div>
		</div>
		{meterConfirm && (
			<div className="flex flex-col gap-1.5 border border-line bg-raise p-2">
				<span className="text-[11px] text-ink-dim">
					{`Changing to ${meterLabel(meterConfirm.fitted.timeSignature)} drops notes in ${
						meterConfirm.affectedMeasures.length === 1
							? `bar ${meterConfirm.affectedMeasures[0] + 1}`
							: `${meterConfirm.affectedMeasures.length} bars`
					}. Keep what fits${meterConfirm.split ? ", cut each bar into shorter ones," : ""} or clear ${
						meterConfirm.affectedMeasures.length === 1 ? "it" : "them"
					}?`}
				</span>
				<div className="flex flex-wrap gap-1">
					<button
						onClick={() => applyMeter(meterConfirm.fitted)}
						className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
					>
						Keep what fits
					</button>
					{meterConfirm.split && (
						<button
							onClick={() => applyMeter(meterConfirm.split!)}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
						>
							{`Split into ${meterConfirm.split.measures.length} bars`}
						</button>
					)}
					<button
						onClick={() => applyMeter(meterConfirm.cleared)}
						className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
					>
						Clear
					</button>
					<button
						onClick={() => setMeterConfirm(null)}
						className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		)}
		</div>
	);
}
