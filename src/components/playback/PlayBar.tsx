"use client";

import { useState } from "react";
import { Repeat, SlidersHorizontal, X } from "lucide-react";
import { Button, PlayPick } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet } from "@/components/ui/sheet";
import type { TickLevel } from "@/lib/strumMetronome";
import type { ModuleKey } from "@/lib/moduleForPath";
import MixerChannel, { type ChannelState } from "./MixerChannel";
import SubdivisionPicker from "./SubdivisionPicker";
import TempoControl, { TempoFields, clampTempo, useTapTempo, type TempoProps } from "./TempoControl";

export interface PlayBarProps {
	/** The page's module, re-applied inside the sheet and popover it portals out. */
	module: ModuleKey;
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
	strum: ChannelState;
	click: ChannelState;
}

function NowNext({ status, compact }: { status: PlayBarProps["status"]; compact?: boolean }) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<span className="st-lab st-num">{compact ? `Bar ${status.bar}/${status.bars}` : `Bar ${status.bar} of ${status.bars}`}</span>
			{status.now !== null && (
				<span className={compact ? "st-bar-now text-lg" : "st-bar-now"}>
					{status.now} {status.next !== null && <small>→ {status.next}</small>}
				</span>
			)}
		</div>
	);
}

/**
 * The bar under the page: what is playing, the transport with its tempo, and the
 * mix. The play key sits in the middle; on a phone the settings fold into a sheet.
 */
export default function PlayBar({
	module,
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
	strum,
	click,
}: PlayBarProps) {
	const [sheetOpen, setSheetOpen] = useState(false);
	const [hintDismissed, setHintDismissed] = useState(false);
	const step = (delta: number) => tempo.onBpm(clampTempo(tempo.bpm + delta, tempo.meter));
	const tap = useTapTempo((bpm) => tempo.onBpm(clampTempo(bpm, tempo.meter)));
	const play = (size: "md" | "sm") => (
		<PlayPick
			playing={playing}
			size={size}
			onClick={onTogglePlay}
			disabled={!canPlay}
			// PlayPick names itself Play / Stop; only the wait for samples is said instead.
			{...(preparing ? { "aria-label": "Loading samples" } : {})}
		/>
	);

	return (
		<div className="st-bar" role="region" aria-label="Playback">
			<div className="st-bar-wide">
				<div className="flex min-w-0 items-center gap-3.5">
					<NowNext status={status} />
					<SubdivisionPicker meter={tempo.meter} value={tickLevel} onChange={onTickLevel} className="st-subd-wide" />
				</div>
				<div className="flex flex-col items-center gap-0.5">
					<div className="st-transport">
						<button type="button" className="st-icon" aria-pressed={loop} aria-label="Loop" title="Loop" onClick={() => onLoop(!loop)}>
							<Repeat aria-hidden />
						</button>
						<Button variant="icon" size="xs" aria-label="Slower" onClick={() => step(-1)}>
							−
						</Button>
						{play("md")}
						<Button variant="icon" size="xs" aria-label="Faster" onClick={() => step(1)}>
							+
						</Button>
						<Button variant="secondary" size="xs" onClick={tap} aria-label="Tap the tempo">
							Tap
						</Button>
					</div>
					<TempoControl {...tempo} module={module} />
				</div>
				<div className="flex flex-col items-end">
					<MixerChannel kind="strum" channel={strum} />
					<MixerChannel kind="click" channel={click} />
				</div>
			</div>

			{!hintDismissed && (
				<p className="st-mute-hint">
					No sound? Check your phone&apos;s mute switch.
					<button type="button" className="st-icon size-7" onClick={() => setHintDismissed(true)} aria-label="Dismiss hint">
						<X aria-hidden />
					</button>
				</p>
			)}
			<div className="st-bar-phone">
				<div className="min-w-0 flex-1">
					<NowNext status={status} compact />
				</div>
				<div className="flex flex-col items-center">
					<div className="flex items-center gap-2">
						<Button variant="icon" size="xs" aria-label="Slower" onClick={() => step(-1)}>
							−
						</Button>
						{play("sm")}
						<Button variant="icon" size="xs" aria-label="Faster" onClick={() => step(1)}>
							+
						</Button>
					</div>
					<span className="st-num text-xs font-bold">
						{tempo.bpm} <span className="st-lab">BPM</span>
					</span>
				</div>
				<div className="flex flex-1 justify-end">
					<Button variant="icon" size="xs" aria-label="Playback settings" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>
						<SlidersHorizontal aria-hidden />
					</Button>
				</div>
			</div>

			<Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Playback">
				<div className="flex flex-col gap-4 pb-2" data-m={module}>
					<TempoFields {...tempo} />
					<div className="flex items-center justify-between">
						<span className="text-[15px] font-semibold">Metronome</span>
						<SubdivisionPicker meter={tempo.meter} value={tickLevel} onChange={onTickLevel} />
					</div>
					<Switch checked={loop} onCheckedChange={onLoop} label="Loop" />
					<div className="flex flex-col gap-1">
						<MixerChannel kind="strum" channel={strum} wide />
						<MixerChannel kind="click" channel={click} wide />
					</div>
				</div>
			</Sheet>
		</div>
	);
}
