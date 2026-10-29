"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { STRING_LABELS, type Cell } from "@/lib/fingerpickEdit";
import type { FretHint } from "@/lib/fingerpickChords";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	ALL_FRETS,
	PAGE_COUNT,
	dockLabel,
	dockRow,
	fretButtonName,
	fretsOnPage,
	inlayDots,
	pageForFret,
	swipePage,
	type DockLabelStyle,
} from "@/lib/fretboardDock";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";

interface Props {
	pattern: FingerpickPattern;
	cursor: Cell;
	capo: number;
	/** The shape's frets at the cursor's slot, shown faint; null with no chord. */
	hints: readonly FretHint[] | null;
	/** A phone: five frets at a time, paged by swipe or the arrows. */
	paged: boolean;
	labels: DockLabelStyle;
	onLabels: (style: DockLabelStyle) => void;
	autoAdvance: boolean;
	onAutoAdvance: (on: boolean) => void;
	open: boolean;
	onOpen: (open: boolean) => void;
	/**
	 * A fret clicked on a string; Shift for an x. `pointer` is a mouse or a finger
	 * (not Enter on a focused fret): focus then goes back to the tab, so its keys go on working.
	 */
	onHit: (stringIndex: number, fret: number, shift: boolean, pointer: boolean) => void;
}

const LABEL_OPTIONS = [
	{ value: "fret", label: "Fret" },
	{ value: "name", label: "Name" },
	{ value: "jianpu", label: "简谱" },
] as const;

/**
 * The fretboard docked at the editor's foot (#359): six strings by frets 0–24
 * (five at a time on a phone). A click writes that fret at the cursor's slot on
 * that string and moves the cursor there; the fret already written clears;
 * Shift-click writes an x. The shape of the chord in effect shows as faint hints.
 * Every fret is a button, so the neck is reachable by keyboard too.
 */
export default function FretboardDock({
	pattern,
	cursor,
	capo,
	hints,
	paged,
	labels,
	onLabels,
	autoAdvance,
	onAutoAdvance,
	open,
	onOpen,
	onHit,
}: Props) {
	// A phone's page follows the cursor's note, and the player's own swipes in between.
	const cursorFret = pattern.measures[cursor.measureIndex]?.slots[cursor.slotIndex]?.strings[cursor.stringIndex]?.fret;
	const [chosen, setChosen] = useState<{ page: number; for: string } | null>(null);
	const at = `${cursor.measureIndex}:${cursor.slotIndex}:${cursor.stringIndex}:${cursorFret ?? ""}`;
	const page = chosen && chosen.for === at ? chosen.page : pageForFret(cursorFret ?? 0);
	const turn = (next: number) => setChosen({ page: Math.max(0, Math.min(PAGE_COUNT - 1, next)), for: at });
	const frets = paged ? fretsOnPage(page) : ALL_FRETS;

	const swipeFrom = useRef<number | null>(null);

	return (
		<section className="te-dock" aria-label="Fretboard" data-open={open ? "" : undefined}>
			<div className="te-dock-head">
				<span className="te-dock-title">Fretboard</span>
				<span className="te-dock-hint te-mid-up">Click a fret to write it at the cursor · Shift-click for an x</span>
				<span className="tb-grow" />
				{paged && open && (
					<span className="te-pager">
						<button type="button" className="pb-icon" aria-label="Lower frets" disabled={page === 0} onClick={() => turn(page - 1)}>
							<ChevronLeft aria-hidden />
						</button>
						<span className="te-pdots" role="img" aria-label={`Frets ${frets[0]}–${frets[frets.length - 1]}`}>
							{Array.from({ length: PAGE_COUNT }, (_, i) => (
								<i key={i} data-on={i === page ? "" : undefined} />
							))}
						</span>
						<button
							type="button"
							className="pb-icon"
							aria-label="Higher frets"
							disabled={page === PAGE_COUNT - 1}
							onClick={() => turn(page + 1)}
						>
							<ChevronRight aria-hidden />
						</button>
					</span>
				)}
				<Segmented
					label="Fretboard labels"
					options={LABEL_OPTIONS}
					value={labels}
					onChange={onLabels}
					dense
					className="te-mid-up"
				/>
				<Switch checked={autoAdvance} onCheckedChange={onAutoAdvance} label="Auto-advance" />
				<button
					type="button"
					className="pb-icon te-dock-fold"
					aria-label={open ? "Fold the fretboard" : "Show the fretboard"}
					aria-expanded={open}
					onClick={() => onOpen(!open)}
				>
					<ChevronDown aria-hidden />
				</button>
			</div>
			{open && (
				<div
					className="te-neck"
					data-paged={paged ? "" : undefined}
					onPointerDown={(e) => {
						if (paged) swipeFrom.current = e.clientX;
					}}
					onPointerUp={(e) => {
						if (swipeFrom.current === null) return;
						const next = swipePage(page, e.clientX - swipeFrom.current);
						swipeFrom.current = null;
						if (next !== page) turn(next);
					}}
					onPointerCancel={() => {
						swipeFrom.current = null;
					}}
				>
					<div className="te-frow" aria-hidden>
						<span className="te-sname" />
						{frets.map((f) => (
							<span key={f} className="te-fn" data-open={f === 0 ? "" : undefined}>
								{f}
							</span>
						))}
					</div>
					{STRING_LABELS.map((name, stringIndex) => {
						const row = dockRow(pattern, cursor, stringIndex, hints);
						return (
							<div key={name} className="te-nrow" data-on={stringIndex === cursor.stringIndex ? "" : undefined}>
								<span className="te-sname" aria-hidden>
									{name}
								</span>
								{frets.map((fret) => {
									const written = row.written === fret ? "note" : row.written === "x" && fret === 0 ? "x" : null;
									const hint = row.hint === fret;
									const text = dockLabel(stringIndex, fret, capo, labels);
									return (
										<button
											key={fret}
											type="button"
											className="te-fc"
											data-open={fret === 0 ? "" : undefined}
											data-note={written ? "" : undefined}
											data-hint={!written && hint ? "" : undefined}
											aria-label={fretButtonName(stringIndex, fret, written, hint)}
											aria-pressed={written === "note"}
											onMouseDown={(e) => e.preventDefault()}
											onClick={(e) => onHit(stringIndex, fret, e.shiftKey, e.detail > 0)}
										>
											{written === "x" ? <span>x</span> : written || hint ? <span>{text}</span> : labels !== "fret" ? <span data-faint="">{text}</span> : null}
										</button>
									);
								})}
							</div>
						);
					})}
					<div className="te-inl" aria-hidden>
						<span className="te-sname" />
						{frets.map((f) => (
							<span key={f} className="te-il" data-open={f === 0 ? "" : undefined}>
								{Array.from({ length: inlayDots(f) }, (_, i) => (
									<i key={i} />
								))}
							</span>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
