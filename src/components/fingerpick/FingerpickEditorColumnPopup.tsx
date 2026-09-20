import { useCallback, useEffect, useRef, useState } from "react";
import {
	ArrowDown,
	ArrowLeftToLine,
	ArrowRightToLine,
	ArrowUp,
	Check,
	Copy,
	Merge,
	Trash2,
} from "lucide-react";
import {
	strokeDirection,
	type Duration,
	type FingerpickPattern,
	type Measure,
	type Stroke,
} from "@/lib/fingerpickTypes";
import {
	STRING_LABELS,
	deleteSlots,
	duplicateSlots,
	insertSlots,
	mergeSlots,
	mergeTargetsForSlot,
	tripletGroupAt,
	resetMeasure,
	setInactive,
	setSlotsRest,
	setStroke,
	slotHasStringData,
	splitSlot,
	splitTargetsForSlot,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { fillColumnFromChord, offShapeStrings, type FretHint } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { selectRefVoicing } from "@/lib/strumBars";
import type { ChordVoicing } from "@/lib/chordVoicing";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import type { ChordVoicingsState } from "./useChordVoicings";
import type { CommitPattern } from "./useEditHistory";
import FingerpickEditorChordSection from "./FingerpickEditorChordSection";
import {
	DurationIcon,
	PopupSectionLabel,
	columnKey,
	parseColumnKey,
	useIsomorphicLayoutEffect,
	type ShapeCreateRequest,
} from "./fingerpickEditorShared";

// Slot-level roll (arpeggiated chord) options for the column popup. "none" clears
// the field; "roll-down"/"roll-up" are the domain Stroke values. Roll ↓ = hand moves
// down = low→high pitch; Roll ↑ = hand moves up = high→low pitch (see fingerpickTypes).
// Roll = slow arpeggio (wave), Brush = fast strum (straight arrow); ↓ = low → high pitch.
const STROKE_PICKER: { label: string; value: "none" | Stroke; title: string }[] = [
	{ label: "Off", value: "none", title: "No sweep — sound the strings together" },
	{ label: "Roll", value: "roll-down", title: "Roll down — a slow arpeggio, low to high strings" },
	{ label: "Roll", value: "roll-up", title: "Roll up — a slow arpeggio, high to low strings" },
	{ label: "Brush", value: "brush-down", title: "Brush down — a fast strum, low to high strings" },
	{ label: "Brush", value: "brush-up", title: "Brush up — a fast strum, high to low strings" },
];

// Inline confirmation inside the popup (merge / replace-with-whole / roll).
type PopupConfirm =
	| { kind: "merge"; affectedSlotCount: number; pendingMeasures: Measure[] }
	| { kind: "whole"; pendingMeasures: Measure[] }
	// Rolling slots that hold notes outside the chord shape: overwrite them?
	| { kind: "roll"; targets: SlotTarget[] };

export interface FingerpickEditorColumnPopupProps {
	working: FingerpickPattern;
	commit: CommitPattern;
	/** Column keys ("measure:slot") of the selected columns; never empty while mounted. */
	selectedColumns: ReadonlySet<string>;
	onClearSelection: () => void;
	chordsInEffect: readonly (readonly (ChordRef | null)[])[];
	hintsBySlot: readonly (readonly (FretHint[] | null)[])[];
	voicingsFor: (ref: ChordRef) => ChordVoicingsState;
	searchIndex: readonly ChordIndexEntry[];
	shapeCorpus: React.ComponentProps<typeof ChordSearchSelect>["shapeCorpus"];
	/** The scroll region the popup lives in; its coordinate space and what gets nudged. */
	scrollRef: React.RefObject<HTMLDivElement | null>;
	/** The first selected column's box, which the popup hangs below. */
	anchorRef: React.RefObject<HTMLDivElement | null>;
	/**
	 * When the chord was last worked on from outside the popup (the chord chip
	 * in the grid, a shape created in the nested editor), as a timestamp; 0 for
	 * never. Counts as a chord edit here, so the Chord section is revealed.
	 */
	revealChordAt: number;
	onCreateShape: (request: ShapeCreateRequest) => void;
}

// The column popup: everything that can be done to the selected slot(s) —
// move, split, merge, replace, sweep, rest and chord — with its own inline
// confirmations. Absolutely positioned inside the scroll region (like the
// technique menu) so it stays clipped to the dialog and scrolls with the grid.
export default function FingerpickEditorColumnPopup({
	working,
	commit,
	selectedColumns,
	onClearSelection,
	chordsInEffect,
	hintsBySlot,
	voicingsFor,
	searchIndex,
	shapeCorpus,
	scrollRef,
	anchorRef,
	revealChordAt,
	onCreateShape,
}: FingerpickEditorColumnPopupProps) {
	const popupRef = useRef<HTMLDivElement>(null);
	// The popup's Chord section (single- or multi-slot — one renders at a time).
	// Its height sets the least the popup may be capped to, and it is scrolled
	// into view inside the popup whenever the chord is being worked on.
	const chordSectionRef = useRef<HTMLDivElement>(null);
	// Bumped by every chord edit made from the popup, so the section is revealed
	// after the edit re-renders it (a new shape card, a longer result list …).
	const [revealChordTick, setRevealChordTick] = useState(0);
	// When the chord was last edited from the popup. Growth of the section soon
	// after (the shape card arriving for the chord just picked) is revealed too,
	// even though picking took the focus out of the section.
	const lastChordEditRef = useRef(0);
	const bumpRevealChord = useCallback(() => {
		lastChordEditRef.current = Date.now();
		setRevealChordTick((t) => t + 1);
	}, []);
	// The parent's outside edits count too.
	const lastChordEdit = useCallback(
		() => Math.max(lastChordEditRef.current, revealChordAt),
		[revealChordAt],
	);
	// Scroll-region-relative coordinates for the popup (null until measured).
	const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
	// Height the popup may take before scrolling inside itself; set by the nudge.
	const [popupMaxHeight, setPopupMaxHeight] = useState<number | null>(null);

	// A pending confirmation belongs to the selection it was raised for: any
	// change to the selected columns drops it, as toggling a column always did.
	const selectionKey = [...selectedColumns].sort().join("|");
	const [confirmState, setConfirmState] = useState<{ key: string; confirm: PopupConfirm } | null>(
		null,
	);
	const popupConfirm = confirmState && confirmState.key === selectionKey ? confirmState.confirm : null;
	function setPopupConfirm(confirm: PopupConfirm | null) {
		setConfirmState(confirm ? { key: selectionKey, confirm } : null);
	}

	const columnTargets = (): SlotTarget[] => [...selectedColumns].map(parseColumnKey);

	// Toggle the silent (rest) state on every selected column in one commit. A rest
	// keeps its rhythmic duration, so the measure total is unchanged.
	function applyRest(isRest: boolean) {
		commit((prev) => setSlotsRest(prev, columnTargets(), isRest));
	}

	// The shape in effect at a slot, when it is known.
	function voicingAt(t: SlotTarget): ChordVoicing | null {
		const ref = chordsInEffect[t.measureIndex]?.[t.slotIndex] ?? null;
		if (!ref) return null;
		const state = voicingsFor(ref);
		return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
	}
	function fillFromChordAt(p: FingerpickPattern, t: SlotTarget): FingerpickPattern {
		const voicing = voicingAt(t);
		return voicing ? fillColumnFromChord(p, t, voicing) : p;
	}
	function clearSlotStrings(p: FingerpickPattern, t: SlotTarget): FingerpickPattern {
		return STRING_LABELS.reduce(
			(q, _, stringIndex) => setInactive(q, { ...t, stringIndex }),
			p,
		);
	}

	// Apply (or clear) a sweep stroke on every selected column in one commit, so
	// undo/redo treat a multi-column stroke change as a single step. `undefined`
	// clears. A roll is a chord being sounded, so an empty slot is filled from its
	// chord shape as the roll goes on; a slot holding notes outside the shape is
	// not touched without asking. Turning the roll off changes only the roll.
	function applyStroke(stroke: Stroke | undefined) {
		const targets = columnTargets();
		const conflicting: SlotTarget[] = [];
		commit((prev) =>
			targets.reduce((p, t) => {
				let next = setStroke(p, t, stroke);
				if (!stroke) return next;
				const slot = next.measures[t.measureIndex]?.slots[t.slotIndex];
				const hints = hintsBySlot[t.measureIndex]?.[t.slotIndex] ?? null;
				if (!slot || !hints) return next;
				if (!slotHasStringData(slot)) next = fillFromChordAt(next, t);
				else if (offShapeStrings(slot, hints).length > 0) conflicting.push(t);
				return next;
			}, prev),
		);
		setPopupConfirm(conflicting.length > 0 ? { kind: "roll", targets: conflicting } : null);
	}

	function applyStructural(op: "before" | "after" | "duplicate" | "delete") {
		const targets = columnTargets();
		commit((prev) => {
			if (op === "duplicate") return duplicateSlots(prev, targets);
			if (op === "delete") return deleteSlots(prev, targets);
			return insertSlots(prev, targets, op);
		});
		onClearSelection();
	}

	// Replace a measure's slots via a Measure[] transform (split/merge/reset all
	// operate on the measure array, not the whole pattern).
	function applyMeasures(measures: Measure[]) {
		commit((prev) => ({ ...prev, measures }));
	}

	// ── Split / merge / replace-with-whole (single selected column) ──────────

	function applySplit(target: SlotTarget, duration: Duration) {
		applyMeasures(
			splitSlot(
				working.measures,
				target.measureIndex,
				target.slotIndex,
				duration,
				working.timeSignature,
			),
		);
		onClearSelection();
	}

	function requestMerge(target: SlotTarget, duration: Duration) {
		const res = mergeSlots(
			working.measures,
			target.measureIndex,
			target.slotIndex,
			duration,
			working.timeSignature,
		);
		if (res.type === "confirm") {
			setPopupConfirm({
				kind: "merge",
				affectedSlotCount: res.affectedSlotCount,
				pendingMeasures: res.pendingMeasures,
			});
		} else {
			applyMeasures(res.measures);
			onClearSelection();
		}
	}

	function requestReplaceWithWhole(target: SlotTarget) {
		const res = resetMeasure(
			working.measures,
			target.measureIndex,
			"whole",
			working.timeSignature,
		);
		if (res.type === "confirm") {
			setPopupConfirm({ kind: "whole", pendingMeasures: res.measures });
		} else {
			applyMeasures(res.measures);
			onClearSelection();
		}
	}

	function confirmPopup() {
		if (!popupConfirm) return;
		if (popupConfirm.kind === "roll") {
			// Overwrite: the slot's notes go, the shape's frets come in.
			commit((prev) =>
				popupConfirm.targets.reduce((p, t) => fillFromChordAt(clearSlotStrings(p, t), t), prev),
			);
			setPopupConfirm(null);
			return;
		}
		applyMeasures(popupConfirm.pendingMeasures);
		onClearSelection();
	}

	// Rest toggle is active only when every selected column is already a rest.
	const allSelectedRest: boolean = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return false;
		return targets.every((t) => !!working.measures[t.measureIndex]?.slots[t.slotIndex]?.isRest);
	})();

	// Stroke highlighted in the roll picker = the shared stroke of all selected slots
	// ("none" when they all lack one). "mixed" when they disagree, so nothing lights up.
	const selectedStroke: "none" | Stroke | "mixed" = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return "none";
		const strokes = targets.map(
			(t) => working.measures[t.measureIndex]?.slots[t.slotIndex]?.stroke,
		);
		const first = strokes[0];
		return strokes.every((s) => s === first) ? (first ?? "none") : "mixed";
	})();

	// The popup is anchored below the first selected column's selector.
	const firstSelectedColumn: SlotTarget | null =
		selectedColumns.size > 0
			? [...selectedColumns]
					.map(parseColumnKey)
					.sort((a, b) => a.measureIndex - b.measureIndex || a.slotIndex - b.slotIndex)[0]
			: null;
	const firstSelectedColumnKey = firstSelectedColumn ? columnKey(firstSelectedColumn) : null;

	// Anchor direction: columns in the left half of their measure open the popup to
	// the right (default); columns in the right half open it to the left so it never
	// spills past the rightmost measure's edge.
	const popupOpensLeft = (() => {
		if (!firstSelectedColumn) return false;
		const totalSlots = working.measures[firstSelectedColumn.measureIndex]?.slots.length ?? 0;
		return firstSelectedColumn.slotIndex >= totalSlots / 2;
	})();

	// Position the popup just below the selected column, in the scroll region's
	// own coordinate space, so it lives inside the dialog (never spilling outside it)
	// and scrolls with the grid — the same anchoring model as the technique menu.
	// Recomputed on scroll (capture, to catch the measure's inner horizontal scroll)
	// and resize; setPopupPos bails when the numbers are unchanged so a stable scroll
	// doesn't churn the auto-scroll effect below.
	useIsomorphicLayoutEffect(() => {
		if (!firstSelectedColumnKey) {
			setPopupPos(null);
			return;
		}
		const GAP = 6;
		const compute = () => {
			const el = anchorRef.current;
			const scroller = scrollRef.current;
			if (!el || !scroller) return;
			const scRect = scroller.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const top = r.bottom - scRect.top + scroller.scrollTop + GAP;
			// Columns in the right half of their measure open the popup leftwards (its
			// right edge aligned to the column) so it doesn't shoot off the right; the
			// rest open rightwards from the column's left edge. Clamp to 0 so it never
			// starts off the left edge. offsetWidth is read from the already-rendered
			// (visibility-hidden until positioned) popup.
			const popupW = popupRef.current?.offsetWidth ?? 0;
			const rawLeft = popupOpensLeft
				? r.right - scRect.left + scroller.scrollLeft - popupW
				: r.left - scRect.left + scroller.scrollLeft;
			const left = Math.max(0, rawLeft);
			setPopupPos((prev) =>
				prev && prev.top === top && prev.left === left ? prev : { top, left },
			);
		};
		compute();
		window.addEventListener("resize", compute);
		window.addEventListener("scroll", compute, true);
		return () => {
			window.removeEventListener("resize", compute);
			window.removeEventListener("scroll", compute, true);
		};
	}, [firstSelectedColumnKey, popupOpensLeft, anchorRef, scrollRef]);

	// Nudge the scroll region just enough to bring the whole popup into view
	// when it overflows the viewport (e.g. selecting a column in the bottom measure).
	// Mirrors the technique-menu auto-scroll: runs after layout so the popup has its
	// real size, and re-runs when its position or content height changes (selection,
	// single↔multi controls, or an inline confirmation appearing).
	//
	// The nudge never scrolls the selected column's measure out of view: the popup
	// is about that column, and the player needs to see it. Where the popup would
	// still not fit below the anchor, it is capped to the room left and scrolls
	// inside itself instead.
	useIsomorphicLayoutEffect(() => {
		if (!firstSelectedColumnKey || !popupPos) return;
		const popup = popupRef.current;
		const scroller = scrollRef.current;
		if (!popup || !scroller) return;
		const PAD = 8;
		const popupRect = popup.getBoundingClientRect();
		const viewRect = scroller.getBoundingClientRect();
		const block = anchorRef.current?.closest<HTMLElement>("[data-measure-id]");
		const blockTop = block?.getBoundingClientRect().top ?? popupRect.top;
		// The popup's full content height, whatever cap it is under right now.
		const naturalHeight = popup.scrollHeight + (popupRect.height - popup.clientHeight);
		// The Chord section must always be showable whole: it is the part that
		// grows (shape card, result list) and the part being worked on.
		const chordHeight = chordSectionRef.current?.getBoundingClientRect().height ?? 0;
		const leastHeight = Math.min(naturalHeight, Math.max(160, chordHeight + 24));
		let dx = 0;
		let dy = 0;
		if (popupRect.right > viewRect.right - PAD) dx = popupRect.right - (viewRect.right - PAD);
		else if (popupRect.left < viewRect.left + PAD) dx = popupRect.left - (viewRect.left + PAD);
		let maxHeight = naturalHeight;
		if (popupRect.top + naturalHeight > viewRect.bottom - PAD) {
			// Scroll down as far as keeps the measure's top edge in view; what still
			// hangs below is the popup's own scroll — but never less than the Chord
			// section needs, even if that costs a little of the measure's top.
			const cap = Math.max(0, blockTop - (viewRect.top + PAD));
			const roomAtCap = viewRect.bottom - PAD - (popupRect.top - cap);
			maxHeight = Math.floor(Math.max(roomAtCap, leastHeight));
			dy = popupRect.top + maxHeight - (viewRect.bottom - PAD);
		} else if (popupRect.top < viewRect.top + PAD) {
			dy = popupRect.top - (viewRect.top + PAD);
		}
		setPopupMaxHeight((prev) => (prev === maxHeight ? prev : maxHeight));
		if (dx !== 0 || dy !== 0) scroller.scrollBy({ left: dx, top: dy, behavior: "smooth" });
		// `popupMaxHeight` is a dep on purpose: the cap applied by this pass changes
		// how far the scroll region can scroll, so the nudge is settled on the next.
	}, [
		firstSelectedColumnKey,
		popupPos,
		popupConfirm,
		selectedColumns,
		revealChordTick,
		revealChordAt,
		popupMaxHeight,
		anchorRef,
		scrollRef,
	]);

	// Bring the Chord section into view inside the popup whenever the chord is
	// being worked on: on focus landing in it, and after every chord edit.
	const revealChordSection = useCallback(() => {
		const popup = popupRef.current;
		const section = chordSectionRef.current;
		if (!popup || !section) return;
		const p = popup.getBoundingClientRect();
		const c = section.getBoundingClientRect();
		if (c.bottom > p.bottom) popup.scrollTop += c.bottom - p.bottom + 4;
		else if (c.top < p.top) popup.scrollTop -= p.top - c.top + 4;
	}, []);
	// Re-run when the cap is applied too: the first reveal may have happened on
	// an uncapped popup, where everything was in view anyway.
	useIsomorphicLayoutEffect(() => {
		if (revealChordTick === 0 && revealChordAt === 0) return;
		if (Date.now() - lastChordEdit() > 3000) return;
		revealChordSection();
	}, [revealChordTick, revealChordAt, popupMaxHeight, revealChordSection, lastChordEdit]);
	// The section also grows on its own — the result list opening under the
	// search field, a shape card arriving — and while the player's focus is in
	// it, that growth should stay in view too.
	useEffect(() => {
		const section = chordSectionRef.current;
		if (!section || !firstSelectedColumnKey) return;
		let lastHeight = section.getBoundingClientRect().height;
		const observer = new ResizeObserver(() => {
			const height = section.getBoundingClientRect().height;
			if (height === lastHeight) return;
			lastHeight = height;
			const recentEdit = Date.now() - lastChordEdit() < 3000;
			if (section.contains(document.activeElement) || recentEdit) setRevealChordTick((t) => t + 1);
		});
		observer.observe(section);
		return () => observer.disconnect();
	}, [firstSelectedColumnKey, selectedColumns, lastChordEdit]);

	// Split/merge/whole controls act on a single slot. When exactly one column is
	// selected, enumerate that slot's split and merge targets from live state.
	const singleTarget: SlotTarget | null = selectedColumns.size === 1 ? columnTargets()[0] : null;
	const singleMeasure = singleTarget ? working.measures[singleTarget.measureIndex] : null;
	// A slot under a `3` bracket moves with its group: insert lands outside the
	// bracket, duplicate and delete take all three.
	const inTriplet =
		!!singleTarget && !!singleMeasure && tripletGroupAt(singleMeasure.slots, singleTarget.slotIndex) !== null;

	// Smaller note values this slot can be split into (even subdivisions that fit the
	// measure's remaining capacity), and larger values the following slots can merge
	// up to — both enumerated by the shared lib helpers.
	const splitOptions =
		singleTarget && singleMeasure
			? splitTargetsForSlot(singleMeasure, singleTarget.slotIndex, working.timeSignature)
			: [];
	const mergeOptions =
		singleTarget && singleMeasure
			? mergeTargetsForSlot(singleMeasure, singleTarget.slotIndex)
			: [];

	// For a multi-slot selection: the chord in effect at its first slot.
	const chordAtSelectionStart: ChordRef | null = firstSelectedColumn
		? (chordsInEffect[firstSelectedColumn.measureIndex]?.[firstSelectedColumn.slotIndex] ?? null)
		: null;
	// Show "Replace with whole note" only when the measure has content to replace:
	// more than one slot, or a lone slot that isn't already an empty whole note.
	const measureHasContent =
		!!singleMeasure &&
		(singleMeasure.slots.length > 1 ||
			singleMeasure.slots.some((s) => s.strings.some((sf) => sf.fret !== null || sf.muted)) ||
			singleMeasure.slots[0]?.duration !== "whole");

	return (
		<div
			ref={popupRef}
			data-column-popup
			// Rendered as soon as a column is selected but kept hidden (yet
			// measurable, for its width) until the layout effect has computed its
			// content-relative position.
			style={{
				position: "absolute",
				top: popupPos?.top ?? 0,
				left: popupPos?.left ?? 0,
				visibility: popupPos ? "visible" : "hidden",
				maxHeight: popupMaxHeight ?? undefined,
			}}
			className="z-60 w-60 border border-line-strong bg-popover p-2 flex flex-col gap-2 shadow-lg overflow-y-auto fp-thin-scroll"
		>
			{/* Done — a way out of the selection that does not need a press
			    somewhere else. Sticky so it stays in the corner while the popup
			    scrolls; zero height so it takes no room from the sections. */}
			<div className="sticky top-0 z-10 flex h-0 justify-end overflow-visible">
				<button
					type="button"
					onClick={onClearSelection}
					aria-label="Done with this slot"
					title="Done — close this popup"
					className="-mt-1 -mr-1 flex h-6 w-6 items-center justify-center border border-line-strong bg-popover text-ink-dim hover:border-denim hover:text-denim transition-colors"
				>
					<Check size={13} />
				</button>
			</div>
			{/* Move — structural edits on the selected slot. Single selection only:
			    with several slots picked, the popup is about what they share. */}
			{singleTarget && (
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label={inTriplet ? "Move Triplet" : "Move Slot"}
					hint={
						inTriplet
							? "A triplet moves as one: insert outside it, duplicate or delete all three."
							: "Insert, duplicate, or delete this slot."
					}
				/>
				<div className="flex gap-1">
					<PopupIconButton
						title={inTriplet ? "Insert before the triplet" : "Insert before"}
						onClick={() => applyStructural("before")}
					>
						<ArrowLeftToLine size={14} />
					</PopupIconButton>
					<PopupIconButton
						title={inTriplet ? "Insert after the triplet" : "Insert after"}
						onClick={() => applyStructural("after")}
					>
						<ArrowRightToLine size={14} />
					</PopupIconButton>
					<PopupIconButton
						title={inTriplet ? "Duplicate the triplet" : "Duplicate"}
						onClick={() => applyStructural("duplicate")}
					>
						<Copy size={14} />
					</PopupIconButton>
					<PopupIconButton
						title={inTriplet ? "Delete the triplet" : "Delete"}
						onClick={() => applyStructural("delete")}
						danger
					>
						<Trash2 size={14} />
					</PopupIconButton>
				</div>
			</div>
			)}
			{/* Split / merge (single column only). Split subdivides the slot into equal
			    smaller notes; merge folds this slot plus the following run into any larger
			    note value they sum to. Both preserve the measure total. */}
			{singleTarget &&
				!popupConfirm &&
				(splitOptions.length > 0 || mergeOptions.length > 0) && (
					<div className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
						{splitOptions.length > 0 && (
							<div className="flex flex-wrap items-center gap-1">
								<PopupSectionLabel
									label="Split"
									hint="Break this note into smaller, even notes."
								/>
								{splitOptions.map(({ duration, count }) => (
									<button
										key={duration}
										onClick={() => applySplit(singleTarget, duration)}
										title={`Split into ${count} × ${duration}`}
										className="flex items-center gap-0.5 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
									>
										{count}×<DurationIcon duration={duration} />
									</button>
								))}
							</div>
						)}
						{mergeOptions.length > 0 && (
							<div className="flex flex-wrap items-center gap-1">
								<PopupSectionLabel
									label="Merge"
									hint="Join this note with the ones after it into one longer note."
								/>
								{mergeOptions.map(({ duration, count }) => (
									<button
										key={duration}
										onClick={() => requestMerge(singleTarget, duration)}
										title={`Merge ${count} slots into a ${duration}`}
										className="flex items-center gap-0.5 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
									>
										<Merge size={13} />
										<DurationIcon duration={duration} />
									</button>
								))}
							</div>
						)}
					</div>
				)}

			{/* Replace whole measure with a single whole note (single column only) */}
			{singleTarget && measureHasContent && !popupConfirm && (
				<div className="border-t border-line pt-2 first:border-t-0 first:pt-0">
					<button
						onClick={() => requestReplaceWithWhole(singleTarget)}
						title="Clear the whole measure back to one empty note."
						className="flex items-center gap-1 h-7 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
					>
						Replace with <DurationIcon duration="whole" />
					</button>
				</div>
			)}

			{/* Inline confirmation for a destructive merge / whole-replace */}
			{popupConfirm && (
				<div className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
					<span className="text-[11px] text-ink-dim">
						{popupConfirm.kind === "merge"
							? `This will discard data from ${popupConfirm.affectedSlotCount} slot(s). Continue?`
							: popupConfirm.kind === "roll"
								? `${popupConfirm.targets.length === 1 ? "This slot holds" : `${popupConfirm.targets.length} slots hold`} notes outside the chord shape. Overwrite with the shape?`
								: "This will replace the measure's content. Continue?"}
					</span>
					<div className="flex gap-1">
						<button
							onClick={() => setPopupConfirm(null)}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-raise active:bg-denim-tint transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={confirmPopup}
							className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
						>
							Confirm
						</button>
					</div>
				</div>
			)}

			{/* Roll (arpeggiated-chord) selector — slot-level, applies to every
			    selected column. Rings the strings out one at a time instead of together. */}
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label="Sweep"
					hint="Roll: a slow arpeggio, one string after another. Brush: a fast strum. ↓ low to high strings, ↑ high to low."
				/>
				{/* Off spans both rows; roll and brush each get a row of directions. */}
				<div className="grid grid-cols-[auto_1fr_1fr] border border-line-strong">
					{STROKE_PICKER.map((s, i) => (
						<button
							key={s.value}
							onClick={() => applyStroke(s.value === "none" ? undefined : s.value)}
							title={s.title}
							aria-label={s.title}
							className={`h-7 px-2 flex items-center justify-center gap-0.5 font-mono text-[11px] font-semibold transition-colors ${
								s.value === "none" ? "row-span-2 h-14" : "border-l border-line-strong"
							} ${i >= 3 ? "border-t border-line-strong" : ""} ${
								selectedStroke === s.value
									? "bg-denim text-on-denim"
									: "text-ink-dim hover:bg-denim-tint hover:text-denim"
							}`}
						>
							{s.value !== "none" && strokeDirection(s.value) === "down" && (
								<ArrowDown size={11} aria-hidden />
							)}
							{s.value !== "none" && strokeDirection(s.value) === "up" && (
								<ArrowUp size={11} aria-hidden />
							)}
							{s.label}
						</button>
					))}
				</div>
			</div>

			{/* Rest — silences the selected column(s) while keeping their rhythmic
			    duration, so the measure total never changes. */}
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label="Rest"
					hint="Silence this slot but keep its timing in the measure."
				/>
				<button
					onClick={() => applyRest(!allSelectedRest)}
					title={
						allSelectedRest
							? "Turn the rest back into a note"
							: "Silence this slot (keeps its duration as a rest)"
					}
					className={`h-7 px-2 font-mono text-xs font-semibold border border-line-strong transition-colors self-start ${
						allSelectedRest
							? "bg-denim text-on-denim"
							: "text-ink-dim hover:bg-denim-tint hover:text-denim"
					}`}
				>
					Rest
				</button>
			</div>

			{!popupConfirm && (
				<FingerpickEditorChordSection
					working={working}
					commit={commit}
					singleTarget={singleTarget}
					selectedTargets={columnTargets()}
					chordAtSelectionStart={chordAtSelectionStart}
					chordsInEffect={chordsInEffect}
					voicingsFor={voicingsFor}
					searchIndex={searchIndex}
					shapeCorpus={shapeCorpus}
					onCreateShape={onCreateShape}
					sectionRef={chordSectionRef}
					onFocusCapture={revealChordSection}
					onChordEdited={bumpRevealChord}
				/>
			)}
		</div>
	);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PopupIconButton({
	title,
	onClick,
	children,
	danger,
}: {
	title: string;
	onClick: () => void;
	children: React.ReactNode;
	danger?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			title={title}
			aria-label={title}
			className={`h-7 w-7 flex items-center justify-center text-ink-dim transition-colors active:bg-denim-tint ${
				danger
					? "hover:bg-raise hover:text-destructive"
					: "hover:bg-denim-tint hover:text-denim"
			}`}
		>
			{children}
		</button>
	);
}
