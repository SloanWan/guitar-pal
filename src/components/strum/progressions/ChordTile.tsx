"use client";

import { forwardRef } from "react";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import ChordDiagram from "@/components/strum/stage/ChordDiagram";

interface Props {
	index: number;
	label: string;
	diagram: BarChordDiagram | null;
	/** The bar sounding now. */
	now: boolean;
	/** A bar kept under a name the library has no chord for: it sounds nothing. */
	silent: boolean;
	/** Absent on a shared snapshot, where a tile is only read. */
	onOpen?: () => void;
}

/** One bar of a progression: its chord's name over its shape. */
const ChordTile = forwardRef<HTMLButtonElement, Props>(function ChordTile({ index, label, diagram, now, silent, onOpen }, ref) {
	const body = (
		<>
			<span className="st-tile-name">{label}</span>
			<ChordDiagram diagram={silent ? null : diagram} size="sm" />
			<span className="st-lab st-num">Bar {index + 1}</span>
		</>
	);
	if (!onOpen) {
		return (
			<span className="st-tile" data-bar={index} data-now={now ? "" : undefined} data-silent={silent ? "" : undefined}>
				{body}
			</span>
		);
	}
	return (
		<button
			ref={ref}
			type="button"
			className="st-tile"
			data-bar={index}
			data-now={now ? "" : undefined}
			data-silent={silent ? "" : undefined}
			aria-label={`Bar ${index + 1}: ${label}${silent ? ", not in the chord library" : ""}. Change`}
			onClick={onOpen}
		>
			{body}
		</button>
	);
});

export default ChordTile;
