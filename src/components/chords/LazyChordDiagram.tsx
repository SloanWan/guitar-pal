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
	compact: { w: 126, h: 168 }, // SVG: 100 × 86
	regular: { w: 210, h: 240 }, // SVG: 184 × 158
	large: { w: 282, h: 302 }, // SVG: 256 × 220
};

export default function LazyChordDiagram({ def, label, size = "compact", href, onClick }: Props) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [visible, setVisible] = useState(false);
	const [hovered, setHovered] = useState(false);

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
				className="shrink-0 rounded-none border border-line-strong bg-denim-tint"
			/>
		);
	}

	if (href) {
		return (
			<div ref={rootRef} className="shrink-0">
				<Link
					href={href}
					className="block"
					aria-label={`${label} — click to see all voicings`}
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
				>
					<ChordDiagram def={def} label={label} size={size} isHovered={hovered} />
				</Link>
			</div>
		);
	}

	return (
		<div
			ref={rootRef}
			className="shrink-0 cursor-pointer"
			onClick={onClick}
			role="button"
			aria-label={`${label} — click to see all voicings`}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<ChordDiagram def={def} label={label} size={size} isHovered={hovered} />
		</div>
	);
}
