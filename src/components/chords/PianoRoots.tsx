"use client";

import type { CSSProperties } from "react";
import { withGlyphs } from "@/lib/chordFormulas";
import { cn } from "@/lib/utils";
import "./chords.css";

const WHITE = ["C", "D", "E", "F", "G", "A", "B"] as const;
/** Each black key and the white key it sits after (its left edge in sevenths). */
const BLACK = [
	["C#", 1],
	["Eb", 2],
	["F#", 4],
	["Ab", 5],
	["Bb", 6],
] as const;

interface Props {
	/** The root picked, in the tables' spelling; null when none is. */
	value: string | null;
	onChange: (root: string) => void;
	/** Stretches to its container rather than the fixed keyboard width. */
	wide?: boolean;
	className?: string;
}

/** The twelve roots as one octave of piano keys. */
export default function PianoRoots({ value, onChange, wide, className }: Props) {
	return (
		<div className={cn("ch-piano", className)} data-wide={wide ? "" : undefined} role="group" aria-label="Root note">
			{WHITE.map((root) => (
				<button
					key={root}
					type="button"
					className="ch-wk gp-focus"
					aria-pressed={value === root}
					aria-label={`${root} chords`}
					onClick={() => onChange(root)}
				>
					{root}
				</button>
			))}
			{BLACK.map(([root, after]) => (
				<button
					key={root}
					type="button"
					className="ch-bk gp-focus"
					style={{ "--at": after / 7 } as CSSProperties}
					aria-pressed={value === root}
					aria-label={`${withGlyphs(root)} chords`}
					onClick={() => onChange(root)}
				>
					{withGlyphs(root)}
				</button>
			))}
		</div>
	);
}
