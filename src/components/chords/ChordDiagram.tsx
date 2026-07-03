"use client";

import { useEffect, useRef } from "react";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

interface Props {
  def: VexChordDef;
  label: string;
}

export default function ChordDiagram({ def, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    let cancelled = false;
    // Dynamic import keeps vexchords (and its SVG.js dep) out of SSR entirely
    import("vexchords").then(({ ChordBox }) => {
      if (cancelled) return;
      const box = new ChordBox(el, { width: 140, height: 160 });
      box.draw(def);
    });
    return () => { cancelled = true; };
  }, [def]);

  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-denim-border bg-denim-tint p-3">
      <div ref={containerRef} />
      <span className="text-xs font-medium text-denim">{label}</span>
    </div>
  );
}
