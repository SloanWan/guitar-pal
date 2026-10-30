"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CornerDownLeft, Play, Plus } from "lucide-react";
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
import { selectRefVoicing } from "@/lib/strumBars";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import { parseRecentChords, pushRecentChord, RECENT_CHORDS_KEY, sameChord } from "@/lib/recentChords";
import { voicingToDiagramShape, type ChordVoicing } from "@/lib/chordVoicing";
import { parseTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { chordShapeToVoicing } from "@/lib/chordShape";
import type { UserChordVoicing } from "@/lib/userChordVoicings";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordShapeModal from "@/components/chords/ChordShapeModal";
import ChordSearchSelect, { type ChordSuggestionRow } from "@/components/strum/ChordSearchSelect";
import ChordShapeStrip from "@/components/fingerpick/ChordShapeStrip";
import { useStoredState, type StoredCodec } from "@/components/useStoredState";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import type { ChordTools } from "./useChordTools";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	/** The run: one slot gets a chord mark, several get one chord over them all. */
	slots: readonly SlotTarget[];
	tools: ChordTools;
}

const RECENT_CODEC: StoredCodec<ChordRef[]> = { parse: parseRecentChords, format: (list) => JSON.stringify(list) };

/** A match's shape, small and laid like the tab: fetched as the match appears, nothing until it has come. */
function MatchShape({ chord, tools }: { chord: ChordRef; tools: ChordTools }) {
	const [, setArrived] = useState(0);
	useEffect(() => {
		if (peekVoicings(chord.root, chord.suffix) !== null) return;
		let live = true;
		loadVoicings(chord.root, chord.suffix).then(
			() => live && setArrived((n) => n + 1),
			() => {},
		);
		return () => {
			live = false;
		};
	}, [chord.root, chord.suffix]);
	const state = tools.voicingsFor(chord);
	const voicing = state.status === "ready" ? selectRefVoicing(chord, state.voicings) : null;
	if (!voicing) return null;
	const { frets, startFret, barreFret } = voicingToDiagramShape(voicing);
	return <ChordShapeStrip frets={frets} startFret={startFret} barreFret={barreFret} width={40} />;
}

/** The shape editor's start: a failed search's name or frets, or a chord's shape to vary. */
type ShapeCreate = { target: SlotTarget; query: string } | { target: SlotTarget; chord: ChordRef; from: ChordVoicing | null };

/**
 * The slot's chord, in the inspector (#361): a chord change marked here (it
 * runs on until the next mark, across bars), its shapes to step through, a new
 * shape of the player's own (for a chord the search has none for, or another
 * way to hold one it has), and the shape's fills — its frets into the slot's
 * empty strings, or the bar's notes on strings it leaves out taken away. A run
 * gets one chord over all of it.
 */
export default function InspectorChord({ working, commit, slots, tools }: Props) {
	const [shapeCreate, setShapeCreate] = useState<ShapeCreate | null>(null);
	const single = slots.length === 1 ? slots[0] : null;
	const first = slots[0];
	const ownChord = single ? (working.measures[single.measureIndex]?.slots[single.slotIndex]?.chord ?? null) : null;
	const chordHere = first ? (tools.chordsInEffect[first.measureIndex]?.[first.slotIndex] ?? null) : null;
	const state = chordHere ? tools.voicingsFor(chordHere) : null;
	const voicings = state?.status === "ready" ? state.voicings : [];
	const voicing = chordHere && voicings.length > 0 ? selectRefVoicing(chordHere, voicings) : null;
	const at = voicing ? voicings.findIndex((v) => v.id === voicing.id) : -1;

	// The search's empty-field rows: the tab's own chords, then this device's recent picks.
	const [recent, setRecent] = useStoredState(RECENT_CHORDS_KEY, [] as ChordRef[], RECENT_CODEC);
	const suggestions: ChordSuggestionRow[] = [
		{ label: "In this tab", chords: tools.chordsUsed, current: chordHere },
		{ label: "Recent", chords: recent.filter((r) => !tools.chordsUsed.some((u) => sameChord(u, r))) },
	];
	function remember(chord: ChordRef | null) {
		if (chord) setRecent(pushRecentChord(recent, chord));
	}
	const searchProps = {
		index: tools.searchIndex,
		shapeCorpus: tools.shapeCorpus,
		inlineList: true,
		skin: "candy",
		suggestions,
		onHear: tools.hearChord,
		renderShape: (chord: ChordRef) => <MatchShape chord={chord} tools={tools} />,
	} as const;

	function markChord(target: SlotTarget, chord: ChordRef | null) {
		commit((p) => setSlotChord(p, target, chord));
	}

	function stepShape(delta: number) {
		if (!single || !chordHere || voicings.length < 2 || at < 0) return;
		const next = voicings[(at + delta + voicings.length) % voicings.length];
		markChord(single, { root: chordHere.root, suffix: chordHere.suffix, voicingId: next.id });
	}

	// The seed is memoized: the editor re-seeds whenever its identity changes.
	const seed = useMemo(() => {
		if (!shapeCreate) return { chord: null, namingFrom: undefined, initialVoicing: null };
		if ("chord" in shapeCreate) return { chord: shapeCreate.chord, namingFrom: undefined, initialVoicing: shapeCreate.from };
		const { frets } = parseTabSequence(shapeCreate.query);
		if (frets) {
			return { chord: null, namingFrom: undefined, initialVoicing: chordShapeToVoicing(tabSequenceToShape(frets), "draft") };
		}
		return { chord: null, namingFrom: shapeCreate.query, initialVoicing: null };
	}, [shapeCreate]);

	function shapeMade(made: UserChordVoicing) {
		if (!shapeCreate) return;
		// Pin what was stored: an identical shape already on record keeps its id.
		const stored = tools.saveVoicing(made);
		markChord(shapeCreate.target, { root: stored.root, suffix: stored.suffix, voicingId: stored.id });
		setShapeCreate(null);
	}

	return (
		<>
			<h3>Chord</h3>
			{!single ? (
				<div className="te-irow">
					<ChordSearchSelect
						{...searchProps}
						chord={null}
						onChange={(chord) => {
							remember(chord);
							if (chord) commit((p) => setChordOnSlots(p, [...slots], chord));
						}}
						ariaLabel={`Chord for the ${slots.length} selected slots`}
					/>
					{chordHere && (
						<button
							type="button"
							className="te-chip"
							title={`Write ${chordSymbolLabel(chordHere)}, the chord at the first selected slot, over all ${slots.length}`}
							onClick={() => commit((p) => setChordOnSlots(p, [...slots], chordHere))}
						>
							<CornerDownLeft aria-hidden className="te-chip-ic" />
							{chordSymbolLabel(chordHere)}
						</button>
					)}
				</div>
			) : (
				<>
					<div className="te-irow">
						<ChordSearchSelect
							{...searchProps}
							chord={ownChord}
							onChange={(chord) => {
								remember(chord);
								markChord(single, chord);
							}}
							onCreate={(query) => setShapeCreate({ target: single, query })}
							ariaLabel={`Chord at bar ${single.measureIndex + 1}, slot ${single.slotIndex + 1}`}
						/>
						{ownChord && (
							<button
								type="button"
								className="te-chip"
								disabled={!voicing}
								onClick={() => tools.hearChord(ownChord)}
								aria-label={`Hear ${chordSymbolLabel(ownChord)}`}
							>
								<Play aria-hidden className="te-chip-ic" />
								Hear
							</button>
						)}
						{!ownChord && chordHere && (
							<button
								type="button"
								className="te-chip"
								title={`${chordSymbolLabel(chordHere)} runs on from an earlier slot: pin it here, with the shape chosen there`}
								onClick={() => markChord(single, chordHere)}
							>
								<CornerDownLeft aria-hidden className="te-chip-ic" />
								Pin {chordSymbolLabel(chordHere)}
							</button>
						)}
					</div>
					{!chordHere && <p className="te-why">No chord here yet. A chord marked on a slot runs on until the next one.</p>}
					{chordHere && state?.status === "loading" && <p className="te-why">Loading shapes…</p>}
					{chordHere && state?.status === "ready" && !voicing && (
						<p className="te-why">No shape in the library for {chordSymbolLabel(chordHere)}.</p>
					)}
					{chordHere && voicing && (
						<div className="te-chordbox">
							<div className="te-chordshape">
								<ChordDiagram def={voicingToDiagramShape(voicing)} label={chordSymbolLabel(chordHere)} size="compact" />
							</div>
							<div className="te-chordside">
								<div className="te-chordstep">
									<button type="button" className="pb-icon" aria-label="Previous shape" disabled={voicings.length < 2} onClick={() => stepShape(-1)}>
										<ChevronLeft aria-hidden />
									</button>
									<span className="pb-num">{voicings.length > 1 ? `${at + 1} of ${voicings.length}` : "One shape"}</span>
									<button type="button" className="pb-icon" aria-label="Next shape" disabled={voicings.length < 2} onClick={() => stepShape(1)}>
										<ChevronRight aria-hidden />
									</button>
								</div>
								<span className="te-chordfrets pb-num">
									{[...chordFretHints(voicing)]
										.reverse()
										.map((hint) => (hint === "/" ? "x" : hint))
										.join(" ")}
								</span>
							</div>
						</div>
					)}
					{chordHere && state?.status === "ready" && (
						<div className="te-chips">
							<button
								type="button"
								className="te-chip"
								title={`Write a new shape for ${chordSymbolLabel(chordHere)} and use it here`}
								onClick={() => setShapeCreate({ target: single, chord: chordHere, from: voicing })}
							>
								<Plus aria-hidden className="te-chip-ic" />
								New shape
							</button>
							{voicing && (
								<button
									type="button"
									className="te-chip"
									title="Write this shape's frets into the slot's empty strings; a fret or an x already there stays"
									onClick={() => commit((p) => fillColumnFromChord(p, single, voicing))}
								>
									Fill the slot
								</button>
							)}
							{voicing && chordFretHints(voicing).includes("/") && (
								<button
									type="button"
									className="te-chip"
									title={`Take away this bar's notes on the strings the ${chordSymbolLabel(chordHere)} shape leaves out`}
									onClick={() => commit((p) => clearLeftOutStrings(p, single.measureIndex, chordHere, voicing))}
								>
									Clear left-out strings
								</button>
							)}
						</div>
					)}
				</>
			)}
			{/* Mounted only while open, so it seeds from this request. */}
			{shapeCreate && (
				<ChordShapeModal
					open
					chord={seed.chord}
					namingFrom={seed.namingFrom}
					initialVoicing={seed.initialVoicing}
					onClose={() => setShapeCreate(null)}
					onApply={shapeMade}
					matchingBarCount={1}
				/>
			)}
		</>
	);
}
