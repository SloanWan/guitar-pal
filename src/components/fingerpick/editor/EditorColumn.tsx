"use client";

import type { CSSProperties } from "react";
import { STRING_LABELS, type Cell } from "@/lib/fingerpickEdit";
import type { BeatSlot } from "@/lib/fingerpickTypes";
import type { StaveColumn } from "@/components/fingerpick/TabStaveRow";

interface Props {
	column: StaveColumn;
	slot: BeatSlot | undefined;
	/** The cursor's string when it is on this slot, else null. */
	cursorString: number | null;
	selected: boolean;
	/** The count under the slot ("1", "+", "e"…), as the grid always wrote it. */
	count: string;
	onPick: (cell: Cell, shift: boolean) => void;
}

/** What a string holds at a slot, for its button's name and the status line. */
export function noteText(slot: BeatSlot | undefined, stringIndex: number): string {
	const sf = slot?.strings[stringIndex];
	if (!sf) return "empty";
	if (sf.muted) return "x";
	return sf.fret === null ? "empty" : `fret ${sf.fret}`;
}

/**
 * One slot's column over the stave: the selection's and the cursor's wash, the
 * cursor's ring on its string, and a button per string that puts the cursor
 * there (Shift extends the run). The buttons keep focus on the tab, so its
 * keys keep working; they are not in the tab order — the tab itself is.
 */
export default function EditorColumn({ column, slot, cursorString, selected, count, onPick }: Props) {
	const gap = column.lineYs[1] - column.lineYs[0];
	const style = {
		"--te-top": `${column.lineYs[0] - gap / 2}px`,
		"--te-gap": `${gap}px`,
		"--te-x": `${column.noteX - column.left}px`,
	} as CSSProperties;
	const on = cursorString !== null;
	// A slot with nothing struck draws nothing on the stave: the editor marks where it is.
	const empty = !!slot && !slot.isRest && !slot.strings.some((sf) => sf.fret !== null || sf.muted);
	return (
		<div className="te-col" style={style} data-cur={on ? "" : undefined} data-sel={selected ? "" : undefined}>
			{(on || selected) && <span className="te-col-wash" aria-hidden />}
			{empty && <span className="te-empty" aria-hidden />}
			{count && (
				<span className="te-count" aria-hidden data-beat={/^\d+$/.test(count) ? "" : undefined}>
					{count}
				</span>
			)}
			{column.lineYs.map((_, stringIndex) => (
				<button
					key={stringIndex}
					type="button"
					tabIndex={-1}
					className="te-hit"
					style={{ top: `calc(var(--te-top) + ${stringIndex} * var(--te-gap))` }}
					data-cur={cursorString === stringIndex ? "" : undefined}
					aria-label={`Bar ${column.measureIndex + 1}, slot ${column.slotIndex + 1}, ${STRING_LABELS[stringIndex]} string: ${noteText(slot, stringIndex)}`}
					onMouseDown={(e) => e.preventDefault()}
					onClick={(e) =>
						onPick({ measureIndex: column.measureIndex, slotIndex: column.slotIndex, stringIndex }, e.shiftKey)
					}
				/>
			))}
		</div>
	);
}
