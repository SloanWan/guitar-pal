"use client";

import type { CSSProperties } from "react";
import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { percentOf, snapToPoints } from "@/lib/snap";

export interface SliderProps {
	value: number;
	onChange: (value: number) => void;
	/** The thumb's accessible name. */
	label: string;
	min?: number;
	max?: number;
	step?: number;
	/** Marks drawn under the track. */
	ticks?: readonly number[];
	/** Soft detents: a value within `within` of one of `points` lands on it. */
	snap?: { points: readonly number[]; within: number };
	/** Spoken instead of the bare number ("90 BPM"). */
	valueText?: (value: number) => string;
	disabled?: boolean;
	className?: string;
}

/**
 * A slider (spec §8): a 4px track filled in the module colour, a 20px thumb on a 2px
 * shadow that sinks while it is held. Replaces Fader as pages migrate.
 */
export function Slider({ value, onChange, label, min = 0, max = 100, step = 1, ticks, snap, valueText, disabled, className }: SliderProps) {
	return (
		<SliderPrimitive.Root
			className={cn("gp-slider", className)}
			value={[value]}
			min={min}
			max={max}
			step={step}
			disabled={disabled}
			onValueChange={([v]) => onChange(snap ? snapToPoints(v, snap.points, snap.within) : v)}
		>
			<SliderPrimitive.Track className="gp-slider-track">
				<SliderPrimitive.Range className="gp-slider-range" />
			</SliderPrimitive.Track>
			{ticks && (
				<span className="gp-slider-ticks" aria-hidden>
					{ticks.map((t) => (
						<span key={t} style={{ left: `${percentOf(t, min, max)}%` } as CSSProperties} />
					))}
				</span>
			)}
			<SliderPrimitive.Thumb className="gp-slider-thumb" aria-label={label} aria-valuetext={valueText?.(value)} />
		</SliderPrimitive.Root>
	);
}
