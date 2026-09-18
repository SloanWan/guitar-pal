import { RotateCcw } from "lucide-react";
import Fader from "@/components/ui/Fader";
import type { Meter } from "@/lib/strumMeter";
import { bpmFaderMarks } from "./playbackConstants";

// The tempo controls shared by the desktop panel and the mobile drawer. Each
// renders one piece; the panels arrange them and add their own headers.

export interface TempoResetButtonProps {
	bpm: number;
	/** The pattern's own tempo. */
	defaultBpm: number;
	onReset: (bpm: number) => void;
}

export function TempoResetButton({ bpm, defaultBpm, onReset }: TempoResetButtonProps) {
	return (
		<button
			type="button"
			onClick={() => onReset(defaultBpm)}
			disabled={bpm === defaultBpm}
			aria-label="Reset tempo to default"
			title={`Reset to ${defaultBpm} BPM`}
			className="flex items-center justify-center text-ink-faint transition-colors hover:text-denim disabled:pointer-events-none disabled:opacity-30"
		>
			<RotateCcw size={12} strokeWidth={2} />
		</button>
	);
}

export interface TempoFaderProps {
	bpm: number;
	/** The pattern's meter: sets the range and the genre ticks (a 6/8 beat is a dotted quarter). */
	timeSignature: Meter;
	onSliderChange: (raw: number) => void;
	onDragStart: () => void;
	onDragEnd: () => void;
}

export function TempoFader({ bpm, timeSignature, onSliderChange, onDragStart, onDragEnd }: TempoFaderProps) {
	const marks = bpmFaderMarks(timeSignature);
	return (
		<Fader
			min={marks.min}
			max={marks.max}
			step={1}
			value={bpm}
			onValue={onSliderChange}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			ticks={marks.percents}
			tickValues={marks.values}
			tickLabels={marks.labels}
			scale={marks.scale}
			ariaLabel="Tempo in BPM"
		/>
	);
}

export interface TempoSteppersProps {
	bpm: number;
	onChange: (bpm: number) => void;
	onTap: () => void;
	/** The drawer's buttons are a touch taller; the desktop TAP underlines in denim. */
	variant: "desktop" | "mobile";
}

const STEP_DOWN = [
	{ label: "−10", delta: -10 },
	{ label: "−1", delta: -1 },
] as const;
const STEP_UP = [
	{ label: "+1", delta: 1 },
	{ label: "+10", delta: 10 },
] as const;

// Steppers: −10 / −1 / TAP / +1 / +10
export function TempoSteppers({ bpm, onChange, onTap, variant }: TempoSteppersProps) {
	const pad = variant === "desktop" ? "py-1.5" : "py-1.75";
	const buttonClass = `flex-1 border border-line-strong ${pad} font-mono text-[11px] text-ink-dim transition-colors hover:border-denim hover:text-denim active:bg-denim-tint`;
	return (
		<div className="flex flex-col">
			<div className="flex gap-2">
				{STEP_DOWN.map(({ label, delta }) => (
					<button key={label} type="button" onClick={() => onChange(bpm + delta)} className={buttonClass}>
						{label}
					</button>
				))}
				<button
					type="button"
					onClick={onTap}
					className={variant === "desktop" ? `${buttonClass} border-b-denim` : buttonClass}
				>
					TAP
				</button>
				{STEP_UP.map(({ label, delta }) => (
					<button key={label} type="button" onClick={() => onChange(bpm + delta)} className={buttonClass}>
						{label}
					</button>
				))}
			</div>
		</div>
	);
}
