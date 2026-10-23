"use client";

interface Props {
	/** Beats in the bar on screen. */
	beats: number;
	/** Clicks per beat at the metronome's level. */
	ticksPerBeat: number;
	/** The click sounding now, counted from the bar's first; null while stopped. */
	active: number | null;
}

/** The metronome as a row of dots: a larger one on each beat, the current click lit. */
export default function BeatPulse({ beats, ticksPerBeat, active }: Props) {
	const count = Math.max(1, beats) * Math.max(1, ticksPerBeat);
	return (
		<div className="st-pulse" aria-hidden>
			{Array.from({ length: count }, (_, i) => (
				<i
					key={i}
					data-beat={i % ticksPerBeat === 0 ? "" : undefined}
					data-on={active === i ? "" : undefined}
				/>
			))}
		</div>
	);
}
