"use client";

import { useState, useTransition } from "react";
import { getChord } from "@/lib/chords";
import { chordVoicingToVexChords, type ChordVoicing } from "@/lib/chordVoicingToVexChords";
import ChordDiagram from "@/components/ChordDiagram";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  initialChord?: {
    root: string;
    suffix: string;
    chord_voicings: ChordVoicing[];
  };
  roots: string[];
  rootSuffixMap: Record<string, string[]>;
}

export default function ChordsView({ initialChord, roots, rootSuffixMap }: Props) {
  const [root, setRoot] = useState(initialChord?.root ?? roots[0] ?? "");
  const [suffix, setSuffix] = useState(initialChord?.suffix ?? "");
  const [voicings, setVoicings] = useState<ChordVoicing[]>(
    initialChord?.chord_voicings ?? []
  );
  const [isPending, startTransition] = useTransition();

  const suffixes = rootSuffixMap[root] ?? [];

  function fetchVoicings(nextRoot: string, nextSuffix: string) {
    startTransition(async () => {
      const chord = await getChord(nextRoot, nextSuffix);
      setVoicings(chord?.chord_voicings ?? []);
    });
  }

  function handleRootChange(nextRoot: string) {
    const nextSuffixes = rootSuffixMap[nextRoot] ?? [];
    const nextSuffix = nextSuffixes[0] ?? "";
    setRoot(nextRoot);
    setSuffix(nextSuffix);
    if (nextSuffix) {
      fetchVoicings(nextRoot, nextSuffix);
    } else {
      setVoicings([]);
    }
  }

  function handleSuffixChange(nextSuffix: string) {
    setSuffix(nextSuffix);
    fetchVoicings(root, nextSuffix);
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Select value={root} onValueChange={handleRootChange}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Root" />
          </SelectTrigger>
          <SelectContent>
            {roots.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={suffix} onValueChange={handleSuffixChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Quality" />
          </SelectTrigger>
          <SelectContent>
            {suffixes.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : voicings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No voicings found.</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {voicings.map((v) => (
            <ChordDiagram
              key={v.id}
              def={chordVoicingToVexChords(v)}
              label={v.label ?? `Pos. ${v.start_fret}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
