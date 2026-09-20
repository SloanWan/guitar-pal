"use client";

import { useEffect, useState } from "react";
import { chordSymbolLabel } from "@/lib/fingerpickChords";
import type { SlotTarget } from "@/lib/fingerpickEdit";
import type { Measure } from "@/lib/fingerpickTypes";
import { pick, type Lang } from "@/lib/assistant/lang";

/**
 * The chord marks of a previewed row, as chips the player can move.
 *
 * A mark the assistant placed by a beat guess is often one slot off what was
 * meant, and saying "slot 3" again is slower than putting it there. So under
 * the stave each mark is a chip sitting at its note's x, and a chip can be
 * dragged — or nudged with the arrow keys — to any other slot in the row.
 * The slots' positions are the stave's own: TabStaveRow tags every note it
 * draws with its measure and slot, and this reads those tags back, so the
 * chips line up with the notes whatever the layout did.
 */

/** A chip's home: the note under it, in the strip's own x. */
interface SlotAnchor extends SlotTarget {
	x: number;
}

const CHIP =
	"absolute top-1 -translate-x-1/2 select-none whitespace-nowrap border px-1.5 py-0.5 font-mono text-[11px] tracking-[0.04em] focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

/**
 * Read every drawn note's slot and x from the stave's tags, in slot order.
 * The x is measured from the stave box's left edge, which is the strip's
 * too: both are full-width blocks in the same scroller. Measured against the
 * stave rather than the strip because the strip is not in the DOM until it
 * has something to show, and what it shows comes from this.
 */
function readAnchors(stave: HTMLElement): SlotAnchor[] {
	const left = stave.getBoundingClientRect().left;
	const anchors: SlotAnchor[] = [];
	for (const el of stave.querySelectorAll<SVGElement>("[data-measure-index][data-slot-index]")) {
		const r = el.getBoundingClientRect();
		anchors.push({
			measureIndex: Number(el.getAttribute("data-measure-index")),
			slotIndex: Number(el.getAttribute("data-slot-index")),
			x: r.left + r.width / 2 - left,
		});
	}
	return anchors.sort((a, b) => a.measureIndex - b.measureIndex || a.slotIndex - b.slotIndex);
}

function sameAnchors(a: SlotAnchor[], b: SlotAnchor[]): boolean {
	return a.length === b.length && a.every((p, i) => p.measureIndex === b[i].measureIndex && p.slotIndex === b[i].slotIndex && p.x === b[i].x);
}

const same = (a: SlotTarget, b: SlotTarget) => a.measureIndex === b.measureIndex && a.slotIndex === b.slotIndex;
/** An anchor as the slot alone — what leaves this component. */
const slotOf = (a: SlotTarget): SlotTarget => ({ measureIndex: a.measureIndex, slotIndex: a.slotIndex });

export default function ChordDragStrip({
	measures,
	staveRef,
	onMove,
	lang = "en",
}: {
	/** The row's bars, row-local — index 0 is the first bar drawn. */
	measures: readonly Measure[];
	/** The element the stave is drawn in, whose note tags give the slots' x. */
	staveRef: React.RefObject<HTMLElement | null>;
	/** A chip dropped on another slot. Refused moves are the caller's to ignore. */
	onMove: (from: SlotTarget, to: SlotTarget) => void;
	lang?: Lang;
}) {
	const [anchors, setAnchors] = useState<SlotAnchor[]>([]);
	/** The chip in hand: where it came from, and the slot under the pointer now. */
	const [drag, setDrag] = useState<{ from: SlotTarget; over: SlotTarget } | null>(null);

	// The stave draws in its own effect, after this renders: the tags are read
	// whenever it changes, and again when the card's width does.
	useEffect(() => {
		const stave = staveRef.current;
		if (!stave) return;
		const read = () => {
			const next = readAnchors(stave);
			setAnchors((prev) => (sameAnchors(prev, next) ? prev : next));
		};
		read();
		const mutations = new MutationObserver(read);
		mutations.observe(stave, { childList: true, subtree: true, attributes: true });
		const sizes = new ResizeObserver(read);
		sizes.observe(stave);
		return () => {
			mutations.disconnect();
			sizes.disconnect();
		};
	}, [staveRef, measures]);

	const marks = anchors.filter((a) => measures[a.measureIndex]?.slots[a.slotIndex]?.chord);
	if (marks.length === 0) return null;

	const nearest = (clientX: number): SlotTarget | null => {
		const stave = staveRef.current;
		if (!stave || anchors.length === 0) return null;
		const x = clientX - stave.getBoundingClientRect().left;
		let best = anchors[0];
		for (const a of anchors) if (Math.abs(a.x - x) < Math.abs(best.x - x)) best = a;
		return { measureIndex: best.measureIndex, slotIndex: best.slotIndex };
	};

	const taken = (t: SlotTarget) => measures[t.measureIndex]?.slots[t.slotIndex]?.chord !== undefined;

	/** The slot `steps` along the row from `from`, for the keyboard. */
	const step = (from: SlotTarget, steps: number): SlotTarget | null => {
		const at = anchors.findIndex((a) => same(a, from));
		const to = anchors[at + steps];
		return to ? { measureIndex: to.measureIndex, slotIndex: to.slotIndex } : null;
	};

	return (
		<div
			className="relative h-8 border-t border-line"
			aria-label={pick(lang, "Chord marks — drag one to another slot", "和弦标记——拖到别的格")}
		>
			{/* While a chip is in hand, its landing slot is marked. */}
			{drag && (
				<span
					aria-hidden="true"
					className={`absolute top-0 h-full w-px ${taken(drag.over) && !same(drag.over, drag.from) ? "bg-destructive" : "bg-denim"}`}
					style={{ left: anchors.find((a) => same(a, drag.over))?.x ?? 0 }}
				/>
			)}
			{marks.map((mark) => {
				const chord = measures[mark.measureIndex].slots[mark.slotIndex].chord!;
				const inHand = drag !== null && same(drag.from, mark);
				const x = inHand ? (anchors.find((a) => same(a, drag.over))?.x ?? mark.x) : mark.x;
				return (
					<button
						key={`${mark.measureIndex}:${mark.slotIndex}`}
						type="button"
						aria-label={pick(
							lang,
							`${chordSymbolLabel(chord)} on bar ${mark.measureIndex + 1} slot ${mark.slotIndex + 1} — arrow keys move it`,
							`${chordSymbolLabel(chord)}，第 ${mark.measureIndex + 1} 小节第 ${mark.slotIndex + 1} 格——方向键移动`,
						)}
						style={{ left: x }}
						className={`${CHIP} cursor-grab touch-none ${
							inHand
								? "z-10 cursor-grabbing border-denim bg-denim text-on-denim"
								: "border-denim/60 bg-surface text-denim-accent transition-[left] duration-150 ease-out hover:border-denim"
						}`}
						onPointerDown={(e) => {
							// Capture keeps the moves coming once the pointer leaves the
							// chip; absent where pointer events are only simulated (jsdom).
							e.currentTarget.setPointerCapture?.(e.pointerId);
							setDrag({ from: slotOf(mark), over: slotOf(mark) });
						}}
						onPointerMove={(e) => {
							if (!drag) return;
							const over = nearest(e.clientX);
							if (over && !same(over, drag.over)) setDrag({ from: drag.from, over });
						}}
						onPointerUp={(e) => {
							e.currentTarget.releasePointerCapture?.(e.pointerId);
							if (drag && !same(drag.over, drag.from)) onMove(drag.from, drag.over);
							setDrag(null);
						}}
						onPointerCancel={() => setDrag(null)}
						onKeyDown={(e) => {
							if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
							e.preventDefault();
							const to = step(mark, e.key === "ArrowLeft" ? -1 : 1);
							if (to) onMove(slotOf(mark), to);
						}}
					>
						{chordSymbolLabel(chord)}
					</button>
				);
			})}
		</div>
	);
}
