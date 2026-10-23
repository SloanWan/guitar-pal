"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Slider } from "@/components/ui/slider";
import { bpmFaderMarks } from "@/components/fingerpick/playbackConstants";
import { pushTap, tapTempo } from "@/lib/stepper";
import { isCompound, type Meter } from "@/lib/strumMeter";

export interface TempoProps {
	bpm: number;
	onBpm: (bpm: number) => void;
	meter: Meter;
	/** What reset returns to: the tempo whatever is open was saved with. */
	defaultBpm: number;
	/** Make the tempo on screen the one it opens at. Absent where nothing can be saved. */
	onSaveDefault?: () => void;
}

/** A tempo clamped to the meter's range and rounded to a whole beat. */
export function clampTempo(bpm: number, meter: Meter): number {
	const { min, max } = bpmFaderMarks(meter);
	return Math.min(max, Math.max(min, Math.round(bpm)));
}

/** Tap a beat on the chip to set the tempo from it. Kept between taps, not between renders. */
export function useTapTempo(onTempo: (bpm: number) => void): () => void {
	const taps = useRef<number[]>([]);
	return () => {
		taps.current = pushTap(taps.current, Date.now());
		const bpm = tapTempo(taps.current);
		if (bpm !== null) onTempo(bpm);
		navigator.vibrate?.(10);
	};
}

/**
 * The body of every tempo control: the tempo with its quick steps on its own row,
 * the slider with the genre marks, and what to do with a changed tempo. Nothing
 * here appears or disappears as the tempo moves — Reset and "Open at …" are
 * always there and only enable — so the panel holding it never changes size.
 */
export function TempoFields({ bpm, onBpm, meter, defaultBpm, onSaveDefault }: TempoProps) {
	const marks = bpmFaderMarks(meter);
	const set = (value: number) => onBpm(clampTempo(value, meter));
	const tap = useTapTempo(set);
	const nearest = marks.values.reduce(
		(best, v, i) => (Math.abs(v - bpm) < Math.abs(marks.values[best] - bpm) ? i : best),
		0,
	);
	const changed = bpm !== defaultBpm;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center gap-1.5">
				<span className="st-tempo-val st-num">
					{bpm} <span className="st-lab">{isCompound(meter) ? "BPM ♩." : "BPM"}</span>
				</span>
				<span className="st-lab min-w-0 flex-1 truncate">{marks.labels[nearest]}</span>
				<Chip onClick={() => set(bpm - 10)} aria-label="Ten slower">
					−10
				</Chip>
				<Chip onClick={() => set(bpm + 10)} aria-label="Ten faster">
					+10
				</Chip>
				<Chip onClick={tap} aria-label="Tap the tempo">
					Tap
				</Chip>
			</div>
			<Slider
				value={bpm}
				onChange={set}
				label="Tempo in BPM"
				min={marks.min}
				max={marks.max}
				ticks={marks.values}
				snap={{ points: marks.values, within: 2 }}
				valueText={(v) => `${v} BPM`}
			/>
			<div className="flex items-center gap-1.5">
				<Button variant="ghost" size="xs" disabled={!changed} onClick={() => onBpm(defaultBpm)} title={`Back to ${defaultBpm}`}>
					Reset to {defaultBpm}
				</Button>
				<span className="flex-1" />
				{onSaveDefault && (
					<Button variant="secondary" size="xs" disabled={!changed} onClick={onSaveDefault} className="st-num">
						Open at {bpm} from now on
					</Button>
				)}
			</div>
		</div>
	);
}
