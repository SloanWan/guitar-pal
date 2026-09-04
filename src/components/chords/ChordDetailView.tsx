"use client";

import { useState, useCallback } from "react";
import { CirclePlay, Loader2 } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordModeToggle from "@/components/chords/ChordModeToggle";
import ChordVoicingModal, { type VoicingCard } from "@/components/chords/ChordVoicingModal";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { Button } from "@/components/ui/button";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";

// Re-exported so existing importers (the chord detail route) keep their import path.
export type { VoicingCard };

interface Props {
	voicings: VoicingCard[];
	root?: string;
	suffix?: string;
}

export default function ChordDetailView({ voicings, root, suffix }: Props) {
	const [mode, setMode] = useState<DiagramMode>("fingers");
	const [modalIndex, setModalIndex] = useState(0);
	const [modalOpen, setModalOpen] = useState(false);
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
	const preview = useChordPreview();

	const openModal = useCallback((index: number) => {
		setModalIndex(index);
		setModalOpen(true);
	}, []);

	const closeModal = useCallback(() => setModalOpen(false), []);

	const createRipple = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		const card = e.currentTarget;
		const rect = card.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const diameter = Math.sqrt(rect.width ** 2 + rect.height ** 2) * 2;

		const ripple = document.createElement("div");
		Object.assign(ripple.style, {
			position: "absolute",
			left: `${x}px`,
			top: `${y}px`,
			width: "0px",
			height: "0px",
			borderRadius: "50%",
			backgroundColor: "var(--denim)",
			transform: "translate(-50%, -50%)",
			pointerEvents: "none",
		});
		card.appendChild(ripple);
		const anim = ripple.animate(
			[
				{ width: "0px", height: "0px", opacity: 0.3 },
				{ width: `${diameter}px`, height: `${diameter}px`, opacity: 0 },
			],
			{ duration: 600, easing: "ease-out" },
		);
		anim.addEventListener("finish", () => ripple.remove());
	}, []);

	if (voicings.length === 0) {
		return <p className="text-sm text-ink-dim">No voicings found.</p>;
	}

	return (
		<>
			<div className="flex flex-col items-center gap-6">
				<ChordModeToggle mode={mode} onChange={setMode} />
				<div className="flex flex-wrap justify-center gap-4">
					{voicings.map(({ id, label, def, pitches }, index) => (
						<div
							key={id}
							className="flex flex-col items-center gap-2 cursor-pointer"
							onClick={() => openModal(index)}
						>
							<div className="flex flex-col items-center gap-2">
								<ChordDiagram
									def={def}
									label={label}
									mode={mode}
									rootMidi={rootPitchClass(root)}
									isHovered={hoveredIndex === index}
									onMouseEnter={(e) => {
										setHoveredIndex(index);
										createRipple(e);
									}}
									onMouseLeave={() => setHoveredIndex(null)}
								/>
								<Button
									size="sm"
									variant="outline"
									className="gap-1 rounded-none border-line-strong text-denim hover:bg-denim-tint"
									disabled={preview.isPreloading}
									onClick={(e) => {
										e.stopPropagation();
										void preview.play(pitches);
									}}
								>
									{preview.isPreloading ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<CirclePlay className="h-3 w-3" />
									)}
									{preview.isPreloading ? "Loading…" : "Play"}
								</Button>
							</div>
						</div>
					))}
				</div>
			</div>

			<ChordVoicingModal
				voicings={voicings}
				root={root}
				suffix={suffix}
				open={modalOpen}
				initialIndex={modalIndex}
				onClose={closeModal}
				preview={preview}
			/>
		</>
	);
}
