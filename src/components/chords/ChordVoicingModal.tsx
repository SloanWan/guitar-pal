"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CirclePlay, CirclePause, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordModeToggle from "@/components/chords/ChordModeToggle";
import { Button } from "@/components/ui/button";
import MusicalText from "@/components/MusicalText";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { VoicingCard } from "@/lib/chordCards";
import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";
import type { ChordPreview } from "@/components/chords/useChordPreview";

// Re-exported so the components that render this modal import one symbol, not two.
export type { VoicingCard };

interface Props {
	voicings: readonly VoicingCard[];
	root?: string;
	suffix?: string;
	open: boolean;
	/** Voicing to show when the modal opens; paging from there is internal. */
	initialIndex?: number;
	onClose: () => void;
	/** Shared audio context — see useChordPreview. */
	preview: ChordPreview;
}

// Full-screen voicing browser: one large diagram at a time, paged with the arrow
// buttons, ←/→ keys or a horizontal swipe. Used both by the single-chord detail page
// and by the multi-chord grid, so it owns no data fetching and no audio context.
//
// Kept mounted at all times and toggled via opacity/pointer-events so the open and
// close transitions can run; that also means the paging state has to be reset on open
// rather than on mount.
export default function ChordVoicingModal({
	voicings,
	root,
	suffix,
	open,
	initialIndex = 0,
	onClose,
	preview,
}: Props) {
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	const [mode, setMode] = useState<DiagramMode>("fingers");
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);

	// Paging resets each time the modal opens, not on mount — it stays mounted between
	// openings so the transition can run. Adjusted during render rather than in an
	// effect, which would queue a second render pass with the stale voicing showing.
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setActiveIndex(initialIndex);
			setMode("fingers");
		}
	}

	// Guards the render against a voicing list that shrank while the modal was open.
	const safeIndex = Math.min(activeIndex, Math.max(voicings.length - 1, 0));
	const activeVoicing = voicings[safeIndex];

	const goPrev = useCallback(() => setActiveIndex((i) => Math.max(i - 1, 0)), []);
	const goNext = useCallback(
		() => setActiveIndex((i) => Math.min(i + 1, voicings.length - 1)),
		[voicings.length],
	);

	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
	}, []);

	const handleTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			if (!touchStartRef.current) return;
			const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
			const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
			touchStartRef.current = null;
			if (Math.abs(dx) > 50 && Math.abs(dy) < 30) {
				if (dx < 0) goNext();
				else goPrev();
			}
		},
		[goNext, goPrev],
	);

	const { play } = preview;
	useEffect(() => {
		if (!open || !activeVoicing) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") goPrev();
			else if (e.key === "ArrowRight") goNext();
			else if (e.key === "Escape") onClose();
			else if (e.key === " ") {
				e.preventDefault();
				void play(activeVoicing.pitches);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, goPrev, goNext, onClose, play, activeVoicing]);

	if (!activeVoicing) return null;

	return (
		<div
			className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 transition-opacity duration-200 ${
				open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
			}`}
			onClick={onClose}
		>
			<div
				className={`relative bg-popover border border-line-strong p-6 flex flex-col items-center gap-4 max-w-xl w-full mx-4 transition-all duration-200 ${
					open ? "opacity-100 scale-100" : "opacity-0 scale-95"
				}`}
				onClick={(e) => e.stopPropagation()}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<button
					onClick={onClose}
					className="absolute top-4 right-4 text-ink-faint hover:text-ink transition-colors"
					aria-label="Close"
				>
					<X className="h-5 w-5" />
				</button>

				<div className="flex flex-col items-center gap-1">
					<h2 className="text-xl font-semibold text-denim">
						{root && <MusicalText text={root} />}
						{suffix && (
							<>
								{" "}
								<MusicalText text={suffix} />
							</>
						)}
					</h2>
					<p className="text-sm text-ink-dim">{activeVoicing.label}</p>
				</div>

				<div className="relative flex items-center justify-center w-full px-10 sm:px-14">
					<button
						onClick={goPrev}
						disabled={safeIndex === 0}
						className="absolute left-0 top-1/2 -translate-y-1/2 p-1 sm:p-2 rounded-none border border-line-strong text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						aria-label="Previous voicing"
					>
						<ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
					</button>
					<ChordDiagram
						def={activeVoicing.def}
						label={activeVoicing.label}
						size="large"
						mode={mode}
						rootMidi={rootPitchClass(root)}
					/>
					<button
						onClick={goNext}
						disabled={safeIndex === voicings.length - 1}
						className="absolute right-0 top-1/2 -translate-y-1/2 p-1 sm:p-2 rounded-none border border-line-strong text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
						aria-label="Next voicing"
					>
						<ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
					</button>
				</div>

				<span className="text-sm text-ink-dim">
					{safeIndex + 1} / {voicings.length}
				</span>

				<ChordModeToggle mode={mode} onChange={setMode} />

				<Button
					size="sm"
					variant="outline"
					className="gap-1 rounded-none border-line-strong text-denim hover:bg-denim-tint"
					disabled={preview.isPreloading}
					onClick={() => void play(activeVoicing.pitches)}
				>
					{preview.isPreloading ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : preview.isPlaying ? (
						<CirclePause className="h-3 w-3" />
					) : (
						<CirclePlay className="h-3 w-3" />
					)}
					{preview.isPreloading ? "Loading…" : preview.isPlaying ? "Playing" : "Play"}
				</Button>
			</div>
		</div>
	);
}
