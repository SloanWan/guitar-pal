"use client";

import Rocker from "@/components/ui/Rocker";
import type { ChordView } from "./StepGrid";

/**
 * Chord names, or the shapes to hold.
 *
 * The state is written out beside the switch rather than left to an icon: a
 * guitar and a letter "T" both look like they might mean either thing, and the
 * player should not have to flip the control to find out which way round it is.
 */
export default function ChordViewToggle({
	value,
	onChange,
	disabled,
}: {
	value: ChordView;
	onChange: (view: ChordView) => void;
	disabled?: boolean;
}) {
	const showingShapes = value === "diagram";
	return (
		<div className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
			<Rocker
				checked={showingShapes}
				onChange={(next) => onChange(next ? "diagram" : "name")}
				disabled={disabled}
				ariaLabel={showingShapes ? "Showing chord shapes" : "Showing chord names"}
			/>
			<span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
				{showingShapes ? "Shapes" : "Names"}
			</span>
		</div>
	);
}
