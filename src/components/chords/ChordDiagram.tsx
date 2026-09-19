"use client";

import type { DiagramShape } from "@/lib/chordVoicing";
import ChordDiagramSVG, {
	type DiagramMode,
	type DiagramSize,
} from "@/components/chords/ChordDiagramSVG";
import MusicalText from "@/components/MusicalText";

interface Props {
	def: DiagramShape;
	label: string;
	size?: DiagramSize;
	mode?: DiagramMode;
	rootMidi?: number;
	onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
	onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
	isHovered?: boolean;
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
	return (
		<div
			className={`relative overflow-hidden flex flex-col items-center gap-1 rounded-none border p-3 transition-colors duration-300 ${isHovered ? "border-denim bg-surface" : "border-transparent bg-denim-tint"}`}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<ChordDiagramSVG {...def} mode={mode} rootMidi={rootMidi} size={size} />
			<span className="text-xs font-medium text-denim">
				<MusicalText text={label} />
			</span>
		</div>
	);
}
