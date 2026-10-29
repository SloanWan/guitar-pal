"use client";

import { memo, useState } from "react";
import { CornerDownLeft, Plus, X as XIcon } from "lucide-react";
import type { BeatSlot, FingerpickPattern, Measure } from "@/lib/fingerpickTypes";
import {
	STRING_LABELS,
	TRIPLET_GROUP_SIZE,
	computeBeatGroups,
	computeBeatLabels,
	computeSubBeatGroups,
	isTripletDuration,
	tripletGroups,
	tripletWrittenValue,
	type Cell,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { spanCovers, type PatternIndex } from "@/lib/fingerpickIndex";
import { chordSymbolLabel, clearString, replaceRowWithHints, rowDiffersFromHints, type FretHint } from "@/lib/fingerpickChords";
import { techniqueDef } from "@/lib/techniqueRegistry";
import type { ChordRef } from "@/lib/strumPatterns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import InspectorChord from "./InspectorChord";
import MeasureFooter from "./MeasureFooter";
import MeasureHeader from "./MeasureHeader";
import { DURATION_ABBREV, cellDisplay, cellGlyph, sweepWashBg } from "./gridShared";
import type { ChordTools } from "./useChordTools";

/** The cell under the pointer; -1 on an axis when the pointer is on a row's label or a column's foot. */
export interface HoveredCell {
	measureIndex: number;
	slotIndex: number;
	stringIndex: number;
}

/** What a string holds at a slot, for its cell's name and the status line. */
export function noteText(slot: BeatSlot | undefined, stringIndex: number): string {
	const sf = slot?.strings[stringIndex];
	if (!sf) return "empty";
	if (sf.muted) return "x";
	return sf.fret === null ? "empty" : `fret ${sf.fret}`;
}

export interface MeasureBlockProps {
	measure: Measure;
	measureIndex: number;
	measureCount: number;
	working: FingerpickPattern;
	commit: CommitPattern;
	/** The pointer, when it is over this bar. */
	hover: HoveredCell | null;
	/** The cursor, when it is in this bar. */
	cursor: Cell | null;
	/** The selected slots of this bar, as "0,1,2" (a string, so an unchanged run keeps the block memoized). */
	selected: string;
	/** The shape's frets under each slot of this bar (null where no chord, or its shapes not here yet). */
	hints: readonly (FretHint[] | null)[];
	/** The chord in effect at each slot of this bar. */
	chords: readonly (ChordRef | null)[];
	spanIndex: PatternIndex;
	hasChords: boolean;
	countEighths: boolean;
	/** The pointer hovers: hints and the row controls wait for it. */
	finePointer: boolean;
	chordTools: ChordTools;
	onHover: (cell: HoveredCell | null) => void;
	/** A cell clicked: the cursor there (Shift: the run to there); `take` is the shape's fret it offered. */
	onPick: (cell: Cell, shift: boolean, take: number | null) => void;
	/** A column's square: the slot selected, for the Slot tools. */
	onColumn: (target: SlotTarget, shift: boolean) => void;
	/** A cell's context menu: the note's techniques. */
	onMenu: (cell: Cell) => void;
	/** The cursor to a bar a copy or a move landed on. */
	onBar: (measureIndex: number) => void;
}

const WASH_TIE = "color-mix(in srgb, var(--gp-m-500) 55%, transparent)";

/**
 * One bar of the grid editor (#362, the old modal's grid on the page): its
 * header, a row a string and a column a slot — the beat under the pointer
 * washed, its column and row tinted to a cross, the chord shape's fret offered
 * in an empty cell (a click takes it), a row's clear and snap-to-shape at its
 * ends, the chord row's symbols and a + to add one — then the bar's note
 * values, columns' squares, counts and its footer. The cells keep focus on the
 * tab, whose keys edit at the cursor.
 */
function MeasureBlock({
	measure,
	measureIndex,
	measureCount,
	working,
	commit,
	hover,
	cursor,
	selected,
	hints,
	chords,
	spanIndex,
	hasChords,
	countEighths,
	finePointer,
	chordTools,
	onHover,
	onPick,
	onColumn,
	onMenu,
	onBar,
}: MeasureBlockProps) {
	const [quickChordAt, setQuickChordAt] = useState<number | null>(null);
	const [nudge, setNudge] = useState<"left" | "right" | null>(null);
	const ts = working.timeSignature;
	const selectedSet = new Set(selected ? selected.split(",").map(Number) : []);
	const beatLabels = computeBeatLabels(measure.slots, ts, countEighths ? "eighths" : "beats");
	const beatGroups = computeBeatGroups(measure.slots, ts);
	// Where each slot sits under a `3` bracket: drawn column by column (left cap,
	// the "3", right cap), and every column of a bar with a bracket gets the row so
	// the rows beneath stay level.
	const bracketRole = new Map<number, "start" | "mid" | "end">();
	for (const g of tripletGroups(measure.slots)) {
		bracketRole.set(g.start, "start");
		bracketRole.set(g.start + 1, "mid");
		bracketRole.set(g.start + TRIPLET_GROUP_SIZE - 1, "end");
	}
	// The hovered slot's binary-parent window (two sixteenths under a split eighth,
	// two 32nds under a sixteenth …), washed between the beat and the cross — only
	// when it holds more than one slot.
	const subBeat: ReadonlySet<number> = (() => {
		if (!hover || hover.slotIndex < 0) return new Set<number>();
		const group = computeSubBeatGroups(measure.slots, ts).find((g) => g.includes(hover.slotIndex));
		return group && group.length > 1 ? new Set(group) : new Set<number>();
	})();
	const hintFor = (si: number) => hints[si] ?? null;
	const hoverColumn = (slotIndex: number) => onHover({ measureIndex, slotIndex, stringIndex: -1 });

	return (
		<div
			data-measure-id={measure.id}
			className="te-mb"
			data-cur={cursor ? "" : undefined}
			data-nudge={nudge ?? undefined}
			onAnimationEnd={() => setNudge(null)}
			onMouseLeave={() => onHover(null)}
		>
			<MeasureHeader
				measure={measure}
				measureIndex={measureIndex}
				measureCount={measureCount}
				commit={commit}
				hasChords={hasChords}
				hints={hints}
				onBar={onBar}
				onNudge={setNudge}
			/>
			<div className="te-mb-body">
				{/* The string names, each row's clear at its left. On a screen without
				    hover the clear is simply there for a row with something in it. */}
				<div className="te-mb-side">
					<div className="te-mb-chordrow" />
					{STRING_LABELS.map((label, stringIndex) => {
						const rowHovered = !finePointer || hover?.stringIndex === stringIndex;
						const rowHasNotes = measure.slots.some(
							(slot) => slot.strings[stringIndex].fret !== null || slot.strings[stringIndex].muted,
						);
						return (
							<div
								key={stringIndex}
								className="te-mb-name"
								data-on={hover?.stringIndex === stringIndex ? "" : undefined}
								onMouseEnter={() => onHover({ measureIndex, slotIndex: -1, stringIndex })}
							>
								{rowHasNotes && (
									<button
										type="button"
										className="te-mb-clear"
										data-shown={rowHovered ? "" : undefined}
										tabIndex={rowHovered ? 0 : -1}
										aria-hidden={!rowHovered}
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => commit((p) => clearString(p, stringIndex, measureIndex))}
										aria-label={`Clear the ${label} string in measure ${measureIndex + 1}`}
										title={`Clear the ${label} string in this bar`}
									>
										<XIcon aria-hidden />
									</button>
								)}
								{label}
							</div>
						);
					})}
				</div>

				<div className="te-mb-scroll">
					<div className="te-mb-beats">
						{beatGroups.map((group, groupIndex) => (
							<div
								key={groupIndex}
								className="te-mb-beat"
								data-on={hover && group.includes(hover.slotIndex) ? "" : undefined}
								style={{ flexGrow: group.length }}
							>
								{group.map((slotIndex) => {
									const slot = measure.slots[slotIndex];
									const target: SlotTarget = { measureIndex, slotIndex };
									const isRest = !!slot.isRest;
									const own = slot.chord;
									const shown = own ?? (slotIndex === 0 ? (chords[0] ?? undefined) : undefined);
									const chordOpen = quickChordAt === slotIndex;
									// The symbol is always there; the + only under a hovering
									// pointer — a + on every column of a touch screen is clutter.
									const offered = chordOpen || shown !== undefined || (finePointer && hover?.slotIndex === slotIndex);
									const role = bracketRole.get(slotIndex);
									return (
										<div
											key={slot.id}
											className="te-mb-col"
											data-col={`${measureIndex}:${slotIndex}`}
											data-rest={isRest ? "" : undefined}
											data-sub={subBeat.has(slotIndex) ? "" : undefined}
											data-sel={selectedSet.has(slotIndex) ? "" : undefined}
										>
											<div className="te-mb-chordrow">
												{offered && (
													<Popover open={chordOpen} onOpenChange={(next) => setQuickChordAt(next ? slotIndex : null)}>
														<PopoverTrigger
															className={shown ? "te-mb-chord" : "te-mb-addchord"}
															data-own={own ? "" : undefined}
															data-open={chordOpen ? "" : undefined}
															aria-label={
																shown
																	? `${chordSymbolLabel(shown)} at bar ${measureIndex + 1} slot ${slotIndex + 1}`
																	: `Add a chord at bar ${measureIndex + 1} slot ${slotIndex + 1}`
															}
															title={own ? "Chord changes here" : shown ? "Chord running on from an earlier bar" : "Add a chord here"}
														>
															{shown ? chordSymbolLabel(shown) : <Plus aria-hidden />}
														</PopoverTrigger>
														<PopoverContent
															align="start"
															sideOffset={6}
															className="te-quickchord"
															data-m="tab"
															// Typing in the chord search must not reach the tab's keys.
															onKeyDown={(e) => e.stopPropagation()}
															// The search blurs its field once a chord is picked; that is not leaving.
															onFocusOutside={(e) => e.preventDefault()}
														>
															<InspectorChord working={working} commit={commit} slots={[target]} tools={chordTools} />
														</PopoverContent>
													</Popover>
												)}
											</div>
											{STRING_LABELS.map((label, stringIndex) => {
												const cell: Cell = { measureIndex, slotIndex, stringIndex };
												const sf = slot.strings[stringIndex];
												const isEmpty = sf.fret === null && !sf.muted;
												const exact = hover?.slotIndex === slotIndex && hover.stringIndex === stringIndex;
												// The shape's fret, offered while the empty cell is hovered: a
												// chord is a suggestion, and not every string gets played.
												const hint: FretHint | null = finePointer && isEmpty && exact ? (hints[slotIndex]?.[stringIndex] ?? null) : null;
												const axes =
													hover === null
														? 0
														: (hover.slotIndex === slotIndex ? 1 : 0) + (hover.stringIndex === stringIndex ? 1 : 0);
												const glyph = cellGlyph(sf);
												// A muted cell cannot be tied.
												const tied = sf.link?.kind === "tie" && !sf.muted;
												const underSpan =
													sf.fret === null
														? null
														: spanCovers(spanIndex, slot.id, "palmMute", stringIndex)
															? "palmMute"
															: spanCovers(spanIndex, slot.id, "letRing", stringIndex)
																? "letRing"
																: null;
												const wash =
													axes === 0 && !isRest
														? slot.stroke
															? sweepWashBg(slot.stroke, stringIndex)
															: slot.percussion
																? "color-mix(in srgb, var(--gp-m-500) 10%, transparent)"
																: undefined
														: undefined;
												const isCursor = cursor?.slotIndex === slotIndex && cursor.stringIndex === stringIndex;
												return (
													<button
														key={stringIndex}
														type="button"
														tabIndex={-1}
														className="te-mb-cell"
														data-cur={isCursor ? "" : undefined}
														data-h={axes > 0 ? axes : undefined}
														data-empty={isEmpty ? "" : undefined}
														data-hint={hint !== null ? (hint === "/" ? "off" : "") : undefined}
														style={wash ? { backgroundColor: wash } : undefined}
														aria-label={`Bar ${measureIndex + 1}, slot ${slotIndex + 1}, ${label} string: ${noteText(slot, stringIndex)}`}
														onMouseDown={(e) => e.preventDefault()}
														onMouseEnter={() => onHover(cell)}
														onClick={(e) => onPick(cell, e.shiftKey, typeof hint === "number" && !e.shiftKey ? hint : null)}
														onContextMenu={(e) => {
															e.preventDefault();
															onPick(cell, false, null);
															onMenu(cell);
														}}
													>
														{hint !== null ? hint : cellDisplay(sf)}
														{glyph && <span className="te-mb-glyph">{glyph}</span>}
														{tied && <span aria-hidden className="te-mb-tie" style={{ borderColor: WASH_TIE }} />}
														{underSpan && <span aria-hidden className="te-mb-span" data-kind={underSpan} />}
													</button>
												);
											})}
											{bracketRole.size > 0 && (
												<div className="te-mb-trip" data-role={role} onMouseEnter={() => hoverColumn(slotIndex)}>
													{role === "mid" ? TRIPLET_GROUP_SIZE : ""}
												</div>
											)}
											<div className="te-mb-dur" onMouseEnter={() => hoverColumn(slotIndex)}>
												{role && isTripletDuration(slot.duration)
													? DURATION_ABBREV[tripletWrittenValue(slot.duration)]
													: DURATION_ABBREV[slot.duration]}
											</div>
											<div className="te-mb-colsel-row" onMouseEnter={() => hoverColumn(slotIndex)}>
												<button
													type="button"
													tabIndex={-1}
													className="te-mb-colsel"
													aria-pressed={selectedSet.has(slotIndex)}
													aria-label={`Select bar ${measureIndex + 1} slot ${slotIndex + 1}`}
													title="Select the slot (Shift: a run) — its chord, sweep and length are in Slot"
													onMouseDown={(e) => e.preventDefault()}
													onClick={(e) => onColumn(target, e.shiftKey)}
												/>
											</div>
											<span className="te-mb-count" data-beat={/^\d+$/.test(beatLabels[slotIndex] ?? "") ? "" : undefined} onMouseEnter={() => hoverColumn(slotIndex)}>
												{slot.percussion && (
													<span className="te-mb-hit" title={techniqueDef(slot.percussion.kind)?.label.en}>
														{techniqueDef(slot.percussion.kind)?.glyph}
													</span>
												)}
												{beatLabels[slotIndex]}
											</span>
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>

				{/* Each row's snap to the chord shape, live only while a fret differs. */}
				{hasChords && (
					<div className="te-mb-side">
						<div className="te-mb-chordrow" />
						{STRING_LABELS.map((label, stringIndex) => {
							const rowHovered = !finePointer || hover?.stringIndex === stringIndex;
							const differs = rowDiffersFromHints(measure, stringIndex, hintFor);
							return (
								<div
									key={stringIndex}
									className="te-mb-name"
									onMouseEnter={() => onHover({ measureIndex, slotIndex: -1, stringIndex })}
								>
									<button
										type="button"
										className="te-mb-clear"
										data-shown={rowHovered ? "" : undefined}
										disabled={!differs}
										tabIndex={rowHovered ? 0 : -1}
										aria-hidden={!rowHovered}
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => commit((p) => replaceRowWithHints(p, measureIndex, stringIndex, hintFor))}
										aria-label={`Replace the ${label} string's frets in measure ${measureIndex + 1} with the chord shape's`}
										title={differs ? "Snap this string's frets to the chord shape's" : "This string already matches the chord shape"}
									>
										<CornerDownLeft aria-hidden />
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<MeasureFooter measure={measure} measureIndex={measureIndex} working={working} commit={commit} tools={chordTools} />
		</div>
	);
}

export default memo(MeasureBlock);
