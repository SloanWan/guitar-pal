import Fader from "@/components/ui/Fader";
import Segmented from "./Segmented";
import { isCompound, type Meter } from "@/lib/strumMeter";
import type { MetronomeSubdivision } from "./useFingerpickAudioEngine";

// The metronome controls shared by the desktop panel and the mobile drawer.
// Both dim (but keep) their controls while the metronome is off.

export interface MetronomeVolumeControlProps {
	enabled: boolean;
	gain: number;
	onChange: (gain: number) => void;
}

export function MetronomeVolumeControl({ enabled, gain, onChange }: MetronomeVolumeControlProps) {
	return (
		<div className={!enabled ? "opacity-40" : ""}>
			<div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
				<span>Metronome vol.</span>
				<span className="tabular-nums">{Math.round(gain * 100)}%</span>
			</div>
			<Fader
				min={0}
				max={1}
				step={0.01}
				value={gain}
				onValue={(v) => {
					onChange(v);
					navigator.vibrate?.(10);
				}}
				ticks={[0, 25, 50, 75, 100]}
				tickValues={[0, 0.25, 0.5, 0.75, 1]}
				scale={["0", "50", "100"]}
				disabled={!enabled}
				ariaLabel="Metronome volume"
			/>
		</div>
	);
}

export interface SubdivisionControlProps {
	enabled: boolean;
	value: MetronomeSubdivision;
	onChange: (value: MetronomeSubdivision) => void;
	/** The pattern's meter: names each level by the note it clicks (the beat is 3/8 in 6/8). */
	timeSignature: Meter;
}

export function SubdivisionControl({ enabled, value, onChange, timeSignature }: SubdivisionControlProps) {
	const compound = isCompound(timeSignature);
	return (
		<div className={!enabled ? "opacity-40" : ""}>
			<div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
				Subdivision
			</div>
			<Segmented
				options={[
					{ value: "beat", label: compound ? "3/8" : "1/4" },
					{ value: "division", label: "1/8" },
					{ value: "subdivision", label: "1/16" },
				]}
				value={value}
				onChange={(v) => onChange(v as MetronomeSubdivision)}
				disabled={!enabled}
			/>
		</div>
	);
}
