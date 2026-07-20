"use client";

import type { VexChordDef } from "@/lib/chordVoicingToVexChords";
import ChordDiagramSVG, {
	type DiagramMode,
	type DiagramSize,
} from "@/components/chords/ChordDiagramSVG";
import MusicalText from "@/components/MusicalText";

interface Props {
	def: VexChordDef;
	label: string;
	size?: DiagramSize;
	mode?: DiagramMode;
	rootMidi?: number;
	onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
	onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
	isHovered?: boolean;
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

	const barreFret = def.barres.length > 0 ? def.barres[0].fret + def.position - 1 : null;

	return { frets, fingers, startFret: def.position, barreFret };
}

export default function ChordDiagram({
	def,
	label,
	size = "regular",
	mode = "fingers",
	rootMidi,
	onMouseEnter,
	onMouseLeave,
	isHovered = false,
}: Props) {
	const svgProps = toSVGProps(def);

	return (
		<div
			className={`relative overflow-hidden flex flex-col items-center gap-1 rounded-none border p-3 transition-colors duration-300 ${isHovered ? "border-denim bg-surface" : "border-transparent bg-denim-tint"}`}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<ChordDiagramSVG {...svgProps} mode={mode} rootMidi={rootMidi} size={size} />
			<span className="text-xs font-medium text-denim">
				<MusicalText text={label} />
			</span>
		</div>
	);
}
