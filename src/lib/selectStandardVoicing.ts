import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

export function selectStandardVoicing(voicings: ChordVoicing[]): ChordVoicing | null {
  if (voicings.length === 0) return null;
  const standard = voicings.find((v) => v.label === "Standard");
  if (standard) return standard;
  return voicings.reduce((min, v) => (v.start_fret < min.start_fret ? v : min));
}
