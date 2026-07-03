"use client";

import { useEffect, useRef } from "react";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

interface Props {
	def: VexChordDef;
	label: string;
	compact?: boolean;
}

const REGULAR = { width: 140, height: 160, showTuning: true };
const COMPACT = { width: 100, height: 120, showTuning: false };

export default function ChordDiagram({ def, label, compact = false }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		el.innerHTML = "";
		let cancelled = false;
		const opts = compact ? COMPACT : REGULAR;
		// Dynamic import keeps vexchords (and its SVG.js dep) out of SSR entirely
		import("vexchords").then(({ ChordBox }) => {
			if (cancelled) return;
			const box = new ChordBox(el, opts);
			box.draw(def);
		});
		return () => {
			cancelled = true;
		};
	}, [def, compact]);

	return (
		<div className="flex flex-col items-center gap-1 rounded-lg border border-denim-border bg-denim-tint p-3">
			<div ref={containerRef} />
			<span className="text-xs font-medium text-denim">{label}</span>
		</div>
	);
}
