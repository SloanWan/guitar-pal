"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ChordDiagram from "@/components/chords/ChordDiagram";
import type { DiagramSize } from "@/components/chords/ChordDiagramSVG";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

interface Props {
  def: VexChordDef;
  label: string;
  size?: DiagramSize;
  // Provide one of: href (Link-based navigation) or onClick (callback-based)
  href?: string;
  onClick?: () => void;
}

// Placeholder dimensions per size to prevent layout shift before IntersectionObserver fires.
// Outer card = border(1) + p-3(12) + SVG + p-3(12) + border(1) wide;
//              border(1) + p-3(12) + SVG + gap-1(4) + text-xs(18) + p-3(12) + border(1) tall.
const PLACEHOLDER: Record<DiagramSize, { w: number; h: number }> = {
  compact: { w: 126, h: 168 },  // SVG: 100 × 86
  regular: { w: 210, h: 240 },  // SVG: 184 × 158
  large:   { w: 282, h: 302 },  // SVG: 256 × 220
};

export default function LazyChordDiagram({ def, label, size = "compact", href, onClick }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!visible) {
    return (
      <div
        ref={rootRef}
        style={{ width: PLACEHOLDER[size].w, height: PLACEHOLDER[size].h }}
        className="shrink-0 rounded-lg border border-denim-border bg-denim-tint"
      />
    );
  }

  const tooltip = (
    <div className="pointer-events-none absolute inset-0 flex items-start justify-center rounded-lg pt-2 opacity-0 transition-opacity group-hover:opacity-100">
      <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        Click to see all voicings
      </span>
    </div>
  );

  if (href) {
    return (
      <div ref={rootRef} className="shrink-0">
        <Link
          href={href}
          className="group relative block"
          aria-label={`${label} — click to see all voicings`}
        >
          <ChordDiagram def={def} label={label} size={size} />
          {tooltip}
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="group relative shrink-0 cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`${label} — click to see all voicings`}
    >
      <ChordDiagram def={def} label={label} size={size} />
      {tooltip}
    </div>
  );
}
