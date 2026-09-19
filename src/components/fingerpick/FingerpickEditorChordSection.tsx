import { ChevronLeft, ChevronRight, CornerDownLeft, Plus } from "lucide-react";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import type { SlotTarget } from "@/lib/fingerpickEdit";
import {
	chordFretHints,
	chordSymbolLabel,
	clearLeftOutStrings,
	fillColumnFromChord,
	setChordOnSlots,
	setSlotChord,
} from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { selectRefVoicing } from "@/lib/strumBars";
import { chordVoicingToVexChords } from "@/lib/chordVoicing";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import type { ChordVoicingsState } from "./useChordVoicings";
import type { CommitPattern } from "./useEditHistory";
import { PopupSectionLabel, type ShapeCreateRequest } from "./fingerpickEditorShared";

export interface FingerpickEditorChordSectionProps {
	working: FingerpickPattern;
	commit: CommitPattern;
	/** The single selected slot, or null for a multi-slot selection. */
	singleTarget: SlotTarget | null;
	/** Every selected slot, for writing one chord across a multi-slot selection. */
	selectedTargets: SlotTarget[];
	/** The chord in effect at the first selected slot (the multi-slot quick pick). */
	chordAtSelectionStart: ChordRef | null;
	chordsInEffect: readonly (readonly (ChordRef | null)[])[];
	voicingsFor: (ref: ChordRef) => ChordVoicingsState;
	searchIndex: readonly ChordIndexEntry[];
	shapeCorpus: React.ComponentProps<typeof ChordSearchSelect>["shapeCorpus"];
	onCreateShape: (request: ShapeCreateRequest) => void;
	/** The section's box, which the popup keeps in view and measures its cap by. */
	sectionRef: React.RefObject<HTMLDivElement | null>;
	/** Focus landed in the section: the popup scrolls it into view. */
	onFocusCapture: () => void;
	/** A chord edit was made here: the popup reveals the section after it re-renders. */
	onChordEdited: () => void;
}

// The Chord section of the column popup. For a single slot: the chord marked
// there (or running on from an earlier slot), its shapes to step through, and
// the fill / clear helpers. For a multi-slot selection: one chord written
// across every selected slot.
export default function FingerpickEditorChordSection({
	working,
	commit,
	singleTarget,
	selectedTargets,
	chordAtSelectionStart,
	chordsInEffect,
	voicingsFor,
	searchIndex,
	shapeCorpus,
	onCreateShape,
	sectionRef,
	onFocusCapture,
	onChordEdited,
}: FingerpickEditorChordSectionProps) {
	// Mark a chord change on a single slot (null takes the mark away).
	function applySlotChord(target: SlotTarget, chord: ChordRef | null) {
		commit((prev) => setSlotChord(prev, target, chord));
		onChordEdited();
	}

	// One chord over every selected slot: marked once per run, the chord that
	// was there resuming after it.
	function applyChordToSelection(chord: ChordRef) {
		commit((prev) => setChordOnSlots(prev, selectedTargets, chord));
		onChordEdited();
	}

	// The slot's own mark, if any, and the chord in effect there (its own, or
	// one running on from an earlier slot).
	const ownChord: ChordRef | null = singleTarget
		? (working.measures[singleTarget.measureIndex]?.slots[singleTarget.slotIndex]?.chord ??
			null)
		: null;
	const chordHere: ChordRef | null = singleTarget
		? (chordsInEffect[singleTarget.measureIndex]?.[singleTarget.slotIndex] ?? null)
		: null;
	const voicingsHere = chordHere ? voicingsFor(chordHere) : null;
	const voicingList = voicingsHere?.status === "ready" ? voicingsHere.voicings : [];
	const voicingHere = chordHere && voicingList.length > 0 ? selectRefVoicing(chordHere, voicingList) : null;
	const voicingIndex = voicingHere ? voicingList.findIndex((v) => v.id === voicingHere.id) : -1;

	// Write the shape's frets into the slot's empty cells.
	function applyFillFromChord() {
		if (!singleTarget || !voicingHere) return;
		commit((prev) => fillColumnFromChord(prev, singleTarget, voicingHere));
	}

	// Take away the notes this measure holds on strings the shape leaves out.
	function applyClearLeftOut() {
		if (!singleTarget || !chordHere || !voicingHere) return;
		commit((prev) => clearLeftOutStrings(prev, singleTarget.measureIndex, chordHere, voicingHere));
	}

	// Step to another shape of the same chord. Pinning a shape on a slot that only
	// inherits its chord writes a mark there: a voicing change is a change.
	function stepVoicing(delta: number) {
		if (!singleTarget || !chordHere || voicingList.length < 2 || voicingIndex < 0) return;
		const next = voicingList[(voicingIndex + delta + voicingList.length) % voicingList.length];
		applySlotChord(singleTarget, { root: chordHere.root, suffix: chordHere.suffix, voicingId: next.id });
	}

	// Chord over a multi-slot selection: one chord written across every
	// selected slot. The first selected slot's chord is offered as the
	// quick pick, since that is usually the one being extended.
	if (!singleTarget) {
		const count = selectedTargets.length;
		return (
			<div
				ref={sectionRef}
				onFocusCapture={onFocusCapture}
				className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0"
			>
				<PopupSectionLabel label="Chord" hint={`Put one chord over the ${count} selected slots.`} />
				<div className="flex items-center gap-1.5">
					<ChordSearchSelect
						chord={null}
						onChange={(chord) => chord && applyChordToSelection(chord)}
						index={searchIndex}
						shapeCorpus={shapeCorpus}
						inlineList
						ariaLabel={`Chord for the ${count} selected slots`}
					/>
					{chordAtSelectionStart && (
						<button
							type="button"
							onClick={() => applyChordToSelection(chordAtSelectionStart)}
							title={`Write ${chordSymbolLabel(chordAtSelectionStart)} — the chord at the first selected slot — over all ${count}`}
							className="flex h-7 items-center gap-1 px-1.5 font-mono text-[10px] text-ink-faint hover:bg-denim-tint hover:text-denim transition-colors"
						>
							<CornerDownLeft size={11} />
							{chordSymbolLabel(chordAtSelectionStart)}
						</button>
					)}
				</div>
			</div>
		);
	}

	// Chord — a change marked on this slot, running on until the next mark.
	// Single column only: a chord starts at one point in time.
	return (
		<div
			ref={sectionRef}
			onFocusCapture={onFocusCapture}
			className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0"
		>
			<PopupSectionLabel
				label="Chord"
				hint="Start a chord here. It runs until the next chord mark, across measures."
			/>
			<div className="flex items-center gap-1.5">
				<ChordSearchSelect
					chord={ownChord}
					onChange={(chord) => applySlotChord(singleTarget, chord)}
					onCreate={(query) => onCreateShape({ target: singleTarget, query })}
					index={searchIndex}
					shapeCorpus={shapeCorpus}
					inlineList
					ariaLabel={`Chord at measure ${singleTarget.measureIndex + 1}, slot ${singleTarget.slotIndex + 1}`}
				/>
				{!ownChord && chordHere && (
					<button
						type="button"
						onClick={() => applySlotChord(singleTarget, chordHere)}
						title={`${chordSymbolLabel(chordHere)} is running on from an earlier slot — press to write it here, with the shape chosen there`}
						className="flex h-7 items-center gap-1 px-1.5 font-mono text-[10px] text-ink-faint hover:bg-denim-tint hover:text-denim transition-colors"
					>
						<CornerDownLeft size={11} />
						{chordSymbolLabel(chordHere)}
					</button>
				)}
			</div>
			{chordHere && voicingsHere?.status === "loading" && (
				<span className="font-mono text-[10px] text-ink-faint">Loading shapes…</span>
			)}
			{chordHere && voicingsHere?.status === "ready" && !voicingHere && (
				<span className="font-mono text-[10px] text-destructive">
					No shape in the library for {chordSymbolLabel(chordHere)}.
				</span>
			)}
			{chordHere && voicingHere && (
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => stepVoicing(-1)}
						disabled={voicingList.length < 2}
						aria-label="Previous shape"
						title="Previous shape"
						className="flex h-7 w-6 items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronLeft size={14} />
					</button>
					{/* Fixed footprint whatever the label says, so the ‹ › buttons and
					    the shape stay put while the player steps through voicings. */}
					<div className="mx-auto w-36 shrink-0 [&>div]:h-[9.5rem] [&>div]:justify-center">
						<ChordDiagram
							def={chordVoicingToVexChords(voicingHere)}
							label={
								voicingList.length > 1
									? `${chordSymbolLabel(chordHere)} · ${voicingIndex + 1}/${voicingList.length}`
									: chordSymbolLabel(chordHere)
							}
							size="compact"
						/>
					</div>
					<button
						type="button"
						onClick={() => stepVoicing(1)}
						disabled={voicingList.length < 2}
						aria-label="Next shape"
						title="Next shape"
						className="flex h-7 w-6 items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
					>
						<ChevronRight size={14} />
					</button>
				</div>
			)}
			{/* The shape the player needs may not be among the ones on offer: a
			    new one starts from the shape on screen and is pinned to this slot. */}
			{chordHere && voicingsHere?.status === "ready" && (
				<button
					type="button"
					onClick={() => onCreateShape({ target: singleTarget, chord: chordHere, from: voicingHere })}
					title={`Write a new shape for ${chordSymbolLabel(chordHere)} and use it here`}
					className="flex h-7 items-center gap-1 self-start border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
				>
					<Plus size={12} />
					New shape for {chordSymbolLabel(chordHere)}
				</button>
			)}
			{chordHere && voicingHere && (
				<div className="flex flex-wrap gap-1">
					<button
						type="button"
						onClick={applyFillFromChord}
						title="Write this shape's frets into the slot's empty cells. Cells already holding a fret or a dead note are left alone."
						className="h-7 border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
					>
						Fill column
					</button>
					{chordFretHints(voicingHere).includes("/") && (
						<button
							type="button"
							onClick={applyClearLeftOut}
							title={`Remove this measure's notes on the strings the ${chordSymbolLabel(chordHere)} shape doesn't sound, wherever it is in effect.`}
							className="h-7 border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
						>
							Clear left-out strings
						</button>
					)}
				</div>
			)}
		</div>
	);
}
