"use client";

import { Segmented } from "@/components/ui/segmented";
import { tickLevelGlyph, tickLevelsFor, type TickLevel } from "@/lib/strumMetronome";
import type { Meter } from "@/lib/strumMeter";

/** How often the metronome clicks: on the beat, its halves, triplets or quarters. */
export default function SubdivisionPicker({
	meter,
	value,
	onChange,
	levels,
	className,
}: {
	meter: Meter;
	value: TickLevel;
	onChange: (level: TickLevel) => void;
	/** The levels this page's metronome can click, when it cannot click them all. */
	levels?: readonly TickLevel[];
	className?: string;
}) {
	const offered = tickLevelsFor(meter).filter((level) => !levels || levels.includes(level));
	const options = offered.map((level) => {
		const { glyph, name } = tickLevelGlyph(meter, level);
		return {
			value: level,
			label: (
				<span aria-label={name} title={name}>
					{glyph}
				</span>
			),
		};
	});
	return <Segmented options={options} value={value} onChange={onChange} label="Metronome subdivision" dense className={className} />;
}
