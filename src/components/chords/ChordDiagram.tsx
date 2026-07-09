"use client";

import type { VexChordDef } from "@/lib/chordVoicingToVexChords";
import ChordDiagramSVG, { type DiagramMode } from "@/components/chords/ChordDiagramSVG";
import MusicalText from "@/components/MusicalText";

interface Props {
	def: VexChordDef;
	label: string;
	compact?: boolean;
	mode?: DiagramMode;
	rootMidi?: number;
}

function toSVGProps(def: VexChordDef): {
	frets: number[];
	fingers: number[];
	startFret: number;
	barreFret: number | null;
} {
	const frets = new Array<number>(6).fill(-1);
	const fingers = new Array<number>(6).fill(0);

	for (const entry of def.chord) {
		const stringNum = entry[0];
		const diagramFret = entry[1];
		const idx = 6 - stringNum; // 0 = low E, 5 = high e
		if (diagramFret === "x") {
			frets[idx] = -1;
		} else {
			frets[idx] = diagramFret === 0 ? 0 : def.position + diagramFret - 1;
		}
		if (entry.length === 3) {
			fingers[idx] = parseInt(entry[2]) || 0;
		}
	}

	const barreFret =
		def.barres.length > 0 ? def.barres[0].fret + def.position - 1 : null;

	return { frets, fingers, startFret: def.position, barreFret };
}

export default function ChordDiagram({
	def,
	label,
	compact = false,
	mode = "fingers",
	rootMidi,
}: Props) {
	const svgProps = toSVGProps(def);

	return (
		<div className="flex flex-col items-center gap-1 rounded-lg border border-denim-border bg-denim-tint p-3">
			<ChordDiagramSVG
				{...svgProps}
				mode={mode}
				rootMidi={rootMidi}
				size={compact ? "compact" : "regular"}
			/>
			<span className="text-xs font-medium text-denim">
				<MusicalText text={label} />
			</span>
		</div>
	);
}
