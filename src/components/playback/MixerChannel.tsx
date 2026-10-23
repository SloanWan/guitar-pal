"use client";

import { Slider } from "@/components/ui/slider";

export type ChannelKind = "strum" | "click";

export interface ChannelState {
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	gain: number;
	onGainChange: (gain: number) => void;
	/** The gain at the slider's far end (the strum goes to 2×, the click to 1×). */
	max: number;
}

const NAMES: Record<ChannelKind, { label: string; noun: string }> = {
	strum: { label: "Strum", noun: "strum" },
	click: { label: "Click", noun: "metronome" },
};

function ChannelIcon({ kind, muted }: { kind: ChannelKind; muted: boolean }) {
	const body = kind === "strum" ? "M4 9.5h3.5L12 5.5v13l-4.5-4H4z" : "M9.5 3.5h5l4 17h-13z";
	const mark =
		kind === "strum" ? (muted ? "M16 9.5l5 5M21 9.5l-5 5" : "M15.5 9a4 4 0 0 1 0 6") : muted ? "M4 4l16 16" : "M12 15.5l5.5-9";
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d={body} />
			<path d={mark} />
		</svg>
	);
}

/**
 * One sound on the bar: a mute button, its name and its level. The level stays
 * where it was while muted, so un-muting brings back the same mix.
 */
export default function MixerChannel({
	kind,
	channel,
	wide = false,
}: {
	kind: ChannelKind;
	channel: ChannelState;
	/** In a sheet the slider takes the rest of the row. */
	wide?: boolean;
}) {
	const { label, noun } = NAMES[kind];
	const muted = !channel.enabled;
	const percent = Math.round((channel.gain / channel.max) * 100);
	return (
		<div className={wide ? "st-chan gap-2.5" : "st-chan"}>
			<button
				type="button"
				className="st-icon"
				data-muted={muted ? "" : undefined}
				aria-pressed={muted}
				aria-label={`Mute ${noun}`}
				title={muted ? `Unmute ${noun}` : `Mute ${noun}`}
				onClick={() => channel.onEnabledChange(muted)}
			>
				<ChannelIcon kind={kind} muted={muted} />
			</button>
			<span className={wide ? "w-13 text-sm font-semibold" : "st-lab st-chan-label"}>{label}</span>
			<Slider
				className={wide ? "flex-1" : undefined}
				value={percent}
				onChange={(v) => channel.onGainChange((v / 100) * channel.max)}
				label={`${label} volume`}
				valueText={(v) => `${v}%`}
				disabled={muted}
			/>
		</div>
	);
}
