"use client";

import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";

const MODES: DiagramMode[] = ["fingers", "noteNames", "fretboard"];
const MODE_LABELS: Record<DiagramMode, string> = {
	fingers: "123",
	noteNames: "ABC",
	fretboard: "Grid",
};

interface Props {
	mode: DiagramMode;
	onChange: (mode: DiagramMode) => void;
}

// Segmented control switching what a chord diagram prints on its dots. The sliding
// highlight is a plain CSS transform transition — no state-driven animation needed.
export default function ChordModeToggle({ mode, onChange }: Props) {
	return (
		<div className="relative inline-flex overflow-hidden rounded-none border border-line-strong bg-surface">
			<div
				className="absolute top-0 h-full bg-denim transition-transform duration-200 ease-in-out"
				style={{
					width: "33.333%",
					transform: `translateX(${MODES.indexOf(mode) * 100}%)`,
				}}
			/>
			{MODES.map((m) => (
				<button
					key={m}
					type="button"
					onClick={() => onChange(m)}
					className={`relative z-10 px-5 py-2 text-sm font-medium text-center transition-colors duration-200 ${
						mode === m ? "text-on-denim" : "text-ink-dim"
					}`}
				>
					{MODE_LABELS[m]}
				</button>
			))}
		</div>
	);
}
