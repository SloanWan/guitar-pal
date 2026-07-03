"use client";

import { useEffect, useRef, useState } from "react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";

interface Props {
	def: VexChordDef;
	label: string;
	compact?: boolean;
	onClick?: () => void;
}

// Must match the outer card dimensions of <ChordDiagram compact> to prevent layout shift:
// border(1) + p-3(12) + SVG-w(100) + p-3(12) + border(1) = 126
// border(1) + p-3(12) + SVG-h(120) + gap-1(4) + text-xs line(18) + p-3(12) + border(1) = 168
const COMPACT_W = 126;
const COMPACT_H = 168;

export default function LazyChordDiagram({ def, label, compact, onClick }: Props) {
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
				style={{ width: COMPACT_W, height: COMPACT_H }}
				className="shrink-0 rounded-lg border border-denim-border bg-denim-tint"
			/>
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
			<ChordDiagram def={def} label={label} compact={compact} />
			<div className="pointer-events-none absolute inset-0 flex items-start justify-center rounded-lg pt-2 opacity-0 transition-opacity group-hover:opacity-100">
				<span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
					Click to see all voicings
				</span>
			</div>
		</div>
	);
}
