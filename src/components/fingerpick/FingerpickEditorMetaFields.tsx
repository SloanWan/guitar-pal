import { CircleHelp } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo, setPatternCapo } from "@/lib/fingerpickChords";
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
	return (
		<div className="shrink-0 flex flex-wrap items-end gap-3 px-4">
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
				<label className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
					Time Sig.
					{/* Time signature is fixed at 4/4 until other meters ship. CSS
					    group-hover tooltip (75ms fade) instead of the native `title`,
					    which has a slow browser-controlled delay. */}
					<span className="group/ts relative inline-flex cursor-help text-ink-faint/70">
						<CircleHelp size={11} aria-label="More time signatures coming soon" />
						<span
							role="tooltip"
							className="pointer-events-none absolute left-0 top-full z-70 mt-1 w-max max-w-52 whitespace-normal border border-line-strong bg-popover px-2 py-1 font-sans text-[10px] normal-case leading-snug tracking-normal text-ink-dim opacity-0 shadow-md transition-opacity duration-75 group-hover/ts:opacity-100"
						>
							Only 4/4 is supported right now — more time signatures coming soon.
						</span>
					</span>
				</label>
				<div className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink">
					4/4
				</div>
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
	);
}
