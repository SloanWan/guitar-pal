import { useRef, useState } from "react";
import { ChevronUp, CirclePause, CirclePlay, CircleStop, Gauge, Loader2, Metronome, Repeat } from "lucide-react";
import { LoopGapPicker } from "./LoopControls";
import { NoteSoundControl } from "./NoteSoundControls";
import { TempoFader, TempoResetButton, TempoSteppers } from "./TempoControls";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { MetronomeVolumeControl, SubdivisionControl } from "./MetronomeControls";
import { bpmFaderMarks } from "./playbackConstants";
import type { PlaybackControlProps } from "./playbackControlProps";

type SheetDetent = "closed" | "half" | "full";

// Bottom-sheet detent (Google-Maps style): "closed" shows only the bottom bar,
// "half" is the default open height, "full" is the tall/expanded height. The
// drawer handle steps between detents; dragging up expands, dragging down closes.
function useSheetGesture() {
	const [sheetDetent, setSheetDetent] = useState<SheetDetent>("closed");
	// Bottom bar drag-to-open-sheet gesture refs.
	const bottomBarDragStartYRef = useRef<number>(0);
	const bottomBarIsDraggingRef = useRef<boolean>(false);
	// Drag handle drag-to-close gesture refs.
	const handleDragStartYRef = useRef(0);
	const handleIsDraggingRef = useRef(false);

	// Step one detent up (closed → half → full) on drag-up / expand gestures.
	function expandSheet() {
		setSheetDetent((d) => (d === "closed" ? "half" : "full"));
	}

	// Step one detent down (full → half → closed) on drag-down / collapse gestures.
	function collapseSheet() {
		setSheetDetent((d) => (d === "full" ? "half" : "closed"));
	}

	function handleBottomBarPointerDown(e: React.PointerEvent) {
		if ((e.target as HTMLElement).closest("button, input")) return;
		bottomBarDragStartYRef.current = e.clientY;
		bottomBarIsDraggingRef.current = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleBottomBarPointerMove(e: React.PointerEvent) {
		if (!bottomBarIsDraggingRef.current) return;
		if (e.clientY - bottomBarDragStartYRef.current < -40) {
			bottomBarIsDraggingRef.current = false;
			expandSheet();
		}
	}

	function handleBottomBarPointerUp() {
		bottomBarIsDraggingRef.current = false;
	}

	return {
		sheetDetent,
		setSheetDetent,
		showSheet: sheetDetent !== "closed",
		expandSheet,
		collapseSheet,
		handleDragStartYRef,
		handleIsDraggingRef,
		handleBottomBarPointerDown,
		handleBottomBarPointerMove,
		handleBottomBarPointerUp,
	};
}

export type FingerpickMobileDrawerProps = PlaybackControlProps;

// The unified mobile drawer (below md): an always-visible bottom bar (BPM,
// loop, metronome, play/stop) with an expandable controls panel above it, plus
// the BPM slider popover the bar's BPM readout opens.
export default function FingerpickMobileDrawer({
	transport,
	tempo,
	metronome,
	noteSound,
}: FingerpickMobileDrawerProps) {
	const {
		isLoaded,
		isPlaying,
		isPaused,
		playOnce,
		setPlayOnce,
		loopGap,
		onLoopGapChange: handleLoopGapChange,
		onPlayPause: handlePlayPause,
		onStop: handleStop,
	} = transport;
	const {
		bpm,
		timeSignature: tempoMeter,
		defaultBpm,
		onBpmChange: handleBpmChange,
		onSliderChange: handleSliderChange,
		onSliderPointerDown: handleSliderPointerDown,
		onSliderPointerUp: handleSliderPointerUp,
		onTapTempo: handleTapTempo,
	} = tempo;
	const {
		enabled: metronomeEnabled,
		setEnabled: setMetronomeEnabled,
		gain: metronomeGain,
		setGain: setMetronomeGain,
		subdivision: metronomeSubdivision,
		setSubdivision: setMetronomeSubdivision,
		timeSignature,
	} = metronome;
	const { gain: noteGain, setGain: setNoteGain } = noteSound;

	const {
		sheetDetent,
		setSheetDetent,
		showSheet,
		expandSheet,
		collapseSheet,
		handleDragStartYRef,
		handleIsDraggingRef,
		handleBottomBarPointerDown,
		handleBottomBarPointerMove,
		handleBottomBarPointerUp,
	} = useSheetGesture();
	const [showBpmPopover, setShowBpmPopover] = useState(false);
	const [bpmPopoverPos, setBpmPopoverPos] = useState<{ bottom: number; left: number }>({
		bottom: 0,
		left: 0,
	});
	const bpmButtonRef = useRef<HTMLButtonElement>(null);

	return (
		<>
		{/* BPM vertical slider popover — fixed so it escapes the drawer's overflow context */}
		{showBpmPopover && (
			<div
				className="md:hidden fixed z-60 bg-popover border border-line px-4 py-4 flex items-center justify-center -translate-x-1/2"
				style={{ bottom: bpmPopoverPos.bottom, left: bpmPopoverPos.left }}
			>
				<input
					type="range"
					min={bpmFaderMarks(tempoMeter).min}
					max={bpmFaderMarks(tempoMeter).max}
					value={bpm}
					onChange={(e) => handleSliderChange(Number(e.target.value))}
					onPointerDown={handleSliderPointerDown}
					onPointerUp={handleSliderPointerUp}
					style={
						{
							writingMode: "vertical-lr",
							direction: "rtl",
							height: 120,
						} as React.CSSProperties
					}
					className="accent-denim cursor-pointer"
				/>
			</div>
		)}

		{/* Backdrop — intercepts taps outside the drawer to close it without triggering tab seek */}
		{showSheet && (
			<div className="md:hidden fixed inset-0 z-20" onClick={() => setSheetDetent("closed")} />
		)}

		{/* ── Unified mobile drawer ────────────────────────────────────────── */}
		<div
			className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-popover border-t border-line-strong overflow-hidden"
			onPointerDown={(e) => {
				if (!bpmButtonRef.current?.contains(e.target as Node)) {
					setShowBpmPopover(false);
				}
			}}
		>
			{/* Expandable controls panel — max-height transition reveals/hides content */}
			<div
				className={`bg-popover overflow-hidden transition-[max-height] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] ${
					sheetDetent === "full"
						? "max-h-[calc(85vh-56px)] overflow-y-auto"
						: sheetDetent === "half"
							? "max-h-[calc(33.333vh-56px)] overflow-y-auto"
							: "max-h-0"
				}`}
			>
				<div
					className="flex justify-center pt-2.5 pb-1 shrink-0"
					style={{ touchAction: "none" }}
					onPointerDown={(e) => {
						handleDragStartYRef.current = e.clientY;
						handleIsDraggingRef.current = true;
						e.currentTarget.setPointerCapture(e.pointerId);
					}}
					onPointerMove={(e) => {
						if (!handleIsDraggingRef.current) return;
						const dy = e.clientY - handleDragStartYRef.current;
						if (dy < -40) {
							// Drag up → expand a detent.
							handleIsDraggingRef.current = false;
							expandSheet();
						} else if (dy > 40) {
							// Drag down → collapse a detent (full → half → closed).
							handleIsDraggingRef.current = false;
							collapseSheet();
						}
					}}
					onPointerUp={() => {
						handleIsDraggingRef.current = false;
					}}
				>
					<div className="w-9 h-1 bg-line-strong" />
				</div>
				<div className="flex flex-col gap-5 px-5 py-4 pb-6">
					{/* Loop gap — only a question while looping (the bar's loop toggle). */}
					{!playOnce && (
						<div className="flex flex-col gap-3">
							<div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
								<Repeat size={12} strokeWidth={2} className="shrink-0" />
								Loop gap
							</div>
							<LoopGapPicker value={loopGap} onChange={handleLoopGapChange} />
						</div>
					)}
					{/* Tempo — steppers + fader */}
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
							<span className="flex items-center gap-1.5">
								<Gauge size={12} strokeWidth={2} className="shrink-0" />
								Tempo
							</span>
							<div className="flex items-center gap-2">
								<span className="tabular-nums text-denim">{bpm}</span>
								<TempoResetButton bpm={bpm} defaultBpm={defaultBpm} onReset={handleBpmChange} />
							</div>
						</div>
						<TempoSteppers bpm={bpm} onChange={handleBpmChange} onTap={handleTapTempo} variant="mobile" />
						<TempoFader
							bpm={bpm}
							timeSignature={tempoMeter}
							onSliderChange={handleSliderChange}
							onDragStart={handleSliderPointerDown}
							onDragEnd={handleSliderPointerUp}
						/>
					</div>

					{/* Note Sound volume */}
					<NoteSoundControl gain={noteGain} onChange={setNoteGain} />

					<div className="border-t border-line" />

					{/* Subdivision */}
					<SubdivisionControl
						enabled={metronomeEnabled}
						value={metronomeSubdivision}
						onChange={setMetronomeSubdivision}
						timeSignature={timeSignature}
					/>

					{/* Metronome volume */}
					<MetronomeVolumeControl enabled={metronomeEnabled} gain={metronomeGain} onChange={setMetronomeGain} />

				</div>
			</div>

			<div className="border-t border-line" />

			{/* Always-visible bottom bar */}
			<div
				className="relative bg-popover flex items-center gap-1.5 px-3 py-2"
				onPointerDown={handleBottomBarPointerDown}
				onPointerMove={handleBottomBarPointerMove}
				onPointerUp={handleBottomBarPointerUp}
			>
				{/* BPM display — tap to open vertical slider popover */}
				<div className="relative shrink-0">
					<button
						ref={bpmButtonRef}
						onClick={() => {
							const rect = bpmButtonRef.current?.getBoundingClientRect();
							if (rect) {
								setBpmPopoverPos({
									bottom: window.innerHeight - rect.top + 8,
									left: rect.left + rect.width / 2,
								});
							}
							setShowBpmPopover((v) => !v);
						}}
						className="flex w-14 flex-col items-center text-center leading-none"
					>
						<span className="font-mono text-[24px] font-bold leading-none text-denim">
							{bpm}
						</span>
						<span className="mt-0.75 font-mono text-[8px] uppercase tracking-[0.24em] text-ink-faint">
							{beatUnitGlyph(timeSignature)} BPM
						</span>
					</button>
				</div>

				{/* Loop icon toggle: on = loop the tab, off = play once */}
				<button
					onClick={() => setPlayOnce(!playOnce)}
					aria-label="Loop"
					aria-pressed={!playOnce}
					className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${
						!playOnce
							? "border-denim text-denim"
							: "border-line-strong text-ink-faint"
					}`}
				>
					<Repeat size={18} />
				</button>

				{/* Metronome icon toggle */}
				<button
					onClick={() => setMetronomeEnabled(!metronomeEnabled)}
					aria-label="Metronome"
					aria-pressed={metronomeEnabled}
					className={`flex h-9 w-9 shrink-0 items-center justify-center border transition-colors ${
						metronomeEnabled
							? "border-denim text-denim"
							: "border-line-strong text-ink-faint"
					}`}
				>
					<Metronome size={18} />
				</button>

				{/* Chevron — centered in the bar; toggles the controls panel open/closed */}
				<button
					onClick={() => setSheetDetent((d) => (d === "closed" ? "half" : "closed"))}
					aria-label={showSheet ? "Close controls" : "Open controls"}
					className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5 text-ink-faint hover:text-ink transition-colors duration-150"
				>
					<ChevronUp
						size={20}
						className={`transition-transform duration-300 ${showSheet ? "rotate-180" : ""}`}
					/>
				</button>

				{/* Stop + Play/Pause — flush right */}
				<div className="ml-auto flex items-center gap-0.5 shrink-0">
					<button
						onClick={handleStop}
						className={`p-1 text-ink-dim transition-colors duration-150 ${
							isPlaying || isPaused ? "visible" : "invisible"
						}`}
					>
						<CircleStop size={28} strokeWidth={1.5} />
					</button>
					<div
						onClick={isLoaded ? handlePlayPause : undefined}
						className={`flex h-11 w-11 items-center justify-center rounded-none bg-denim text-on-denim transition-all duration-150 active:scale-95 ${
							isLoaded ? "cursor-pointer" : "opacity-30 pointer-events-none"
						}`}
					>
						{!isLoaded ? (
							<Loader2 size={22} strokeWidth={1.5} className="animate-spin" />
						) : isPlaying ? (
							<CirclePause size={22} strokeWidth={1.5} />
						) : (
							<CirclePlay size={22} strokeWidth={1.5} />
						)}
					</div>
				</div>
			</div>
		</div>
		</>
	);
}
