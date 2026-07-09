"use client";

import React, { useState } from "react";
import ChordDiagramSVG, { type DiagramMode } from "@/components/chords/ChordDiagramSVG";

interface Specimen {
  label: string;
  frets: number[];
  fingers: number[];
  startFret: number;
  barreFret: number | null;
  rootMidi: number;
}

const SPECIMENS: Specimen[] = [
  {
    label: "C major",
    frets: [-1, 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    startFret: 1,
    barreFret: null,
    rootMidi: 60,
  },
  {
    label: "F major barre",
    frets: [1, 1, 2, 3, 3, 1],
    fingers: [1, 1, 2, 3, 4, 1],
    startFret: 1,
    barreFret: 1,
    rootMidi: 65,
  },
  {
    label: "B major (high position)",
    frets: [2, 2, 4, 4, 4, 2],
    fingers: [1, 1, 2, 3, 4, 1],
    startFret: 2,
    barreFret: 2,
    rootMidi: 71,
  },
  {
    label: "Bb major",
    frets: [1, 1, 3, 3, 3, 1],
    fingers: [1, 1, 2, 3, 4, 1],
    startFret: 1,
    barreFret: 1,
    rootMidi: 70,
  },
  {
    label: "G major",
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    startFret: 1,
    barreFret: null,
    rootMidi: 67,
  },
  {
    label: "D major",
    frets: [-1, -1, 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    startFret: 1,
    barreFret: null,
    rootMidi: 62,
  },
  {
    label: "F add9",
    frets: [-1, 0, 3, 2, 1, 3],
    fingers: [0, 0, 3, 2, 1, 4],
    startFret: 1,
    barreFret: null,
    rootMidi: 65,
  },
  {
    label: "C# major (pos 4)",
    frets: [-1, 4, 6, 6, 6, 4],
    fingers: [0, 1, 2, 3, 4, 1],
    startFret: 4,
    barreFret: 4,
    rootMidi: 61,
  },
];

// Cycle order: fingers → noteNames → fretboard → fingers
const NEXT_MODE: Record<DiagramMode, DiagramMode> = {
  fingers: "noteNames",
  noteNames: "fretboard",
  fretboard: "fingers",
};

// Button label shows the NEXT mode the click will switch to
const NEXT_LABEL: Record<DiagramMode, string> = {
  fingers: "ABC",
  noteNames: "Grid",
  fretboard: "123",
};

// Short label for the current mode (used in comparison section headers)
const MODE_LABEL: Record<DiagramMode, string> = {
  fingers: "123",
  noteNames: "ABC",
  fretboard: "Grid",
};

const MODE_HEADING: Record<DiagramMode, string> = {
  fingers: "123 — Finger Numbers",
  noteNames: "ABC — Note Names",
  fretboard: "Grid — Full Fretboard",
};

const ALL_MODES: DiagramMode[] = ["fingers", "noteNames", "fretboard"];

export default function ChordDiagramDevPage() {
  const [mode, setMode] = useState<DiagramMode>("fingers");

  return (
    <div className="p-8 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-1">ChordDiagramSVG — Dev Preview</h1>
      <p className="text-sm text-gray-400 mb-6">
        Throwaway validation page. Not linked from production navigation.
      </p>

      <button
        onClick={() => setMode(m => NEXT_MODE[m])}
        className="mb-10 px-4 py-2 bg-[#4A6FA5] text-white rounded text-sm font-medium hover:bg-[#3A5A8A] transition-colors"
      >
        {NEXT_LABEL[mode]}
      </button>

      <div className="space-y-12">
        {/* Primary grid: all specimens in current mode */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {MODE_HEADING[mode]}
          </h2>
          <div className="grid grid-cols-4 gap-x-8 gap-y-10">
            {SPECIMENS.map(s => (
              <div key={s.label} className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-gray-600 text-center leading-tight">
                  {s.label}
                </span>
                <ChordDiagramSVG
                  frets={s.frets}
                  fingers={s.fingers}
                  startFret={s.startFret}
                  barreFret={s.barreFret}
                  mode={mode}
                  rootMidi={s.rootMidi}
                />
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* Three-mode comparison: all modes stacked per specimen */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Three-mode comparison (123 · ABC · Grid)
          </h2>
          <div className="grid grid-cols-4 gap-x-8 gap-y-10">
            {SPECIMENS.map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-gray-600 text-center leading-tight mb-2">
                  {s.label}
                </span>
                {ALL_MODES.map(m => (
                  <div key={m} className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400 mb-0.5">
                      {MODE_LABEL[m]}
                    </span>
                    <ChordDiagramSVG
                      frets={s.frets}
                      fingers={s.fingers}
                      startFret={s.startFret}
                      barreFret={s.barreFret}
                      mode={m}
                      rootMidi={s.rootMidi}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
