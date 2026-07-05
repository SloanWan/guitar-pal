"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

export interface ChordWithVoicings {
  id: string;
  root: string;
  suffix: string;
  chord_voicings: ChordVoicing[];
}

const VOICING_FIELDS = `
  id, root, suffix,
  chord_voicings ( id, label, start_fret, barre_fret, capo, frets, fingers )
` as const;

export async function getChord(
  root: string,
  suffix: string
): Promise<ChordWithVoicings | null> {
  const supabase = await createSupabaseServer();
  const { data: chord } = await supabase
    .from("chords")
    .select(VOICING_FIELDS)
    .eq("root", root)
    .eq("suffix", suffix)
    .single();
  return chord as ChordWithVoicings | null;
}

export async function getChordsByRoot(root: string): Promise<ChordWithVoicings[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("chords")
    .select(VOICING_FIELDS)
    .eq("root", root);
  return (data as ChordWithVoicings[] | null) ?? [];
}

export async function getAllChordsWithVoicings(): Promise<ChordWithVoicings[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("chords")
    .select(VOICING_FIELDS)
    .order("root")
    .order("suffix");
  return (data as ChordWithVoicings[] | null) ?? [];
}
