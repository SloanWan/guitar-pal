"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { clampToRange, pushTap, stepValue, tapTempo, type StepRange } from "@/lib/stepper";
import { usePress } from "@/components/ui/press";
import { Chip } from "@/components/ui/chip";

/** Holding a step button this long starts the repeat… */
export const REPEAT_DELAY_MS = 400;
/** …which then steps this often until release or a bound. */
export const REPEAT_EVERY_MS = 80;

export interface StepperProps {
	/** The value's name: the group's label, and the buttons' ("Increase tempo"). */
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	/** Written small after the number ("BPM"). */
	unit?: string;
	/** Adds a TAP chip: tapping a beat sets the value to its tempo. */
	tap?: boolean;
	disabled?: boolean;
	/** `sm` for a toolbar of several values side by side. */
	size?: "md" | "sm";
	className?: string;
}

/**
 * Two step buttons around a tabular readout (spec §8). A click steps once; holding a
 * button repeats until release or a bound.
 */
export function Stepper({ label, value, onChange, min = 0, max = 999, step = 1, unit, tap, disabled, size = "md", className }: StepperProps) {
	const range: StepRange = { min, max, step };
	const valueRef = useRef(value);
	useEffect(() => {
		valueRef.current = value;
	}, [value]);
	const taps = useRef<number[]>([]);

	/** One step from the latest value; false at a bound, so a repeat stops there. */
	const stepBy = (direction: 1 | -1): boolean => {
		const next = stepValue(valueRef.current, direction, range);
		if (next === valueRef.current) return false;
		valueRef.current = next;
		onChange(next);
		return true;
	};
	const onTap = () => {
		taps.current = pushTap(taps.current, Date.now());
		const bpm = tapTempo(taps.current);
		if (bpm !== null) {
			valueRef.current = clampToRange(bpm, range);
			onChange(valueRef.current);
		}
	};

	return (
		<div role="group" aria-label={label} className={cn("gp-stepper", size === "sm" && "gp-stepper-sm", className)}>
			<StepButton direction={-1} label={label} disabled={disabled || value <= min} onStep={stepBy} />
			<output className="gp-stepper-val" aria-live="polite">
				{value}
				{unit && <span className="gp-stepper-unit">{unit}</span>}
			</output>
			<StepButton direction={1} label={label} disabled={disabled || value >= max} onStep={stepBy} />
			{tap && (
				<Chip disabled={disabled} onClick={onTap} aria-label={`Tap ${label}`}>
					TAP
				</Chip>
			)}
		</div>
	);
}

function StepButton({
	direction,
	label,
	disabled,
	onStep,
}: {
	direction: 1 | -1;
	label: string;
	disabled: boolean;
	onStep: (direction: 1 | -1) => boolean;
}) {
	const pressRef = usePress<HTMLButtonElement>();
	const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
	const every = useRef<ReturnType<typeof setInterval> | null>(null);
	/** The hold already stepped, so the click that ends it must not step again. */
	const repeated = useRef(false);
	// the latest onStep, for a repeat that outlives the render it started in
	const stepRef = useRef(onStep);
	useEffect(() => {
		stepRef.current = onStep;
	}, [onStep]);

	/** Ends a hold released anywhere — the button may have turned disabled under the finger. */
	const release = useRef<(() => void) | null>(null);

	const stop = () => {
		if (delay.current !== null) clearTimeout(delay.current);
		if (every.current !== null) clearInterval(every.current);
		delay.current = null;
		every.current = null;
		if (release.current) {
			window.removeEventListener("pointerup", release.current);
			window.removeEventListener("pointercancel", release.current);
			release.current = null;
		}
	};
	useEffect(() => stop, []);

	const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
		if (e.button !== 0) return;
		stop();
		repeated.current = false;
		release.current = stop;
		window.addEventListener("pointerup", stop);
		window.addEventListener("pointercancel", stop);
		delay.current = setTimeout(() => {
			delay.current = null;
			repeated.current = true;
			if (!stepRef.current(direction)) return;
			every.current = setInterval(() => {
				if (!stepRef.current(direction)) stop();
			}, REPEAT_EVERY_MS);
		}, REPEAT_DELAY_MS);
	};

	return (
		<button
			ref={pressRef}
			type="button"
			aria-label={`${direction > 0 ? "Increase" : "Decrease"} ${label}`}
			disabled={disabled}
			className="gp-stepper-btn gp-press gp-tone-neutral"
			onPointerDown={onPointerDown}
			onPointerLeave={stop}
			onClick={() => {
				if (repeated.current) repeated.current = false;
				else onStep(direction);
			}}
		>
			{direction > 0 ? <Plus aria-hidden /> : <Minus aria-hidden />}
		</button>
	);
}
