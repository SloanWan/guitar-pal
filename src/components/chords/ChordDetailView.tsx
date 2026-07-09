"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CirclePlay, CirclePause, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import ChordDiagram from "@/components/chords/ChordDiagram";
import { Button } from "@/components/ui/button";
import MusicalText from "@/components/MusicalText";
import type { VexChordDef } from "@/lib/chordVoicingToVexChords";
import type { DiagramMode } from "@/components/chords/ChordDiagramSVG";
import {
	preloadFingerpickPresets,
	triggerChordPreview,
	CHORD_PREVIEW_DURATION_S,
	SOURCE_STOP_BUFFER_S,
} from "@/components/strum/useGuitarSampleLoader";

const ROOT_PC: Record<string, number> = {
	C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3,
	E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
	A: 9, "A#": 10, Bb: 10, B: 11,
};

const MODES: DiagramMode[] = ["fingers", "noteNames", "fretboard"];
const MODE_LABELS: Record<DiagramMode, string> = {
	fingers: "123",
	noteNames: "ABC",
	fretboard: "Grid",
};

export interface VoicingCard {
	id: string;
	label: string;
	def: VexChordDef;
	pitches: readonly number[];
}

interface Props {
	voicings: VoicingCard[];
	root?: string;
	suffix?: string;
}

export default function ChordDetailView({ voicings, root, suffix }: Props) {
	const [mode, setMode] = useState<DiagramMode>("fingers");
	const rootMidi = root !== undefined ? ROOT_PC[root] : undefined;

	const [modalOpen, setModalOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [modalMode, setModalMode] = useState<DiagramMode>("fingers");
	const [isPlaying, setIsPlaying] = useState(false);

	const ctxRef = useRef<AudioContext | null>(null);
	const preloadRef = useRef<Promise<void> | null>(null);
	const [isPreloading, setIsPreloading] = useState(false);
	const playingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const activeVoicing = voicings[activeIndex];

	useEffect(() => {
		return () => {
			ctxRef.current?.close().catch(() => undefined);
			if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
		};
	}, []);

	const handlePlay = useCallback(async (pitches: readonly number[]) => {
		if (!ctxRef.current) {
			ctxRef.current = new AudioContext();
			setIsPreloading(true);
			preloadRef.current = preloadFingerpickPresets(ctxRef.current).finally(() => {
				setIsPreloading(false);
			});
		}
		if (ctxRef.current.state === "suspended") {
			await ctxRef.current.resume();
		}
		await preloadRef.current;

		if (playingTimerRef.current !== null) clearTimeout(playingTimerRef.current);
		setIsPlaying(true);
		triggerChordPreview(pitches, ctxRef.current, ctxRef.current.destination, ctxRef.current.currentTime);
		playingTimerRef.current = setTimeout(() => {
			setIsPlaying(false);
			playingTimerRef.current = null;
		}, (CHORD_PREVIEW_DURATION_S + SOURCE_STOP_BUFFER_S) * 1000);
	}, []);

	const openModal = useCallback((index: number) => {
		setActiveIndex(index);
		setModalMode("fingers");
		setModalOpen(true);
	}, []);

	const closeModal = useCallback(() => setModalOpen(false), []);

	const goPrev = useCallback(() => setActiveIndex(i => Math.max(i - 1, 0)), []);
	const goNext = useCallback(
		() => setActiveIndex(i => Math.min(i + 1, voicings.length - 1)),
		[voicings.length],
	);

	useEffect(() => {
		if (!modalOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "ArrowLeft") goPrev();
			else if (e.key === "ArrowRight") goNext();
			else if (e.key === "Escape") closeModal();
			else if (e.key === " ") {
				e.preventDefault();
				void handlePlay(activeVoicing.pitches);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [modalOpen, goPrev, goNext, closeModal, handlePlay, activeVoicing]);

	const handleRipple = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		const card = e.currentTarget;
		const rect = card.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const size = Math.max(rect.width, rect.height);

		const ripple = document.createElement("div");
		ripple.style.cssText = [
			"position:absolute",
			`left:${x}px`,
			`top:${y}px`,
			`width:${size}px`,
			`height:${size}px`,
			`margin-left:${-size / 2}px`,
			`margin-top:${-size / 2}px`,
			"border-radius:50%",
			"background:var(--color-denim-tint)",
			"animation:ripple-expand 600ms ease-out forwards",
			"pointer-events:none",
			"z-index:0",
		].join(";");
		ripple.addEventListener("animationend", () => ripple.remove());
		card.appendChild(ripple);
	}, []);

	if (voicings.length === 0) {
		return <p className="text-sm text-muted-foreground">No voicings found.</p>;
	}

	return (
		<>
			<style>{`@keyframes ripple-expand { from { transform: scale(0); opacity: 0.15; } to { transform: scale(2.5); opacity: 0; } }`}</style>

			<div className="flex flex-col items-center gap-6">
				<div className="relative inline-flex overflow-hidden rounded-full border border-denim-border bg-denim-tint">
					<div
						className="absolute top-0 h-full rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
						style={{
							width: "33.333%",
							transform: `translateX(${MODES.indexOf(mode) * 100}%)`,
						}}
					/>
					{MODES.map((m) => (
						<button
							key={m}
							onClick={() => setMode(m)}
							className={`relative z-10 px-5 py-2 text-sm font-medium text-center transition-colors duration-200 ${
								mode === m ? "text-denim" : "text-denim-light"
							}`}
						>
							{MODE_LABELS[m]}
						</button>
					))}
				</div>
				<div className="flex flex-wrap justify-center gap-4">
					{voicings.map(({ id, label, def, pitches }, index) => (
						<div
							key={id}
							className="relative overflow-hidden flex flex-col items-center gap-2 cursor-pointer"
							onMouseEnter={handleRipple}
							onClick={() => openModal(index)}
						>
							<div className="relative z-10 flex flex-col items-center gap-2">
								<ChordDiagram def={def} label={label} mode={mode} rootMidi={rootMidi} />
								<Button
									size="sm"
									variant="outline"
									className="gap-1 border-denim-border text-denim hover:bg-denim-tint"
									disabled={isPreloading}
									onClick={(e) => {
										e.stopPropagation();
										void handlePlay(pitches);
									}}
								>
									{isPreloading ? (
										<Loader2 className="h-3 w-3 animate-spin" />
									) : (
										<CirclePlay className="h-3 w-3" />
									)}
									{isPreloading ? "Loading…" : "Play"}
								</Button>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Modal — always mounted, toggled via opacity/pointer-events */}
			<div
				className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40 transition-opacity duration-200 ${
					modalOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
				}`}
				onClick={closeModal}
			>
				<div
					className={`relative bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center gap-4 max-w-xl w-full mx-4 transition-all duration-200 ${
						modalOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						onClick={closeModal}
						className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
						aria-label="Close"
					>
						<X className="h-5 w-5" />
					</button>

					<div className="flex flex-col items-center gap-1">
						<h2 className="text-xl font-semibold text-denim">
							{root && <MusicalText text={root} />}
							{suffix && <> <MusicalText text={suffix} /></>}
						</h2>
						<p className="text-sm text-muted-foreground">{activeVoicing.label}</p>
					</div>

					<div className="relative flex items-center justify-center w-full">
						<button
							onClick={goPrev}
							disabled={activeIndex === 0}
							className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-full border border-denim-border text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
							aria-label="Previous voicing"
						>
							<ChevronLeft className="h-5 w-5" />
						</button>
						<ChordDiagram
							def={activeVoicing.def}
							label={activeVoicing.label}
							size="large"
							mode={modalMode}
							rootMidi={rootMidi}
						/>
						<button
							onClick={goNext}
							disabled={activeIndex === voicings.length - 1}
							className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-full border border-denim-border text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
							aria-label="Next voicing"
						>
							<ChevronRight className="h-5 w-5" />
						</button>
					</div>

					<span className="text-sm text-muted-foreground">
						{activeIndex + 1} / {voicings.length}
					</span>

					<div className="relative inline-flex overflow-hidden rounded-full border border-denim-border bg-denim-tint">
						<div
							className="absolute top-0 h-full rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
							style={{
								width: "33.333%",
								transform: `translateX(${MODES.indexOf(modalMode) * 100}%)`,
							}}
						/>
						{MODES.map((m) => (
							<button
								key={m}
								onClick={() => setModalMode(m)}
								className={`relative z-10 px-5 py-2 text-sm font-medium text-center transition-colors duration-200 ${
									modalMode === m ? "text-denim" : "text-denim-light"
								}`}
							>
								{MODE_LABELS[m]}
							</button>
						))}
					</div>

					<Button
						size="sm"
						variant="outline"
						className="gap-1 border-denim-border text-denim hover:bg-denim-tint"
						disabled={isPreloading}
						onClick={() => void handlePlay(activeVoicing.pitches)}
					>
						{isPreloading ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : isPlaying ? (
							<CirclePause className="h-3 w-3" />
						) : (
							<CirclePlay className="h-3 w-3" />
						)}
						{isPreloading ? "Loading…" : isPlaying ? "Playing" : "Play"}
					</Button>
				</div>
			</div>
		</>
	);
}
