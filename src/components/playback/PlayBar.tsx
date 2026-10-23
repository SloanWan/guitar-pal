"use client";

import { useState, type Ref } from "react";
import { Repeat, SlidersHorizontal } from "lucide-react";
import { Button, PlayPick } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { TickLevel } from "@/lib/strumMetronome";
import type { ModuleKey } from "@/lib/moduleForPath";
import MixerChannel, { type ChannelState } from "./MixerChannel";
import SubdivisionPicker from "./SubdivisionPicker";
import { TempoFields, clampTempo, type TempoProps } from "./TempoControl";

/** The silences offered between passes, in seconds. */
export const LOOP_GAPS = [0, 2, 5, 10] as const;

export interface PlayBarProps {
	/** The page's module, re-applied inside the tray it portals out. */
	module: ModuleKey;
	/** The play key, so a page shortcut can show it being pressed. */
	pickRef?: Ref<HTMLButtonElement>;
	/** Where a pass is, and the chords around it; `now` is null with no chords open. */
	status: { bar: number; bars: number; now: string | null; next: string | null };
	playing: boolean;
	preparing: boolean;
	canPlay: boolean;
	onTogglePlay: () => void;
	tempo: TempoProps;
	tickLevel: TickLevel;
	onTickLevel: (level: TickLevel) => void;
	loop: boolean;
	onLoop: (loop: boolean) => void;
	/** Seconds of silence between passes while looping. */
	loopGap: number;
	onLoopGap: (seconds: number) => void;
	strum: ChannelState;
	click: ChannelState;
}

/**
 * The transport, floating over the bottom of the stage: where the pass is, loop,
 * slower / play / faster and the tempo. Everything else — the tempo in full, the
 * metronome, the mix — is in a tray that rises above it, so the pill stays small
 * and the page under it stays the practice object.
 */
export default function PlayBar({
	module,
	pickRef,
	status,
	playing,
	preparing,
	canPlay,
	onTogglePlay,
	tempo,
	tickLevel,
	onTickLevel,
	loop,
	onLoop,
	loopGap,
	onLoopGap,
	strum,
	click,
}: PlayBarProps) {
	const [trayOpen, setTrayOpen] = useState(false);
	const step = (delta: number) => tempo.onBpm(clampTempo(tempo.bpm + delta, tempo.meter));

	return (
		<div className="st-remote">
			<Popover open={trayOpen} onOpenChange={setTrayOpen}>
				<PopoverAnchor asChild>
					<div className="st-pill" role="region" aria-label="Playback">
						<div className="st-pill-now">
							<span className="st-lab st-num">
								Bar {status.bar} of {status.bars}
							</span>
							<span className="st-bar-now">
								{status.now ?? "Rhythm"} {status.next !== null && <small>→ {status.next}</small>}
							</span>
						</div>
						<button
							type="button"
							className="st-icon st-pill-loop"
							aria-pressed={loop}
							aria-label="Loop"
							title="Loop"
							onClick={() => onLoop(!loop)}
						>
							<Repeat aria-hidden />
						</button>
						<Button variant="icon" size="xs" aria-label="Slower" onClick={() => step(-1)}>
							−
						</Button>
						<PlayPick
							ref={pickRef}
							playing={playing}
							size="sm"
							onClick={onTogglePlay}
							disabled={!canPlay}
							// PlayPick names itself Play / Stop; only the wait for samples is said instead.
							{...(preparing ? { "aria-label": "Loading samples" } : {})}
						/>
						<Button variant="icon" size="xs" aria-label="Faster" onClick={() => step(1)}>
							+
						</Button>
						<button
							type="button"
							className="st-bpm st-num"
							aria-label={`Tempo ${tempo.bpm} BPM — change`}
							aria-expanded={trayOpen}
							onClick={() => setTrayOpen(true)}
						>
							{tempo.bpm} <span className="st-lab">BPM</span>
						</button>
						<button
							type="button"
							className="st-icon"
							aria-label="Playback settings"
							aria-expanded={trayOpen}
							onClick={() => setTrayOpen((open) => !open)}
						>
							<SlidersHorizontal aria-hidden />
						</button>
					</div>
				</PopoverAnchor>
				<PopoverContent
					side="top"
					align="center"
					sideOffset={10}
					data-m={module}
					aria-label="Playback settings"
					className="st-tray w-(--radix-popper-anchor-width) px-4.5 py-4"
					// The pill is how the tray is reached; clicking it again is not "outside".
					onInteractOutside={(e) => {
						if ((e.target as Element | null)?.closest(".st-pill")) e.preventDefault();
					}}
				>
					<div>
						<TempoFields {...tempo} />
					</div>
					{/* One row a sound, each with what shapes it: the click's subdivision
					    sits with the click's level, the gap with the loop it belongs to. */}
					<div className="st-mix">
						<MixerChannel kind="strum" channel={strum} />
						<MixerChannel
							kind="click"
							channel={click}
							extra={<SubdivisionPicker meter={tempo.meter} value={tickLevel} onChange={onTickLevel} />}
						/>
						<div className="st-mix-row" role="group" aria-label="Loop">
							<Switch checked={loop} onCheckedChange={onLoop} aria-label="Loop" />
							<span className="st-mix-name">Loop</span>
							<span className="st-mix-extra st-lab">Gap between passes</span>
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
							<span className="st-lab st-num st-mix-val">{loopGap} s</span>
						</div>
					</div>
					<p className="st-lab st-tray-hint">No sound? Check your phone&apos;s mute switch.</p>
				</PopoverContent>
			</Popover>
		</div>
	);
}
