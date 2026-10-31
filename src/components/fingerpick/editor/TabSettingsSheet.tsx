"use client";

import { useState } from "react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo, setPatternCapo } from "@/lib/fingerpickChords";
import { FINGERPICK_TIME_SIGNATURES, changeTimeSignature, type TimeSignatureChange } from "@/lib/fingerpickEdit";
import { bpmRangeForMeter, clampBpmToMeter } from "@/lib/strumBars";
import { beatUnitGlyph, isCompound, meterLabel, metersEqual } from "@/lib/strumMeter";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import { uniquePatternName } from "@/lib/uniquePatternName";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	working: FingerpickPattern;
	commit: CommitPattern;
	/** Every other tab's name, to say what a clashing name will be saved as. */
	takenNames: readonly string[];
	/** Compound meters only: count the eighths 1–6 instead of "1 + a 2 + a" (a device preference). */
	countEighths: boolean;
	onCountEighths: (on: boolean) => void;
}

const METER_OPTIONS = FINGERPICK_TIME_SIGNATURES.map((ts) => ({ value: meterLabel(ts), label: meterLabel(ts) }));
const COUNT_OPTIONS = [
	{ value: "beats", label: "1 + a" },
	{ value: "eighths", label: "1–6" },
] as const;

/** What the name will be saved as, when the library already has it ("Waltz (1)"); null otherwise. */
export function savedAsNotice(name: string, takenNames: readonly string[]): string | null {
	const trimmed = name.trim();
	if (!trimmed) return null;
	const savedAs = uniquePatternName(trimmed, takenNames);
	return savedAs === trimmed ? null : `A tab named “${trimmed}” already exists — this one will be saved as “${savedAs}”.`;
}

/**
 * The tab's own fields — name, tempo, capo, meter, description — in a sheet opened
 * from the title. Each change is a commit, so it undoes like any other edit. A meter
 * change that would lose notes asks first how (keep what fits, split the bars, clear).
 */
export default function TabSettingsSheet({
	open,
	onOpenChange,
	working,
	commit,
	takenNames,
	countEighths,
	onCountEighths,
}: Props) {
	const [meterAsk, setMeterAsk] = useState<TimeSignatureChange | null>(null);
	const range = bpmRangeForMeter(working.timeSignature);
	const capo = patternCapo(working);
	const clash = savedAsNotice(working.name, takenNames);

	function requestMeter(label: string) {
		const next = FINGERPICK_TIME_SIGNATURES.find((ts) => meterLabel(ts) === label);
		if (!next || metersEqual(next, working.timeSignature)) return;
		const change = changeTimeSignature(working, next);
		if (change.affectedMeasures.length === 0) applyMeter(change.fitted);
		else setMeterAsk(change);
	}

	// The lib rescales the tempo across simple ↔ compound (BPM counts the beat); the
	// meter's own range is applied here.
	function applyMeter(next: FingerpickPattern) {
		commit(() => ({ ...next, bpm: clampBpmToMeter(next.bpm, next.timeSignature) }));
		setMeterAsk(null);
	}

	const affected = meterAsk?.affectedMeasures.length ?? 0;
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) setMeterAsk(null);
				onOpenChange(next);
			}}
			title="Tab settings"
		>
			<div className="te-fields" data-m="tab">
				<Field label="Name" help={clash ?? undefined} error={working.name.trim() ? undefined : "A tab needs a name to be saved."}>
					{(control) => (
						<Input
							{...control}
							value={working.name}
							placeholder="Name this tab"
							autoComplete="off"
							onChange={(e) => commit((p) => ({ ...p, name: e.target.value }))}
						/>
					)}
				</Field>
				<div className="te-fld">
					<span className="te-fld-head">
						Tempo
						<span className="pb-lab">
							{beatUnitGlyph(working.timeSignature)} = {range.min}–{range.max}
						</span>
					</span>
					<Stepper
						label="Tempo"
						value={working.bpm}
						min={range.min}
						max={range.max}
						unit="BPM"
						tap
						onChange={(bpm) => commit((p) => ({ ...p, bpm }))}
					/>
				</div>
				<div className="te-fld">
					<span className="te-fld-head">
						Capo <span className="pb-lab">the tab is written behind it</span>
					</span>
					<Stepper
						label="Capo"
						value={capo}
						min={0}
						max={STRUM_CAPO_MAX}
						onChange={(fret) => commit((p) => setPatternCapo(p, fret))}
					/>
				</div>
				<div className="te-fld">
					<span className="te-fld-head">Time signature</span>
					<Segmented
						label="Time signature"
						options={METER_OPTIONS}
						value={meterLabel(working.timeSignature)}
						onChange={requestMeter}
						full
					/>
					{meterAsk && (
						<div className="te-ask" role="alertdialog" aria-label="Change the time signature">
							<span>
								{`Changing to ${meterLabel(meterAsk.fitted.timeSignature)} drops notes in ${
									affected === 1 ? `bar ${meterAsk.affectedMeasures[0] + 1}` : `${affected} bars`
								}. What should happen to ${affected === 1 ? "it" : "them"}?`}
							</span>
							<div className="te-ask-row">
								<Button size="xs" onClick={() => applyMeter(meterAsk.fitted)}>
									Keep what fits
								</Button>
								{meterAsk.split && (
									<Button size="xs" variant="secondary" onClick={() => applyMeter(meterAsk.split!)}>
										{`Split into ${meterAsk.split.measures.length} bars`}
									</Button>
								)}
								<Button size="xs" variant="secondary" onClick={() => applyMeter(meterAsk.cleared)}>
									Clear
								</Button>
								<Button size="xs" variant="ghost" onClick={() => setMeterAsk(null)}>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
				{isCompound(working.timeSignature) && (
					<div className="te-fld">
						<span className="te-fld-head">
							Count <span className="pb-lab">on this device</span>
						</span>
						<Segmented
							label="How to count the beats"
							options={COUNT_OPTIONS}
							value={countEighths ? "eighths" : "beats"}
							onChange={(v) => onCountEighths(v === "eighths")}
							full
						/>
					</div>
				)}
				<Field label="Description">
					{(control) => (
						<textarea
							{...control}
							className="gp-input te-desc"
							value={working.description ?? ""}
							placeholder="Where it's from, how to play it"
							onChange={(e) => commit((p) => ({ ...p, description: e.target.value }))}
						/>
					)}
				</Field>
			</div>
		</Sheet>
	);
}
