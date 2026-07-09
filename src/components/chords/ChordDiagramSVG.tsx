"use client";

import React from "react";

const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"] as const;
const STRING_LABELS = ["E","A","D","G","B","e"] as const;

// SVG layout (px, "regular" size)
// viewBox: 0 0 160 158
// Strings (vertical): x = LEFT + s * STR_SPACING  (s = 0..5, low E → high e)
//   LEFT=32, STR_SPACING=24 → x = 32, 56, 80, 104, 128, 152
// Fret lines (horizontal): y = TOP + n * FRET_H  (n = 0..5)
//   TOP=28 (nut), FRET_H=22 → y = 28, 50, 72, 94, 116, 138
// Note dot center: y = TOP + (visualFret - 0.5) * FRET_H
//   where visualFret = frets[s] - startFret + 1  (1-indexed within displayed range)
// Muted/open markers (fingers mode): y = TOP - 9  (text baseline, above nut)
// Open-string dot (noteNames/fretboard): circle centered at OPEN_DOT_Y = TOP - 14 = 14
//   — bottom of circle at y=22, nut rect top at y=23, 1px clear
// String labels: y = TOP + 5*FRET_H + 14 = 152
// LEFT=32 gives consistent left margin. Fret number label (textAnchor="end", x=LEFT-12=20)
//   ends at x=20, 4px clear of leftmost barre/dot edge at strX(0)-DOT_R = 24.

const W = 160;
const LEFT = 32;
const TOP = 28;
const FRET_H = 22;
const NUM_FRETS = 5;
const H = TOP + NUM_FRETS * FRET_H + 20;
const STR_SPACING = (W - LEFT - 8) / 5; // (160-32-8)/5 = 24
const DOT_R = 8;
const OPEN_DOT_Y = TOP - 14; // open-string dot center in noteNames/fretboard mode

function strX(s: number): number {
  return LEFT + s * STR_SPACING;
}

function fretLineY(n: number): number {
  return TOP + n * FRET_H;
}

function noteCenterY(visualFret: number): number {
  return TOP + (visualFret - 0.5) * FRET_H;
}

export type DiagramMode = "fingers" | "noteNames" | "fretboard";

export interface ChordDiagramSVGProps {
  frets: number[];
  fingers: number[];
  startFret: number;
  barreFret?: number | null;
  mode?: DiagramMode;
  size?: "regular" | "compact";
  rootMidi?: number;
}

interface GhostDot {
  s: number;
  visualFret: number;
  absoluteFret: number;
}

export default function ChordDiagramSVG({
  frets,
  fingers,
  startFret,
  barreFret,
  mode = "fingers",
  size = "regular",
  rootMidi,
}: ChordDiagramSVGProps) {
  const rootPitchClass = rootMidi !== undefined ? rootMidi % 12 : -1;

  function pitchClass(s: number, fret: number): number {
    return (OPEN_STRING_MIDI[s] + fret) % 12;
  }

  function isRoot(s: number, fret: number): boolean {
    return rootPitchClass >= 0 && pitchClass(s, fret) === rootPitchClass;
  }

  function getDotLabel(s: number, fret: number, finger: number): string {
    if (mode === "fingers") return finger > 0 ? String(finger) : "";
    return NOTE_NAMES[pitchClass(s, fret)];
  }

  // Barre span: leftmost and rightmost non-muted string
  let barreMin = -1;
  let barreMax = -1;
  if (barreFret != null) {
    for (let s = 0; s < 6; s++) {
      if (frets[s] !== -1) {
        if (barreMin === -1) barreMin = s;
        barreMax = s;
      }
    }
  }

  // Ghost dots (fretboard mode): every visible fret cell on non-muted strings
  // except: the actual fretted note (gets a dark dot) and the barre fret row
  // (handled separately as barreRowDots, rendered after the barre bar).
  const ghostDots: GhostDot[] = [];
  if (mode === "fretboard") {
    for (let s = 0; s < 6; s++) {
      if (frets[s] === -1) continue;
      for (let i = 0; i < NUM_FRETS; i++) {
        const visualFret = i + 1;
        const absoluteFret = startFret + visualFret - 1;
        const isActualFret = absoluteFret === frets[s];
        const isBarreRow = barreFret != null && absoluteFret === barreFret;
        if (!isActualFret && !isBarreRow) {
          ghostDots.push({ s, visualFret, absoluteFret });
        }
      }
    }
  }

  // Barre row light dots (fretboard mode only): one light dot per non-muted string
  // at the barre fret row. Rendered after the barre bar (so they sit on top of it)
  // and before main dark dots (which override the light dot for strings actually
  // fretted at barreFret). Pre-compute y and absolute fret once for the whole row.
  const barreRowVisualFret = barreFret != null ? barreFret - startFret + 1 : 0;
  const barreAbsoluteFret = barreFret ?? 0; // only used when barreRowDots is non-empty
  const barreRowDots: number[] = []; // string indices
  if (mode === "fretboard" && barreFret != null) {
    for (let s = 0; s < 6; s++) {
      if (frets[s] !== -1) barreRowDots.push(s);
    }
  }

  const gridRight = strX(5);
  const nutY = fretLineY(0);
  const noteFontSize = mode === "fingers" ? 9 : 7;

  const svgW = size === "compact" ? 100 : W;
  const svgH = size === "compact" ? Math.round(H * 100 / W) : H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg">
      {/* Nut: thick filled rect when startFret===1; thin line + fret number otherwise */}
      {startFret === 1 ? (
        <rect x={LEFT} y={nutY - 5} width={5 * STR_SPACING} height={5} fill="#1a1a1a" rx={1} />
      ) : (
        <>
          <line x1={LEFT} y1={nutY} x2={gridRight} y2={nutY} stroke="#bbb" strokeWidth={1.5} />
          <text x={LEFT - 12} y={nutY + FRET_H / 2 + 4} textAnchor="end" fontSize={10} fill="#555">
            {startFret}
          </text>
        </>
      )}

      {/* Fret lines 1–5 */}
      {Array.from({ length: NUM_FRETS }, (_, i) => i + 1).map(n => (
        <line key={n} x1={LEFT} y1={fretLineY(n)} x2={gridRight} y2={fretLineY(n)} stroke="#bbb" strokeWidth={1} />
      ))}

      {/* String lines */}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={s} x1={strX(s)} y1={nutY} x2={strX(s)} y2={fretLineY(NUM_FRETS)} stroke="#333" strokeWidth={1.5} />
      ))}

      {/* Ghost dots (fretboard mode) — rendered before barre and main dots */}
      {ghostDots.map(({ s, visualFret, absoluteFret }) => {
        const x = strX(s);
        const cy = noteCenterY(visualFret);
        const name = NOTE_NAMES[pitchClass(s, absoluteFret)];
        return (
          <g key={`ghost-${s}-${visualFret}`}>
            <circle cx={x} cy={cy} r={DOT_R} fill="#ececec" />
            <text x={x} y={cy + 7 * 0.42} textAnchor="middle" fontSize={7} fill="#bbb" fontWeight="bold">
              {name}
            </text>
          </g>
        );
      })}

      {/* Barre bar — over ghost dots, behind barre row dots and main dots */}
      {barreFret != null && barreMin >= 0 && (
        <rect
          x={strX(barreMin) - DOT_R}
          y={noteCenterY(barreFret - startFret + 1) - DOT_R}
          width={strX(barreMax) - strX(barreMin) + DOT_R * 2}
          height={DOT_R * 2}
          rx={DOT_R}
          fill="#1a1a1a"
        />
      )}

      {/* Barre row light dots — on top of barre bar, behind main dark dots.
          Every non-muted string gets a light circle here; main dots override
          the ones for strings actually fretted at barreFret. */}
      {barreRowDots.map(s => {
        const x = strX(s);
        const cy = noteCenterY(barreRowVisualFret);
        const name = NOTE_NAMES[pitchClass(s, barreAbsoluteFret)];
        return (
          <g key={`barre-row-${s}`}>
            <circle cx={x} cy={cy} r={DOT_R} fill="#ececec" />
            <text x={x} y={cy + 7 * 0.42} textAnchor="middle" fontSize={7} fill="#bbb" fontWeight="bold">
              {name}
            </text>
          </g>
        );
      })}

      {/* Per-string main markers */}
      {frets.map((fret, s) => {
        const x = strX(s);

        if (fret === -1) {
          return (
            <text key={s} x={x} y={nutY - 9} textAnchor="middle" fontSize={13} fill="#666">×</text>
          );
        }

        if (fret === 0) {
          if (mode === "fingers") {
            return (
              <text key={s} x={x} y={nutY - 9} textAnchor="middle" fontSize={12} fill="#555">○</text>
            );
          }
          // noteNames / fretboard: dark filled circle above nut row with open-string note name
          const root = isRoot(s, 0);
          const name = NOTE_NAMES[pitchClass(s, 0)];
          return (
            <g key={s}>
              <circle cx={x} cy={OPEN_DOT_Y} r={DOT_R} fill={root ? "#4A6FA5" : "#1a1a1a"} stroke="white" strokeWidth={1.5} />
              <text x={x} y={OPEN_DOT_Y + noteFontSize * 0.42} textAnchor="middle" fontSize={noteFontSize} fill="#fff" fontWeight="bold">
                {name}
              </text>
            </g>
          );
        }

        // Fretted note
        const visualFret = fret - startFret + 1;
        const cy = noteCenterY(visualFret);
        const root = isRoot(s, fret);
        const label = getDotLabel(s, fret, fingers[s]);

        return (
          <g key={s}>
            <circle cx={x} cy={cy} r={DOT_R} fill={root ? "#4A6FA5" : "#1a1a1a"} stroke="white" strokeWidth={1.5} />
            {label && (
              <text x={x} y={cy + noteFontSize * 0.42} textAnchor="middle" fontSize={noteFontSize} fill="#fff" fontWeight="bold">
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* String labels */}
      {STRING_LABELS.map((lbl, s) => (
        <text key={s} x={strX(s)} y={fretLineY(NUM_FRETS) + 14} textAnchor="middle" fontSize={10} fill="#666">
          {lbl}
        </text>
      ))}
    </svg>
  );
}
