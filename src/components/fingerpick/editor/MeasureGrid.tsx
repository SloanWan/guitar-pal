"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { addMeasure, type Cell, type SlotTarget } from "@/lib/fingerpickEdit";
import { indexPattern } from "@/lib/fingerpickIndex";
import { patternHasChords, type FretHint } from "@/lib/fingerpickChords";
import { inSelection, type Selection } from "@/lib/tabEditorCursor";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import MeasureBlock, { type HoveredCell } from "./MeasureBlock";
import { useHasFinePointer } from "./gridShared";
import type { ChordTools } from "./useChordTools";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	cursor: Cell;
	selection: Selection | null;
	chordTools: ChordTools;
	countEighths: boolean;
	onPick: (cell: Cell, shift: boolean, take: number | null) => void;
	onColumn: (target: SlotTarget, shift: boolean) => void;
	onMenu: (cell: Cell) => void;
	onBar: (measureIndex: number) => void;
	onBlank: (measureIndex: number, slotIndex: number | null) => void;
}

/**
 * The tab as a grid of bar blocks (#362): as many to a row as fit, an Add bar
 * tile after the last. The pointer's cell is held here and handed only to its
 * bar, so a hover re-renders one block; every callback is stable for the same
 * reason. The element is the playhead's: each slot column carries `data-col`.
 */
const MeasureGrid = forwardRef<HTMLDivElement, Props>(function MeasureGrid(props, ref) {
	const { working, commit, cursor, selection, chordTools, countEighths } = props;
	const [hover, setHover] = useState<HoveredCell | null>(null);
	const finePointer = useHasFinePointer();
	const spanIndex = useMemo(() => indexPattern(working), [working]);
	const hasChords = patternHasChords(working.measures);
	const { hintsAt, chordsInEffect } = chordTools;
	const hintsByBar = useMemo<(FretHint[] | null)[][]>(
		() => working.measures.map((m, mi) => m.slots.map((_, si) => hintsAt(mi, si))),
		[working.measures, hintsAt],
	);
	const selectedByBar = useMemo(
		() =>
			working.measures.map((m, mi) =>
				m.slots.flatMap((_, si) => (inSelection(working, selection, { measureIndex: mi, slotIndex: si }) ? [si] : [])).join(","),
			),
		[working, selection],
	);

	// The page's handlers, latest each render, behind stable callbacks.
	const handlers = useRef(props);
	useEffect(() => {
		handlers.current = props;
	});
	const onPick = useCallback((cell: Cell, shift: boolean, take: number | null) => handlers.current.onPick(cell, shift, take), []);
	const onColumn = useCallback((target: SlotTarget, shift: boolean) => handlers.current.onColumn(target, shift), []);
	const onMenu = useCallback((cell: Cell) => handlers.current.onMenu(cell), []);
	const onBar = useCallback((measureIndex: number) => handlers.current.onBar(measureIndex), []);
	const onBlank = useCallback(
		(measureIndex: number, slotIndex: number | null) => handlers.current.onBlank(measureIndex, slotIndex),
		[],
	);

	return (
		<div ref={ref} className="te-grid">
			{working.measures.map((measure, measureIndex) => (
				<MeasureBlock
					key={measure.id}
					measure={measure}
					measureIndex={measureIndex}
					measureCount={working.measures.length}
					working={working}
					commit={commit}
					hover={hover?.measureIndex === measureIndex ? hover : null}
					cursor={cursor.measureIndex === measureIndex ? cursor : null}
					selected={selectedByBar[measureIndex] ?? ""}
					hints={hintsByBar[measureIndex] ?? []}
					chords={chordsInEffect[measureIndex] ?? []}
					spanIndex={spanIndex}
					hasChords={hasChords}
					countEighths={countEighths}
					finePointer={finePointer}
					chordTools={chordTools}
					onHover={setHover}
					onPick={onPick}
					onColumn={onColumn}
					onMenu={onMenu}
					onBar={onBar}
					onBlank={onBlank}
				/>
			))}
			<button
				type="button"
				className="te-mb-add"
				onClick={() => {
					commit((p) => addMeasure(p));
					onBar(working.measures.length);
				}}
			>
				<Plus aria-hidden /> Add bar
			</button>
		</div>
	);
});

export default MeasureGrid;
