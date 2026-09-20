"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import ChordDragStrip from "./ChordDragStrip";
import type { SlotTarget } from "@/lib/fingerpickEdit";
import type { Measure } from "@/lib/fingerpickTypes";
import type { Lang } from "@/lib/assistant/lang";

/**
 * One row of tab in a card: the same VexFlow path the fingerpick page
 * renders with, so what the player confirms is what they will see. At most
 * two bars are offered to the row; the packer takes what fits, and the
 * caller is told how many were shown so it can say how many were not.
 * Given `onMoveChord`, the chord marks become chips under the stave that
 * the player can drag to another slot.
 */

const PREVIEW_MEASURES = 2;

export default function TabStavePreview({
	measures,
	timeSignature,
	startMeasureNumber = 1,
	onShown,
	onMoveChord,
	lang,
}: {
	measures: Measure[];
	timeSignature: [number, number];
	startMeasureNumber?: number;
	/** How many bars made it onto the row, once laid out. */
	onShown?: (count: number) => void;
	/** A chord mark dragged from one slot to another, row-local measure indices. */
	onMoveChord?: (from: SlotTarget, to: SlotTarget) => void;
	lang?: Lang;
}) {
	const staveRef = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);

	// The stave is laid out to the card's real width, which is only known once
	// the card is on screen — the same rule the page follows.
	useEffect(() => {
		const el = staveRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(Math.floor(entry.contentRect.width));
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Memoised on what it is laid out from: TabStaveRow redraws its SVG when
	// the arrays it is given change identity, and the panel re-renders on its
	// own clock (the rotating placeholder). A fresh layout per render would
	// clear and redraw the stave every few seconds.
	const row = useMemo(() => layoutMeasureRows(measures.slice(0, PREVIEW_MEASURES), width, 0)[0], [measures, width]);
	const shown = row?.measures.length ?? 0;
	// Held in a ref so a new callback identity does not re-announce the count.
	const onShownRef = useRef(onShown);
	useEffect(() => {
		onShownRef.current = onShown;
	});
	useEffect(() => {
		onShownRef.current?.(shown);
	}, [shown]);

	return (
		<div className="overflow-x-auto">
			<div ref={staveRef} className="px-2 py-2" data-testid="tab-proposal-stave">
				{row && (
					<TabStaveRow
						measures={row.measures}
						timeSignature={timeSignature}
						startMeasureNumber={startMeasureNumber}
						// Row-local: tags every note with its bar and slot, which the
						// chord strip reads to place its chips.
						startMeasureIndex={0}
						measureWidths={row.widths}
					/>
				)}
			</div>
			{onMoveChord && row && (
				<ChordDragStrip measures={row.measures} staveRef={staveRef} onMove={onMoveChord} lang={lang} />
			)}
		</div>
	);
}
