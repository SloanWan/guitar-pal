"use client";

import { Segmented } from "@/components/ui/segmented";
import { tickLevelGlyph, tickLevelsFor, type TickLevel } from "@/lib/strumMetronome";
import type { Meter } from "@/lib/strumMeter";

/** How often the metronome clicks: on the beat, its halves, triplets or quarters. */
export default function SubdivisionPicker({
	meter,
	value,
	onChange,
	className,
}: {
	meter: Meter;
	value: TickLevel;
	onChange: (level: TickLevel) => void;
	className?: string;
}) {
	const options = tickLevelsFor(meter).map((level) => {
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
