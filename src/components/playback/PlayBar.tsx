"use client";

import { useState, type Ref } from "react";
import { Bell, BellOff, GripHorizontal, GripVertical, Repeat, SlidersHorizontal, Square } from "lucide-react";
import { Button, PlayPick } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import {
	SPEED_START_MAX,
	SPEED_START_MIN,
	SPEED_START_STEP,
	SPEED_STEPS,
	speedUpLine,
	trainerBpm,
	type SpeedTrainer,
} from "@/lib/speedTrainer";
import { COUNT_INS, type CountInSetting } from "@/lib/countIn";
import type { TickLevel } from "@/lib/strumMetronome";
import type { ModuleKey } from "@/lib/moduleForPath";
import type { PlayerDock } from "@/lib/playerDock";
import { usePillDrag } from "./usePillDrag";
import MixerChannel, { type ChannelKind, type ChannelState } from "./MixerChannel";
import SubdivisionPicker from "./SubdivisionPicker";
import { TempoFields, clampTempo, type TempoProps } from "./TempoControl";
import "./playback.css";

/** The silences offered between passes, in seconds. */
export const LOOP_GAPS = [0, 2, 5, 10] as const;

const STEP_OPTIONS = SPEED_STEPS.map((n) => ({ value: String(n), label: `+${n}%` }));

/** Speed up each pass (#386): the trainer's settings, and where the run is while it plays. */
export interface SpeedUpProps {
	on: boolean;
	onOn: (on: boolean) => void;
	trainer: SpeedTrainer;
	onTrainer: (trainer: SpeedTrainer) => void;
	/** The pass under way (from 0) and its share of the tempo; null while stopped. */
	progress: { pass: number; percent: number } | null;
}

/** The wait before the first pass (`useCountIn`): its setting, and the seconds left of one under way. */
export interface CountInProps {
	setting: CountInSetting;
	onSetting: (next: CountInSetting) => void;
	remaining: number | null;
}

export interface PlayBarProps {
	/** The page's module, re-applied inside the tray it portals out. */
	module: ModuleKey;
	/** The play key, so a page shortcut can show it being pressed. */
	pickRef?: Ref<HTMLButtonElement>;
	/**
	 * Where a pass is, and the chords around it; `now` is null with no chords, and
	 * the pill then says `idle` ("Rhythm" unless given).
	 */
	status: { bar: number; bars: number; now: string | null; next: string | null; idle?: string };
	playing: boolean;
	preparing: boolean;
	canPlay: boolean;
	/** Starts (through the count-in), stops, or cancels a count-in under way. */
	onTogglePlay: () => void;
	countIn: CountInProps;
	/**
	 * Back to the start. Given, the play key pauses rather than stops and a stop key
	 * sits beside it, disabled while there is nothing to stop.
	 */
	onStop?: () => void;
	canStop?: boolean;
	tempo: TempoProps;
	tickLevel: TickLevel;
	onTickLevel: (level: TickLevel) => void;
	/** The levels the page's metronome can click; all of them when absent. */
	tickLevels?: readonly TickLevel[];
	loop: boolean;
	onLoop: (loop: boolean) => void;
	/** Seconds of silence between passes while looping. */
	loopGap: number;
	onLoopGap: (seconds: number) => void;
	/** What the page plays, and what the mix calls it. */
	sound: ChannelState;
	soundKind: Exclude<ChannelKind, "click">;
	click: ChannelState;
	/** Where the pill sits: along the bottom, or standing up the left side. */
	dock: PlayerDock;
	onDock: (dock: PlayerDock) => void;
	/** Whether there is room to move it at all; a phone keeps it at the bottom. */
	canDock: boolean;
	/** A page whose loop can speed up a pass at a time; absent, the tray has no such row. */
	speedUp?: SpeedUpProps;
}

/**
 * The transport, floating over the stage: where the pass is, loop, slower / play /
 * faster and the tempo. Everything else — the tempo in full, the metronome, the
 * mix — is in a tray that opens beside it, so the pill stays small and the page
 * under it stays the practice object. Its handle drags it between the bottom of
 * the stage and its left side (`usePillDrag`).
 */
export default function PlayBar({
	module,
	pickRef,
	status,
	playing,
	preparing,
	canPlay,
	onTogglePlay,
	countIn,
	onStop,
	canStop = false,
	tempo,
	tickLevel,
	onTickLevel,
	tickLevels,
	loop,
	onLoop,
	loopGap,
	onLoopGap,
	sound,
	soundKind,
	click,
	dock,
	onDock,
	canDock,
	speedUp,
}: PlayBarProps) {
	const [trayOpen, setTrayOpen] = useState(false);
	const { moveRef, dragging, target, handleProps } = usePillDrag(dock, onDock);
	const side = dock === "left" ? "right" : "top";
	const step = (delta: number) => tempo.onBpm(clampTempo(tempo.bpm + delta, tempo.meter));
	// While the trainer runs, the pill says the tempo this pass plays at.
	const training = speedUp?.on && speedUp.progress ? speedUp.progress : null;
	const shownBpm = training ? trainerBpm(tempo.bpm, training.percent) : tempo.bpm;
	const counting = countIn.remaining !== null;
	const { setting: countInSetting, onSetting: onCountIn } = countIn;

	return (
		<>
		{/* Where the pill will land if let go: a soft outline that pops when the landing moves. */}
		{target && <div key={target} className="pb-dock-ghost" data-dock={target} aria-hidden />}
		<div className="pb-remote" data-dock={dock}>
			<div ref={moveRef} className="pb-pill-move" data-dragging={dragging ? "" : undefined}>
			<Popover open={trayOpen} onOpenChange={setTrayOpen}>
				<PopoverAnchor asChild>
					<div className="pb-pill" role="region" aria-label="Playback" data-stop={onStop ? "" : undefined}>
						{canDock && (
							<button
								type="button"
								className="pb-pill-grip"
								aria-label={dock === "left" ? "Move the player to the bottom" : "Move the player to the left"}
								title="Drag to move the player, or click to switch sides"
								{...handleProps}
							>
								{dock === "left" ? <GripHorizontal aria-hidden /> : <GripVertical aria-hidden />}
							</button>
						)}
						{counting ? (
							<div className="pb-pill-now" role="status">
								<span className="pb-lab">Starting in</span>
								<span className="pb-bar-now pb-num">{countIn.remaining} s</span>
							</div>
						) : (
							<div className="pb-pill-now">
								<span className="pb-lab pb-num">
									Bar {status.bar} of {status.bars}
								</span>
								<span className="pb-bar-now">
									{status.now ?? status.idle ?? "Rhythm"} {status.next !== null && <small>→ {status.next}</small>}
								</span>
							</div>
						)}
						<button
							type="button"
							className="pb-icon pb-pill-loop"
							aria-pressed={loop}
							aria-label="Loop"
							title={loop && loopGap > 0 ? `Loop, ${loopGap} s between passes` : "Loop"}
							onClick={() => onLoop(!loop)}
						>
							<Repeat aria-hidden />
							{/* The gap set in the tray, worn on the button while it applies. */}
							{loop && loopGap > 0 && <span className="pb-loop-gap pb-num" aria-hidden>{loopGap}s</span>}
						</button>
						<Button variant="icon" size="xs" className="pb-pill-slower" aria-label="Slower" onClick={() => step(-1)}>
							−
						</Button>
						<PlayPick
							ref={pickRef}
							className="pb-pill-play"
							playing={playing || counting}
							size="sm"
							onClick={onTogglePlay}
							disabled={!canPlay}
							// PlayPick names itself Play / Stop; a count-in, a pausing key and the wait for samples say so instead.
							{...(counting
								? { "aria-label": "Cancel the count-in" }
								: preparing
									? { "aria-label": "Loading samples" }
									: onStop && playing
										? { "aria-label": "Pause" }
										: {})}
						/>
						<Button variant="icon" size="xs" className="pb-pill-faster" aria-label="Faster" onClick={() => step(1)}>
							+
						</Button>
						{onStop && (
							<button
								type="button"
								className="pb-icon pb-pill-stop"
								aria-label="Stop and go back to the start"
								title="Stop"
								disabled={!canStop}
								onClick={onStop}
							>
								<Square fill="currentColor" aria-hidden />
							</button>
						)}
						<button
							type="button"
							className="pb-bpm pb-num"
							aria-label={`Tempo ${shownBpm} BPM — change`}
							aria-expanded={trayOpen}
							onClick={() => setTrayOpen(true)}
						>
							{shownBpm} <span className="pb-lab">BPM</span>
							{/* The trainer, worn on the tempo while it is on: the button keeps its size. */}
							{speedUp?.on && <span className="pb-loop-gap pb-bpm-tag pb-num" aria-hidden>+{speedUp.trainer.step}%</span>}
						</button>
						<button
							type="button"
							className="pb-icon pb-pill-tray"
							aria-label="Playback settings"
							aria-expanded={trayOpen}
							onClick={() => setTrayOpen((open) => !open)}
						>
							<SlidersHorizontal aria-hidden />
						</button>
					</div>
				</PopoverAnchor>
				<PopoverContent
					side={side}
					align="center"
					sideOffset={10}
					data-m={module}
					aria-label="Playback settings"
					data-dock={dock}
					className={`pb-tray px-4.5 ${dock === "left" ? "h-(--radix-popper-anchor-height) w-[min(440px,calc(100vw-24px))] py-3.5" : "w-(--radix-popper-anchor-width) py-4 max-[719px]:w-[calc(100vw-24px)]"}`}
					// The pill is how the tray is reached; clicking it again is not "outside".
					onInteractOutside={(e) => {
						if ((e.target as Element | null)?.closest(".pb-pill")) e.preventDefault();
					}}
				>
					<div>
						<TempoFields {...tempo} />
					</div>
					{/* One row a sound, each with what shapes it: the click's subdivision
					    sits with the click's level, the gap with the loop it belongs to. */}
					<div className="pb-mix">
						<MixerChannel kind={soundKind} channel={sound} />
						<MixerChannel
							kind="click"
							channel={click}
							extra={<SubdivisionPicker meter={tempo.meter} value={tickLevel} onChange={onTickLevel} levels={tickLevels} />}
						/>
						{/* The wait before the first pass, with its cue beside it; the loop's own
						    passes are spaced by the gap below, not by this. */}
						<div className="pb-mix-row" role="group" aria-label="Count-in">
							<Switch
								checked={countInSetting.on}
								onCheckedChange={(on) => onCountIn({ ...countInSetting, on })}
								aria-label="Count in before the first pass"
							/>
							<span className="pb-mix-name">Count-in</span>
							<span className="pb-mix-extra">
								<button
									type="button"
									className="pb-icon"
									aria-pressed={countInSetting.cue}
									aria-label="Cue each second"
									title={countInSetting.cue ? "Cue each second: on" : "Cue each second: off"}
									disabled={!countInSetting.on}
									onClick={() => onCountIn({ ...countInSetting, cue: !countInSetting.cue })}
								>
									{countInSetting.cue ? <Bell aria-hidden /> : <BellOff aria-hidden />}
								</button>
							</span>
							<Slider
								value={Math.max(0, COUNT_INS.indexOf(countInSetting.seconds))}
								onChange={(i) => onCountIn({ ...countInSetting, seconds: COUNT_INS[i] ?? countInSetting.seconds })}
								label="Seconds before the first pass"
								min={0}
								max={COUNT_INS.length - 1}
								step={1}
								ticks={COUNT_INS.map((_, i) => i)}
								valueText={(i) => `${COUNT_INS[i] ?? countInSetting.seconds} seconds`}
								disabled={!countInSetting.on}
							/>
							<span className="pb-lab pb-num pb-mix-val">{countInSetting.seconds} s</span>
						</div>
						<div className="pb-mix-row" role="group" aria-label="Loop">
							<Switch checked={loop} onCheckedChange={onLoop} aria-label="Loop" />
							<span className="pb-mix-name">Loop</span>
							<span className="pb-mix-extra pb-lab">Gap between passes</span>
							<Slider
								value={Math.max(0, LOOP_GAPS.indexOf(loopGap as (typeof LOOP_GAPS)[number]))}
								onChange={(i) => onLoopGap(LOOP_GAPS[i] ?? 0)}
								label="Gap between passes"
								min={0}
								max={LOOP_GAPS.length - 1}
								step={1}
								ticks={LOOP_GAPS.map((_, i) => i)}
								valueText={(i) => `${LOOP_GAPS[i] ?? 0} seconds`}
								disabled={!loop}
							/>
							<span className="pb-lab pb-num pb-mix-val">{loopGap} s</span>
						</div>
						{speedUp && (
							<div className="pb-mix-row" role="group" aria-label="Speed up each pass">
								<Switch
									checked={speedUp.on}
									onCheckedChange={speedUp.onOn}
									aria-label="Speed up each pass"
									// A pass has to come round again to be faster.
									disabled={!loop}
								/>
								<span className="pb-mix-name">Speed up</span>
								<span className="pb-mix-extra">
									<Segmented
										options={STEP_OPTIONS}
										value={String(speedUp.trainer.step)}
										onChange={(v) => speedUp.onTrainer({ ...speedUp.trainer, step: Number(v) })}
										label="Faster by, each pass"
										dense
										disabled={!speedUp.on}
									/>
								</span>
								<Slider
									value={speedUp.trainer.start}
									onChange={(start) => speedUp.onTrainer({ ...speedUp.trainer, start })}
									label="First pass, as a share of the tempo"
									min={SPEED_START_MIN}
									max={SPEED_START_MAX}
									step={SPEED_START_STEP}
									valueText={(v) => `First pass at ${v}% of the tempo`}
									disabled={!speedUp.on}
								/>
								<span className="pb-lab pb-num pb-mix-val">{speedUp.trainer.start}%</span>
								<div className="pb-speed">
									<span className="pb-speed-meter" data-off={speedUp.on ? undefined : ""} aria-hidden>
										<i style={{ width: `${speedUp.on ? (training?.percent ?? speedUp.trainer.start) : 0}%` }} />
									</span>
									<span className="pb-lab pb-num" role="status">
										{speedUpLine(tempo.bpm, speedUp.trainer, { loop, on: speedUp.on, progress: speedUp.progress })}
									</span>
								</div>
							</div>
						)}
					</div>
					<p className="pb-lab pb-tray-hint">No sound? Check your phone&apos;s mute switch.</p>
				</PopoverContent>
			</Popover>
			</div>
		</div>
		</>
	);
}
