"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<V extends string = string> {
	value: V;
	label: ReactNode;
}

/**
 * Where the thumb sits: the chosen option's column and the column count. The track's
 * columns are equal, so the CSS reads these as `--i` / `--n`. Null when no option is
 * chosen, which hides the thumb.
 */
export function segmentThumb(options: readonly { value: string }[], value: string): { index: number; count: number } | null {
	const index = options.findIndex((o) => o.value === value);
	return index < 0 ? null : { index, count: options.length };
}

export interface SegmentedProps<V extends string> {
	options: readonly SegmentedOption<V>[];
	value: V;
	onChange: (value: V) => void;
	/** The group's accessible name. */
	label: string;
	/** 36px instead of 38px, with smaller type. */
	dense?: boolean;
	/** Fills its container, every segment the same width. */
	full?: boolean;
	disabled?: boolean;
	className?: string;
}

const NEXT_KEYS: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * A segmented control (spec §8): a well track whose one raised thumb springs to the
 * chosen segment. A radio group — the arrow keys move the choice, Home / End jump.
 */
export function Segmented<V extends string>({ options, value, onChange, label, dense, full, disabled, className }: SegmentedProps<V>) {
	const groupRef = useRef<HTMLDivElement>(null);
	const thumb = segmentThumb(options, value);

	const choose = (i: number) => {
		onChange(options[i].value);
		groupRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[i]?.focus();
	};
	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const n = options.length;
		const from = thumb?.index ?? 0;
		let to: number | null = null;
		if (e.key in NEXT_KEYS) to = (from + NEXT_KEYS[e.key] + n) % n;
		else if (e.key === "Home") to = 0;
		else if (e.key === "End") to = n - 1;
		if (to === null) return;
		e.preventDefault();
		choose(to);
	};

	return (
		<div
			ref={groupRef}
			role="radiogroup"
			aria-label={label}
			aria-disabled={disabled || undefined}
			data-dense={dense ? "" : undefined}
			data-full={full ? "" : undefined}
			className={cn("gp-seg", className)}
			onKeyDown={disabled ? undefined : onKeyDown}
		>
			{thumb && (
				<span
					className="gp-seg-thumb"
					aria-hidden
					style={{ "--i": thumb.index, "--n": thumb.count } as CSSProperties}
				/>
			)}
			{options.map((opt, i) => {
				const on = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={on}
						tabIndex={on || (!thumb && i === 0) ? 0 : -1}
						disabled={disabled}
						className="gp-focus"
						onClick={() => onChange(opt.value)}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
