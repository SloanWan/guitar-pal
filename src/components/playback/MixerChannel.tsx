"use client";

import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";

export type ChannelKind = "strum" | "notes" | "click";

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
	notes: { label: "Notes", noun: "notes" },
	click: { label: "Click", noun: "metronome" },
};

function ChannelIcon({ kind, muted }: { kind: ChannelKind; muted: boolean }) {
	const sound = kind !== "click";
	const body = sound ? "M4 9.5h3.5L12 5.5v13l-4.5-4H4z" : "M9.5 3.5h5l4 17h-13z";
	const mark = sound ? (muted ? "M16 9.5l5 5M21 9.5l-5 5" : "M15.5 9a4 4 0 0 1 0 6") : muted ? "M4 4l16 16" : "M12 15.5l5.5-9";
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
			<path d={body} />
			<path d={mark} />
		</svg>
	);
}

/**
 * One sound in the playback tray, laid out as a row of the tray's grid: its mute,
 * its name, anything that shapes it (`extra` — the metronome's subdivision), its
 * level and the level as a number. The level stays where it was while muted, so
 * un-muting brings back the same mix.
 */
export default function MixerChannel({
	kind,
	channel,
	extra,
}: {
	kind: ChannelKind;
	channel: ChannelState;
	/** What else belongs to this sound, between its name and its level. */
	extra?: ReactNode;
}) {
	const { label, noun } = NAMES[kind];
	const muted = !channel.enabled;
	const percent = Math.round((channel.gain / channel.max) * 100);
	return (
		<div className="pb-mix-row" role="group" aria-label={label}>
			<button
				type="button"
				className="pb-icon"
				data-muted={muted ? "" : undefined}
				aria-pressed={muted}
				aria-label={`Mute ${noun}`}
				title={muted ? `Unmute ${noun}` : `Mute ${noun}`}
				onClick={() => channel.onEnabledChange(muted)}
			>
				<ChannelIcon kind={kind} muted={muted} />
			</button>
			<span className="pb-mix-name">{label}</span>
			<span className="pb-mix-extra">{extra}</span>
			<Slider
				value={percent}
				onChange={(v) => channel.onGainChange((v / 100) * channel.max)}
				label={`${label} volume`}
				valueText={(v) => `${v}%`}
				disabled={muted}
			/>
			<span className="pb-lab pb-num pb-mix-val">{percent}%</span>
		</div>
	);
}
