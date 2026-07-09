"use client";

import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";

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
];

const DOT_STYLES = [
  "gray-on-transparent",
  "white-dot",
  "outline-only",
  "text-only",
] as const;
type GhostDotStyle = typeof DOT_STYLES[number];

const SECTIONS: { label: string; cardClass: string }[] = [
  { label: "A — No card background",                      cardClass: "" },
  { label: "B — Light blue card (current production style)", cardClass: "bg-blue-50 rounded-xl p-3" },
  { label: "C — White card with border",                  cardClass: "bg-white border border-gray-200 rounded-xl p-3" },
  { label: "D — Gray card",                               cardClass: "bg-gray-100 rounded-xl p-3" },
];

export default function ChordDiagramDevPage() {
  return (
    <div className="p-8 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-2">ChordDiagramSVG — Ghost Dot Style Variants</h1>
      <p className="text-sm text-gray-500 mb-10">All diagrams locked to fretboard (Grid) mode. Each section × 4 dotStyle variants × 3 specimens.</p>

      {SECTIONS.map(({ label, cardClass }) => (
        <section key={label} className="mb-14">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-5">{label}</h2>
          <div className="flex gap-10 items-start">
            {DOT_STYLES.map(ds => (
              <div key={ds} className="flex flex-col items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400 mb-1">{ds}</span>
                {SPECIMENS.map(spec => (
                  <div
                    key={spec.label}
                    className={
                      cardClass
                        ? `${cardClass} flex flex-col items-center gap-1`
                        : "flex flex-col items-center gap-1"
                    }
                  >
                    <ChordDiagramSVG
                      frets={spec.frets}
                      fingers={spec.fingers}
                      startFret={spec.startFret}
                      barreFret={spec.barreFret}
                      mode="fretboard"
                      rootMidi={spec.rootMidi}
                    />
                    <span className="text-[10px] text-gray-400">{spec.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
