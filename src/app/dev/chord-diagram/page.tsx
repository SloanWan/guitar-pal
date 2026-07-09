"use client";

import { useState } from "react";
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
  { label: "C major",         frets: [-1,3,2,0,1,0], fingers: [0,3,2,0,1,0], startFret: 1, barreFret: null, rootMidi: 0  },
  { label: "F major barre",   frets: [1,1,2,3,3,1],  fingers: [1,1,2,3,4,1], startFret: 1, barreFret: 1,    rootMidi: 5  },
  { label: "B major (pos 2)", frets: [2,2,4,4,4,2],  fingers: [1,1,2,3,4,1], startFret: 2, barreFret: 2,    rootMidi: 11 },
  { label: "Bb major",        frets: [1,1,3,3,3,1],  fingers: [1,1,2,3,4,1], startFret: 1, barreFret: 1,    rootMidi: 10 },
  { label: "G major",         frets: [3,2,0,0,0,3],  fingers: [2,1,0,0,0,3], startFret: 1, barreFret: null, rootMidi: 7  },
  { label: "D major",         frets: [-1,-1,0,2,3,2],fingers: [0,0,0,1,3,2], startFret: 1, barreFret: null, rootMidi: 2  },
  { label: "F add9",          frets: [-1,0,3,2,1,3], fingers: [0,0,3,2,1,4], startFret: 1, barreFret: null, rootMidi: 5  },
  { label: "C# major (pos 4)",frets: [-1,4,6,6,6,4], fingers: [0,1,2,3,4,1], startFret: 4, barreFret: 4,    rootMidi: 1  },
];

const NEXT_MODE: Record<DiagramMode, DiagramMode> = {
  fingers: "noteNames",
  noteNames: "fretboard",
  fretboard: "fingers",
};

const NEXT_LABEL: Record<DiagramMode, string> = {
  fingers: "ABC",
  noteNames: "Grid",
  fretboard: "123",
};

export default function ChordDiagramDevPage() {
  const [mode, setMode] = useState<DiagramMode>("fingers");

  return (
    <div className="p-8 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">ChordDiagramSVG — Dev Preview</h1>

      <button
        onClick={() => setMode(m => NEXT_MODE[m])}
        className="mb-10 px-4 py-2 bg-[#4A6FA5] text-white rounded text-sm font-medium hover:bg-[#3A5A8A] transition-colors"
      >
        {NEXT_LABEL[mode]}
      </button>

      <div className="grid grid-cols-4 gap-x-8 gap-y-10">
        {SPECIMENS.map(s => (
          <div key={s.label} className="flex flex-col items-center gap-2">
            <ChordDiagramSVG
              frets={s.frets}
              fingers={s.fingers}
              startFret={s.startFret}
              barreFret={s.barreFret}
              mode={mode}
              rootMidi={s.rootMidi}
            />
            <span className="text-xs font-medium text-gray-600 text-center leading-tight">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
