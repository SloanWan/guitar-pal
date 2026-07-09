"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import { Button } from "@/components/ui/button";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";
import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

const ROOT_PC: Record<string, number> = {
	C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
	E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
	A: 9, "A#": 10, Bb: 10, B: 11,
};

const MODES: DiagramMode[] = ["fingers", "noteNames", "fretboard"];
const MODE_LABELS: Record<DiagramMode, string> = {
	fingers: "123",
	noteNames: "ABC",
	fretboard: "Grid",
};

export interface VoicingCard {
	id: string;
	label: string;
	def: VexChordDef;
	pitches: readonly number[];
}

interface Props {
	voicings: VoicingCard[];
	root?: string;
}

export default function ChordDetailView({ voicings, root }: Props) {
	const [mode, setMode] = useState<DiagramMode>("fingers");
	const rootMidi = root !== undefined ? ROOT_PC[root] : undefined;

	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const [isPreloading, setIsPreloading] = useState(false);

	useEffect(() => {
		return () => {
			ctxRef.current?.close().catch(() => undefined);
		};
	}, []);

	const handlePlay = useCallback(async (pitches: readonly number[]) => {
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() => {
				setIsPreloading(false);
			});
		}
		if (ctxRef.current.state === "suspended") {
			await ctxRef.current.resume();
		}
		await preloadRef.current;
		triggerChordPreview(pitches, ctxRef.current, ctxRef.current.destination, ctxRef.current.currentTime);
	}, []);

	if (voicings.length === 0) {
		return <p className="text-sm text-muted-foreground">No voicings found.</p>;
	}

	return (
		<div className="flex flex-col items-center gap-6">
			<div className="relative inline-flex overflow-hidden rounded-full border border-denim-border bg-denim-tint">
				<div
					className="absolute top-0 h-full rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
					style={{
						width: "33.333%",
						transform: `translateX(${MODES.indexOf(mode) * 100}%)`,
					}}
				/>
				{MODES.map((m) => (
					<button
						key={m}
						onClick={() => setMode(m)}
						className={`relative z-10 px-5 py-2 text-sm font-medium text-center transition-colors duration-200 ${
							mode === m ? "text-denim" : "text-denim-light"
						}`}
					>
						{MODE_LABELS[m]}
					</button>
				))}
			</div>
			<div className="flex flex-wrap justify-center gap-4">
				{voicings.map(({ id, label, def, pitches }) => (
					<div key={id} className="flex flex-col items-center gap-2">
						<ChordDiagram def={def} label={label} mode={mode} rootMidi={rootMidi} />
						<Button
							size="sm"
							variant="outline"
							className="gap-1 border-denim-border text-denim hover:bg-denim-tint"
							disabled={isPreloading}
							onClick={() => void handlePlay(pitches)}
						>
							{isPreloading ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Play className="h-3 w-3" />
							)}
							{isPreloading ? "Loading…" : "Play"}
						</Button>
					</div>
				))}
			</div>
		</div>
	);
}
