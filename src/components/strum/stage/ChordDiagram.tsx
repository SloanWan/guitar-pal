"use client";

import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";

interface Props {
	/** Null for a bar with no chord to draw. */
	diagram: BarChordDiagram | null;
	size?: "md" | "sm";
	label?: string;
}

/** A bar's chord shape, or a quiet blank of the same size while it loads or when there is none. */
export default function ChordDiagram({ diagram, size = "md", label }: Props) {
	return (
		<span className="st-dg" data-size={size === "sm" ? "sm" : undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
			{diagram?.status === "ready" ? (
				<ChordDiagramSVG {...diagram.def} size="compact" />
			) : (
				<span className="st-dg-empty">{diagram ? "" : "—"}</span>
			)}
		</span>
	);
}
