"use client";

import { useEffect, useRef, useState } from "react";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { layoutMeasureRows } from "@/components/fingerpick/fingerpickLayout";
import type { Measure } from "@/lib/fingerpickTypes";

/**
 * One row of tab in a card: the same VexFlow path the fingerpick page
 * renders with, so what the player confirms is what they will see. At most
 * two bars are offered to the row; the packer takes what fits, and the
 * caller is told how many were shown so it can say how many were not.
 */

const PREVIEW_MEASURES = 2;

export default function TabStavePreview({
	measures,
	timeSignature,
	startMeasureNumber = 1,
	onShown,
}: {
	measures: Measure[];
	timeSignature: [number, number];
	startMeasureNumber?: number;
	/** How many bars made it onto the row, once laid out. */
	onShown?: (count: number) => void;
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

	const row = layoutMeasureRows(measures.slice(0, PREVIEW_MEASURES), width, 0)[0];
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
		<div ref={staveRef} className="overflow-x-auto px-2 py-2" data-testid="tab-proposal-stave">
			{row && (
				<TabStaveRow
					measures={row.measures}
					timeSignature={timeSignature}
					startMeasureNumber={startMeasureNumber}
					measureWidths={row.widths}
				/>
			)}
		</div>
	);
}
