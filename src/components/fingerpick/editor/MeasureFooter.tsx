import { useState } from "react";
import type { Duration, FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import { remapMeasure, resetMeasure, withMeasures } from "@/lib/fingerpickEdit";
import { DEFAULT_REPEAT_TIMES } from "@/lib/fingerpickRepeats";
import { isCompound } from "@/lib/strumMeter";
import { Button } from "@/components/ui/button";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import InspectorPick from "./InspectorPick";
import NoteGlyph from "./NoteGlyph";
import type { ChordTools } from "./useChordTools";

// Upper bound for the repeat play-count stepper (kept well under the lib's hard cap).
const REPEAT_TIMES_MAX = 16;
// The "All" row's fills, by meter. A compound bar's natural fills are its
// dotted beats, eighths and sixteenths (2 / 6 / 12 in 6/8): a quarter is not a
// beat there, and its beat already divides in three, so the eighth-triplet
// fill (12 in 4/4, 9 in 3/4) is a simple-meter thing.
const COMPOUND_FILLS: readonly Duration[] = ["dotted-quarter", "eighth", "sixteenth"];
const SIMPLE_FILLS: readonly Duration[] = ["quarter", "eighth", "eighth-triplet", "sixteenth", "32nd"];

const FILL_NAME: Partial<Record<Duration, string>> = {
	quarter: "quarter notes",
	"dotted-quarter": "dotted quarters",
	eighth: "eighth notes",
	"eighth-triplet": "eighth-note triplets",
	sixteenth: "sixteenth notes",
	"32nd": "32nd notes",
};

export interface MeasureFooterProps {
	measure: Measure;
	measureIndex: number;
	working: FingerpickPattern;
	commit: CommitPattern;
	tools: Pick<ChordTools, "chordsInEffect" | "voicingsFor">;
}

// The rows under a bar's grid: fill it with one note value, the repeat barlines
// and their play count, and the pick sequence — plus the ask a fill raises over
// notes. Each block owns its asks; the block is keyed by measure id, so a moved
// bar keeps them.
export default function MeasureFooter({ measure, measureIndex, working, commit, tools }: MeasureFooterProps) {
	// The note value waiting on "keep (remap) or clear?" because the bar holds notes.
	const [fillAsk, setFillAsk] = useState<Duration | null>(null);
	const ts = working.timeSignature;

	function setRepeat(patch: Partial<Pick<Measure, "repeatStart" | "repeatEnd" | "repeatTimes">>) {
		commit((prev) => ({
			...prev,
			measures: prev.measures.map((m, i) => {
				if (i !== measureIndex) return m;
				const next: Measure = { ...m, ...patch };
				if (!next.repeatStart) delete next.repeatStart;
				if (!next.repeatEnd) {
					delete next.repeatEnd;
					delete next.repeatTimes;
				}
				return next;
			}),
		}));
	}

	function requestFill(duration: Duration) {
		const res = resetMeasure(working.measures, measureIndex, duration, ts);
		if (res.type === "confirm") setFillAsk(duration);
		else commit((prev) => withMeasures(prev, res.measures));
	}

	function fill(kind: "remap" | "clear") {
		if (!fillAsk) return;
		const duration = fillAsk;
		commit((prev) =>
			withMeasures(
				prev,
				kind === "remap"
					? remapMeasure(prev.measures, measureIndex, duration, prev.timeSignature)
					: resetMeasure(prev.measures, measureIndex, duration, prev.timeSignature).measures,
			),
		);
		setFillAsk(null);
	}

	const times = measure.repeatTimes ?? DEFAULT_REPEAT_TIMES;
	return (
		<div className="te-mb-foot">
			<div className="te-mb-row">
				<span className="te-mb-lab">All</span>
				{(isCompound(ts) ? COMPOUND_FILLS : SIMPLE_FILLS).map((d) => (
					<button
						key={d}
						type="button"
						className="te-mb-fill"
						onClick={() => requestFill(d)}
						aria-label={`Fill bar ${measureIndex + 1} with ${FILL_NAME[d]}`}
						title={`Fill the bar with ${FILL_NAME[d]}`}
					>
						<NoteGlyph duration={d === "eighth-triplet" ? "eighth" : d} />
						{d === "eighth-triplet" && <sup>3</sup>}
					</button>
				))}
				<span className="tb-grow" />
				<button
					type="button"
					className="te-mb-fill te-mono"
					onClick={() => setRepeat({ repeatStart: !measure.repeatStart })}
					aria-pressed={!!measure.repeatStart}
					aria-label={`Repeat start at bar ${measureIndex + 1}`}
					title="Repeat start (|:) — the section repeats from here"
				>
					|:
				</button>
				<button
					type="button"
					className="te-mb-fill te-mono"
					onClick={() => setRepeat({ repeatEnd: !measure.repeatEnd })}
					aria-pressed={!!measure.repeatEnd}
					aria-label={`Repeat end at bar ${measureIndex + 1}`}
					title="Repeat end (:|) — loop back to the repeat start"
				>
					:|
				</button>
				{/* Always laid out, so setting a repeat end does not grow the block. */}
				<span className="te-mb-times" data-off={measure.repeatEnd ? undefined : ""}>
					<button
						type="button"
						className="te-mb-ic"
						disabled={!measure.repeatEnd || times <= DEFAULT_REPEAT_TIMES}
						onClick={() => setRepeat({ repeatTimes: Math.max(DEFAULT_REPEAT_TIMES, times - 1) })}
						aria-label="Play fewer times"
						title="Play fewer times"
					>
						−
					</button>
					<span className="pb-num" aria-label={`Played ${times} times`}>
						×{times}
					</span>
					<button
						type="button"
						className="te-mb-ic"
						disabled={!measure.repeatEnd || times >= REPEAT_TIMES_MAX}
						onClick={() => setRepeat({ repeatTimes: Math.min(REPEAT_TIMES_MAX, times + 1) })}
						aria-label="Play more times"
						title="Play more times"
					>
						+
					</button>
				</span>
			</div>
			{fillAsk && (
				<div className="te-ask" role="alertdialog" aria-label="Fill the bar">
					<span>Bar {measureIndex + 1} has notes. Keep them (remap onto the new values) or clear the bar?</span>
					<div className="te-ask-row">
						<Button size="xs" onClick={() => fill("remap")}>
							Remap
						</Button>
						<Button size="xs" variant="secondary" onClick={() => fill("clear")}>
							Clear
						</Button>
						<Button size="xs" variant="ghost" onClick={() => setFillAsk(null)}>
							Cancel
						</Button>
					</div>
				</div>
			)}
			<InspectorPick working={working} commit={commit} measureIndex={measureIndex} tools={tools} inline />
		</div>
	);
}
