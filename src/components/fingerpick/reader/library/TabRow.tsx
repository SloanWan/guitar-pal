"use client";

import type { CSSProperties } from "react";
import { ListRow } from "@/components/ui/list-row";
import { Pick } from "@/components/ui/pick";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { patternCapo } from "@/lib/fingerpickChords";
import { beatUnitGlyph, meterLabel, metersEqual, DEFAULT_METER } from "@/lib/strumMeter";

interface Props {
	pattern: FingerpickPattern;
	/** Its place in the list, read as `--i` by the pop-in stagger. */
	index: number;
	selected: boolean;
	favourite: boolean;
	onSelect: () => void;
	onToggleFavourite: () => void;
}

/** "8 bars · 3/4 · ♩ 100 · Capo 2": what the row says beside the name. Only what differs from the usual. */
export function tabRowMeta(pattern: FingerpickPattern): string {
	const bars = pattern.measures.length;
	const capo = patternCapo(pattern);
	return [
		`${bars} bar${bars === 1 ? "" : "s"}`,
		...(metersEqual(pattern.timeSignature, DEFAULT_METER) ? [] : [meterLabel(pattern.timeSignature)]),
		`${beatUnitGlyph(pattern.timeSignature)} ${pattern.bpm}`,
		...(capo > 0 ? [`Capo ${capo}`] : []),
	].join(" · ");
}

/** One tab in the library: its name and what it is, and a favourite pick. */
export default function TabRow({ pattern, index, selected, favourite, onSelect, onToggleFavourite }: Props) {
	return (
		<div className="lib-row" style={{ "--i": index } as CSSProperties}>
			<ListRow
				title={pattern.name}
				subline={<span className="pb-lab pb-num">{tabRowMeta(pattern)}</span>}
				selected={selected}
				onClick={onSelect}
			/>
			<button
				type="button"
				className="lib-fav"
				aria-pressed={favourite}
				aria-label={`Favourite ${pattern.name}`}
				onClick={onToggleFavourite}
			>
				<Pick />
			</button>
		</div>
	);
}
