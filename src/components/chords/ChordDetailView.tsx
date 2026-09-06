"use client";

import { useState, useCallback } from "react";
import { CirclePlay, Loader2, Plus, X } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordModeToggle from "@/components/chords/ChordModeToggle";
import ChordVoicingModal, { type VoicingCard } from "@/components/chords/ChordVoicingModal";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { Button } from "@/components/ui/button";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";
import ChordShapeEditor from "@/components/chords/ChordShapeEditor";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useUser } from "@/hooks/useUser";
import {
	chordShapeToVoicing,
	emptyChordShape,
	suggestFingers,
	validateChordShape,
	type ChordShape,
} from "@/lib/chordShape";
import { userVoicingId, type UserChordVoicing } from "@/lib/userChordVoicings";
import { chordVoicingToVexChords } from "@/lib/chordVoicingToVexChords";

// Re-exported so existing importers (the chord detail route) keep their import path.
export type { VoicingCard };

interface Props {
	voicings: VoicingCard[];
	root?: string;
	suffix?: string;
}

export default function ChordDetailView({ voicings, root, suffix }: Props) {
	const [mode, setMode] = useState<DiagramMode>("fingers");

	// The player's own shapes for this chord, written here because this is the
	// page someone is on when they are thinking about a chord's shapes.
	const { user, loading: userLoading } = useUser();
	const { voicings: userVoicings, saveVoicing, deleteVoicing } = useUserChordVoicings(
		user,
		userLoading,
	);
	const [shapeDraft, setShapeDraft] = useState<ChordShape | null>(null);
	const [shapeName, setShapeName] = useState("");

	const myShapes = userVoicings.filter((v) => v.root === root && v.suffix === suffix);

	function openShapeEditor() {
		// From nothing here, since this page has no "currently selected" shape to
		// borrow; the picker inside the strum editor starts from the one on screen.
		const blank = emptyChordShape();
		setShapeDraft({ ...blank, fingers: suggestFingers(blank) });
		setShapeName("");
	}

	function saveShape() {
		if (!shapeDraft || !root || !suffix) return;
		if (!validateChordShape(shapeDraft).ok) return;
		const voicing: UserChordVoicing = {
			...chordShapeToVoicing(shapeDraft, userVoicingId(crypto.randomUUID()), shapeName.trim() || null),
			root,
			suffix,
		};
		saveVoicing(voicing);
		setShapeDraft(null);
		setShapeName("");
	}
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

	return (
		<>
			<div className="flex flex-col items-center gap-6">
				{voicings.length === 0 ? (
					// Not an early return any more: a chord the library has no shape for
					// is exactly when a player wants to write their own.
					<p className="text-sm text-ink-dim">No voicings found.</p>
				) : (
					<ChordModeToggle mode={mode} onChange={setMode} />
				)}
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

				{root && suffix && (
					<section className="flex w-full flex-col items-center gap-3 border-t border-line pt-6">
						<div className="flex items-center gap-3">
							<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								My shapes
							</span>
							{shapeDraft === null && (
								<button
									type="button"
									onClick={openShapeEditor}
									className="flex h-(--h-control) items-center gap-1 border border-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:bg-denim hover:text-on-denim"
								>
									<Plus size={12} />
									New shape
								</button>
							)}
						</div>

						{myShapes.length > 0 && (
							<div className="flex flex-wrap justify-center gap-4">
								{myShapes.map((v) => (
									<div key={v.id} className="flex flex-col items-center gap-1">
										<ChordDiagram
											def={chordVoicingToVexChords(v)}
											label={v.label ?? "Mine"}
											mode={mode}
											rootMidi={rootPitchClass(root)}
										/>
										<button
											type="button"
											onClick={() => deleteVoicing(v.id)}
											aria-label={`Delete ${v.label ?? "this shape"}`}
											className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-destructive"
										>
											<X size={10} />
											Delete
										</button>
									</div>
								))}
							</div>
						)}

						{shapeDraft !== null && (
							<div className="flex w-full max-w-md flex-col gap-3 border border-line-strong p-3">
								<input
									type="text"
									value={shapeName}
									onChange={(e) => setShapeName(e.target.value)}
									placeholder="Name it (optional)"
									aria-label="Name for this shape"
									className="h-(--h-control) w-full border border-line-strong bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
								/>
								<ChordShapeEditor shape={shapeDraft} onChange={setShapeDraft} />
								<div className="flex gap-2">
									<button
										type="button"
										onClick={saveShape}
										disabled={!validateChordShape(shapeDraft).ok}
										className="flex h-(--h-control) items-center border border-denim px-3 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-colors hover:bg-denim hover:text-on-denim disabled:cursor-not-allowed disabled:opacity-30"
									>
										Save shape
									</button>
									<button
										type="button"
										onClick={() => setShapeDraft(null)}
										className="flex h-(--h-control) items-center border border-line-strong px-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-dim transition-colors hover:border-denim hover:text-denim-accent"
									>
										Cancel
									</button>
								</div>
							</div>
						)}
					</section>
				)}
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
