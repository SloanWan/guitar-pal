"use client";

import type { ReactNode, Ref, RefObject } from "react";
import type { ChordLabel, RenderContext } from "@/lib/fingerpickToVexFlow";
import TabStaveRow, { type EditableStave } from "@/components/fingerpick/TabStaveRow";
import type { MeasureRow } from "@/components/fingerpick/fingerpickLayout";
import type { SectionBand } from "@/components/fingerpick/sectionSelection";

interface Props {
	rows: MeasureRow[];
	timeSignature: [number, number];
	renderContext: RenderContext;
	chordDiagram?: (label: ChordLabel & { measureIndex: number }) => ReactNode;
	chordDiagramSize: { width: number; height: number };
	offShapeAt?: (measureIndex: number, slotIndex: number) => readonly number[];
	pitchLabel?: (stringIndex: number, fret: number, shift?: number) => string;
	/** The box the overlays are placed in, measured for the row layout. */
	viewerRef: Ref<HTMLDivElement>;
	/** The rows' container, watched for the staves (re)drawing. */
	rowsRef: RefObject<HTMLDivElement | null>;
	rowRefs: RefObject<(HTMLDivElement | null)[]>;
	cursorRef: RefObject<HTMLDivElement | null>;
	highlightRef: RefObject<HTMLDivElement | null>;
	/** The chosen section, one band a row; empty outside section mode. */
	bands: readonly SectionBand[];
	onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
	/** The editor's surface over every slot (#360); the reader passes none. */
	editable?: EditableStave;
}

/**
 * The tab itself: a card of stave rows, with what playback draws over them — the
 * section's bands, the playing measure's highlight and the playhead. The overlays
 * sit above the staves (they are translucent, and above the fret numbers' halos);
 * a click on the tab seeks, or picks a measure in section mode.
 */
export default function TabSheet({
	rows,
	timeSignature,
	renderContext,
	chordDiagram,
	chordDiagramSize,
	offShapeAt,
	pitchLabel,
	viewerRef,
	rowsRef,
	rowRefs,
	cursorRef,
	highlightRef,
	bands,
	onClick,
	editable,
}: Props) {
	return (
		<section className="tb-sheet" aria-label="Tab">
			<div ref={viewerRef} className="tb-viewer" data-tab-viewer onClick={onClick}>
				{bands.map((band) => (
					<div
						key={band.rowIndex}
						aria-hidden
						data-section-row={band.rowIndex}
						data-start={band.startsSection ? "" : undefined}
						data-end={band.endsSection ? "" : undefined}
						className="tb-band"
						style={{ left: band.left, top: band.top, width: band.width, height: band.height }}
					/>
				))}
				<div ref={highlightRef} aria-hidden className="tb-measure-hl" />
				<div ref={cursorRef} aria-hidden className="tb-playhead" />
				<div ref={rowsRef} className="tb-rows">
					{rows.map((row, rowIdx) => (
						<div
							key={row.measures[0].id}
							ref={(el) => {
								rowRefs.current[rowIdx] = el;
							}}
						>
							<TabStaveRow
								measures={row.measures}
								timeSignature={timeSignature}
								startMeasureNumber={row.startMeasureNumber}
								startMeasureIndex={row.startMeasureNumber - 1}
								measureWidths={row.widths}
								chordDiagram={chordDiagram}
								chordDiagramSize={chordDiagramSize}
								offShapeStrings={offShapeAt}
								pitchLabel={pitchLabel}
								renderContext={renderContext}
								editable={editable}
							/>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
