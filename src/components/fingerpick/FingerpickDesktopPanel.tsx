import { CirclePause, CirclePlay, CircleStop, Gauge, Loader2, Metronome, Play, Repeat } from "lucide-react";
import Rocker from "@/components/ui/Rocker";
import { LoopGapPicker } from "./LoopControls";
import { NoteSoundControl } from "./NoteSoundControls";
import { TempoFader, TempoResetButton, TempoSteppers } from "./TempoControls";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { MetronomeVolumeControl, SubdivisionControl } from "./MetronomeControls";
import type { PlaybackControlProps } from "./playbackControlProps";

// The right-hand controls column (md and up): transport, note sound, tempo and
// metronome, top to bottom. Hidden below md, where the drawer takes over.
export default function FingerpickDesktopPanel({
	transport,
	tempo,
	metronome,
	noteSound,
}: PlaybackControlProps) {
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

	return (
		<div className="hidden md:flex w-full border-t border-line bg-popover md:w-55 md:border-t-0 md:border-l lg:w-70 md:h-full md:shrink-0 flex-col">
			<h2 className="w-full px-5 py-4 shrink-0 border-b border-line font-mono text-[9px] font-medium uppercase tracking-[0.2em] text-denim">
				Controls
			</h2>

			<div className="flex flex-col overflow-y-auto">
				{/* TRANSPORT */}
				<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
					<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
						<span className="flex items-center gap-1.5">
							<Play size={12} strokeWidth={2} className="shrink-0" />
							Transport
						</span>
						{/* Loop toggle: on = loop the tab, off = play once */}
						<span className="flex items-center gap-1.5">
							<Repeat size={12} strokeWidth={2} className="shrink-0" />
							<Rocker
								checked={!playOnce}
								onChange={(v) => setPlayOnce(!v)}
								ariaLabel="Loop"
							/>
						</span>
					</div>
					{/* Gap between loop passes — only a question while looping. */}
					{!playOnce && (
						<div className="flex items-center gap-3">
							<span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Loop gap
							</span>
							<div className="flex-1">
								<LoopGapPicker value={loopGap} onChange={handleLoopGapChange} />
							</div>
						</div>
					)}
					<div className="flex gap-2">
						<button
							type="button"
							onClick={isLoaded ? handlePlayPause : undefined}
							disabled={!isLoaded}
							aria-label={!isLoaded ? "Loading samples" : isPlaying ? "Pause" : "Play"}
							className="flex h-13 flex-1 items-center justify-center border border-denim bg-denim text-on-denim transition-colors hover:bg-denim-accent active:bg-denim-accent disabled:pointer-events-none disabled:opacity-30"
						>
							{/* Dimmed said "not yet" but not "nearly"; the spinner does. */}
							{!isLoaded ? (
								<Loader2 size={20} strokeWidth={1.5} className="animate-spin" />
							) : isPlaying ? (
								<CirclePause size={20} strokeWidth={1.5} />
							) : (
								<CirclePlay size={20} strokeWidth={1.5} />
							)}
						</button>
						<button
							type="button"
							onClick={handleStop}
							disabled={!isPlaying && !isPaused}
							aria-label="Stop and return to start"
							className="flex h-13 flex-1 items-center justify-center border border-line-strong text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint disabled:pointer-events-none disabled:opacity-30"
						>
							<CircleStop size={20} strokeWidth={1.5} />
						</button>
					</div>
					{!isLoaded && (
						<p className="text-center font-mono text-[10px] tracking-wide text-ink-dim">
							Loading samples…
						</p>
					)}
					{/* NOTE SOUND — sits directly under the play controls */}
					<NoteSoundControl gain={noteGain} onChange={setNoteGain} />
				</div>

				{/* TEMPO */}
				<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
					<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
						<span className="flex items-center gap-1.5">
							<Gauge size={12} strokeWidth={2} className="shrink-0" />
							Tempo
						</span>
						<div className="flex items-center gap-2">
							<TempoResetButton bpm={bpm} defaultBpm={defaultBpm} onReset={handleBpmChange} />
						</div>
					</div>
					{/* BPM readout with LCD segment-ghost */}
					<div className="border border-line-strong px-0 pt-3 pb-2 text-center">
						<span className="relative inline-block font-mono text-[44px] font-bold leading-none tracking-[-0.02em] text-denim text-shadow-(--glow-readout)">
							<span
								aria-hidden="true"
								className="absolute inset-0 opacity-[0.09]"
							>
								888
							</span>
							<span className="relative">{String(bpm).padStart(3, "0")}</span>
						</span>
						<div className="mt-1.5 font-mono text-[9px] tracking-[0.28em] text-ink-faint">
							{beatUnitGlyph(timeSignature)} BPM
						</div>
					</div>
					<TempoFader
						bpm={bpm}
						onSliderChange={handleSliderChange}
						onDragStart={handleSliderPointerDown}
						onDragEnd={handleSliderPointerUp}
					/>
					{/* Steppers: −10 / −1 / TAP / +1 / +10 */}
					<TempoSteppers bpm={bpm} onChange={handleBpmChange} onTap={handleTapTempo} variant="desktop" />
				</div>

				{/* METRONOME — sits directly under Tempo. Header toggle enables the
				    metronome (with accent on beat 1, always on when enabled). */}
				<div className="flex flex-col gap-3 border-b border-line px-5 py-4">
					<div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-denim">
						<span className="flex items-center gap-1.5">
							<Metronome size={12} strokeWidth={2} className="shrink-0" />
							Metronome
						</span>
						<Rocker
							checked={metronomeEnabled}
							onChange={setMetronomeEnabled}
							ariaLabel="Metronome"
						/>
					</div>
					<MetronomeVolumeControl enabled={metronomeEnabled} gain={metronomeGain} onChange={setMetronomeGain} />
					<SubdivisionControl
						enabled={metronomeEnabled}
						value={metronomeSubdivision}
						onChange={setMetronomeSubdivision}
						timeSignature={timeSignature}
					/>
				</div>

			</div>
		</div>
	);
}
