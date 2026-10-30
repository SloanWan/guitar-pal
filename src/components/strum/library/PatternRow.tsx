"use client";

import type { CSSProperties } from "react";
import { ListRow } from "@/components/ui/list-row";
import { PickToggle } from "@/components/ui/pick-toggle";
import type { StrumPattern } from "@/lib/strumPatterns";
import { patternBpm, patternMeter } from "@/lib/strumBars";
import { beatUnitGlyph, meterLabel, metersEqual, DEFAULT_METER } from "@/lib/strumMeter";
import { patternRhythm } from "@/lib/strumRhythm";

interface Props {
	pattern: StrumPattern;
	/** Its place in the list, read as `--i` by the pop-in stagger. */
	index: number;
	selected: boolean;
	favourite: boolean;
	onSelect: () => void;
	onToggleFavourite: () => void;
}

/** "2 bars · 6/8 · ♩. 60": what the row says beside the name. Only what differs from the usual. */
export function patternRowMeta(pattern: StrumPattern): string {
	const meter = patternMeter(pattern);
	const bars = patternRhythm(pattern).length;
	return [
		...(bars > 1 ? [`${bars} bars`] : []),
		...(metersEqual(meter, DEFAULT_METER) ? [] : [meterLabel(meter)]),
		`${beatUnitGlyph(meter)} ${patternBpm(pattern)}`,
	].join(" · ");
}

/** One pattern in the library: its name over a miniature of its rhythm, and a favourite pick. */
export default function PatternRow({ pattern, index, selected, favourite, onSelect, onToggleFavourite }: Props) {
	return (
		<div className="lib-row" style={{ "--i": index } as CSSProperties}>
			<ListRow
				title={pattern.name}
				subline={
					<span className="st-mini" aria-hidden>
						{patternRhythm(pattern)
							.flat()
							.map((beat, i) => (
								<span key={i}>
									{beat.map((cell, ci) => (
										<i key={ci} data-hit={cell ? "" : undefined} />
									))}
								</span>
							))}
					</span>
				}
				trailing={<span className="st-lab st-num">{patternRowMeta(pattern)}</span>}
				selected={selected}
				onClick={onSelect}
			/>
			<PickToggle pressed={favourite} onPressedChange={onToggleFavourite} label={`Favourite ${pattern.name}`} />
		</div>
	);
}
