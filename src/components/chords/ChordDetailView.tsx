"use client";

import ChordDiagram from "@/components/chords/ChordDiagram";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

export interface VoicingCard {
  id: string;
  label: string;
  def: VexChordDef;
}

interface Props {
  voicings: VoicingCard[];
}

export default function ChordDetailView({ voicings }: Props) {
  if (voicings.length === 0) {
    return <p className="text-sm text-muted-foreground">No voicings found.</p>;
  }
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {voicings.map(({ id, label, def }) => (
        <ChordDiagram key={id} def={def} label={label} />
      ))}
    </div>
  );
}
