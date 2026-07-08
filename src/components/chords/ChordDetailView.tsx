"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Loader2 } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import { Button } from "@/components/ui/button";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
} from "@/components/strum/useGuitarSampleLoader";

export interface VoicingCard {
	id: string;
	label: string;
	def: VexChordDef;
	pitches: readonly number[];
}

interface Props {
	voicings: VoicingCard[];
}

export default function ChordDetailView({ voicings }: Props) {
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
		<div className="flex flex-wrap justify-center gap-4">
			{voicings.map(({ id, label, def, pitches }) => (
				<div key={id} className="flex flex-col items-center gap-2">
					<ChordDiagram def={def} label={label} />
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
	);
}
