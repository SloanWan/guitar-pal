"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

export interface ChordWithVoicings {
  id: string;
  root: string;
  suffix: string;
  chord_voicings: ChordVoicing[];
}

export async function getChord(
  root: string,
  suffix: string
): Promise<ChordWithVoicings | null> {
  const supabase = await createSupabaseServer();
  const { data: chord } = await supabase
    .from("chords")
    .select(
      `
      id, root, suffix,
      chord_voicings (
        id, label, start_fret, barre_fret, capo, frets, fingers
      )
    `
    )
    .eq("root", root)
    .eq("suffix", suffix)
    .single();
  return chord as ChordWithVoicings | null;
}
