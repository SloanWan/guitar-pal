"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** The slider with the genre marks under it, the coarse steps and a reset: the body of every tempo control. */
export function TempoFields({ bpm, onBpm, meter, defaultBpm, onSaveDefault }: TempoProps) {
	const marks = bpmFaderMarks(meter);
	const set = (value: number) => onBpm(clampTempo(value, meter));
	const tap = useTapTempo(set);
	const nearest = marks.values.reduce(
		(best, v, i) => (Math.abs(v - bpm) < Math.abs(marks.values[best] - bpm) ? i : best),
		0,
	);
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-baseline justify-between">
				<span className="text-2xl font-extrabold st-num">
					{bpm} <span className="st-lab">{isCompound(meter) ? "BPM ♩." : "BPM"}</span>
				</span>
				<span className="st-lab">{marks.labels[nearest]}</span>
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
				<Chip onClick={() => set(bpm - 10)} aria-label="Ten slower">
					−10
				</Chip>
				<Chip onClick={() => set(bpm + 10)} aria-label="Ten faster">
					+10
				</Chip>
				<Chip onClick={tap} aria-label="Tap the tempo">
					Tap
				</Chip>
				<span className="flex-1" />
				<Button variant="ghost" size="xs" disabled={bpm === defaultBpm} onClick={() => onBpm(defaultBpm)} title={`Back to ${defaultBpm}`}>
					Reset
				</Button>
			</div>
			{onSaveDefault && bpm !== defaultBpm && (
				<Button variant="secondary" size="xs" onClick={onSaveDefault}>
					Open at {bpm} from now on
				</Button>
			)}
		</div>
	);
}

/** The bar's tempo readout; clicking it opens the full tempo control beside it. */
export default function TempoControl(props: TempoProps) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" className="st-bpm st-num" aria-label={`Tempo ${props.bpm} BPM — change`}>
					{props.bpm} <span className="st-lab">BPM</span>
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="center" className="w-80" aria-label="Tempo">
				<TempoFields {...props} />
			</PopoverContent>
		</Popover>
	);
}
