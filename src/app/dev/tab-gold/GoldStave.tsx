"use client";

import { useEffect, useRef } from "react";
import { Square } from "lucide-react";
import { Button, PlayPick } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import TabStaveRow from "@/components/fingerpick/TabStaveRow";
import { useDraftPlayback } from "@/components/books/panel/useDraftPlayback";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { beatUnitGlyph } from "@/lib/strumMeter";

/**
 * A reading drawn as the Tab page draws it, with a transport to hear it — the
 * same staves and playback as a chapter draft beside the book. Keyed by the
 * caller on the reading, so switching starts clean.
 */
export default function GoldStave({ pattern }: { pattern: FingerpickPattern }) {
	const playback = useDraftPlayback(pattern);
	const { engine, rows, renderContext, viewer, cursorRef, measureHighlightRef, rowRefs } = playback;

	// Once, on mount: the page was opened by a click, so the context may start now.
	// `load` is a new function every render, so it is reached through a ref.
	const loadRef = useRef(engine.load);
	useEffect(() => {
		void loadRef.current();
	}, []);

	const bars = pattern.measures.length;
	return (
		<div className="tg-stave">
			<div className="bk-trn">
				<PlayPick
					size="sm"
					playing={engine.isPlaying}
					disabled={!engine.isLoaded}
					aria-label={!engine.isLoaded ? "Loading samples" : engine.isPlaying ? "Pause" : "Play"}
					onClick={playback.playPause}
				/>
				<Button
					variant="icon"
					size="sm"
					aria-label="Stop and go back to the start"
					title="Stop"
					onClick={playback.stop}
					disabled={!engine.isPlaying && !engine.isPaused}
				>
					<Square fill="currentColor" aria-hidden />
				</Button>
				<span className="tg-meta">
					{pattern.timeSignature[0]}/{pattern.timeSignature[1]} · {beatUnitGlyph(pattern.timeSignature)} ={" "}
					{playback.patternBpm} · {bars} {bars === 1 ? "bar" : "bars"}
				</span>
				<span className="bk-grow" />
				<Stepper label="Tempo" value={playback.bpm} onChange={playback.setBpm} step={5} unit="BPM" size="sm" dense />
			</div>
			<div className="bk-staves">
				<div ref={viewer} data-tab-viewer className="bk-viewer">
					<div ref={measureHighlightRef} aria-hidden className="bk-measure-hl" />
					<div ref={cursorRef} aria-hidden className="bk-playhead" />
					<div className="bk-rows">
						{rows.map((row, rowIdx) => (
							<div
								key={row.measures[0].id}
								ref={(el) => {
									rowRefs.current[rowIdx] = el;
								}}
							>
								<TabStaveRow
									measures={row.measures}
									timeSignature={pattern.timeSignature}
									startMeasureNumber={row.startMeasureNumber}
									startMeasureIndex={row.startMeasureNumber - 1}
									measureWidths={row.widths}
									renderContext={renderContext}
								/>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
