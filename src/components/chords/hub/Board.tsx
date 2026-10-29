"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MoveLeft, MoveRight, Play, SlidersHorizontal, Square } from "lucide-react";
import { toast } from "sonner";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import ChordRequestButton from "@/components/chords/ChordRequestButton";
import { useChordPreview } from "@/components/chords/useChordPreview";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { stashHandoff } from "@/lib/assistant/handoff";
import {
	BOARD_CAPO_MAX,
	BOARD_TRANSPOSE_LIMIT,
	boardProgression,
	moveOnBoard,
	pageOnBoard,
	removeFromBoard,
	revealScrollLeft,
	type BoardChord,
	type BoardItem,
} from "@/lib/chordBoard";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordHref } from "@/lib/chordSlug";
import { chordSymbol } from "@/lib/chordSuffixes";
import { rootPitchClass } from "@/lib/chordVoicingToMidi";
import { prefersReducedMotion } from "@/lib/motion";
import { LAST_STRUM_PATTERN_KEY, PRESET_STRUM_PATTERNS, STRUM_BPM_MAX, STRUM_BPM_MIN } from "@/lib/strumPatterns";
import CornerButton from "./CornerButton";
import type { BoardCard } from "./useBoard";

/** Beats each chord is held for when the board is played through. */
const BEATS_PER_CHORD = 4;
/** The board's own starting tempo, quicker than Strum's: it runs through chords, not a rhythm. */
const DEFAULT_BOARD_BPM = 120;

interface Props {
	items: readonly BoardItem[];
	cards: readonly BoardCard[];
	transpose: number;
	capo: number;
	onChange: (items: BoardItem[]) => void;
	onTranspose: (semitones: number) => void;
	onCapo: (fret: number) => void;
}

/** The shape a found card is showing, or undefined while its shapes load. */
function shownShape(card: Extract<BoardCard, { status: "found" }>) {
	const count = card.shapes?.length ?? 0;
	return count > 0 ? card.shapes?.[Math.min(card.item.shape, count - 1)] : undefined;
}

/**
 * Plays the board's chords in turn, one every `BEATS_PER_CHORD` beats. Its timers
 * are cleared on stop and on unmount.
 */
function usePlayThrough() {
	const preview = useChordPreview();
	const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
	/** Bumped by every stop, so a run still waiting on the samples knows it was called off. */
	const runId = useRef(0);
	const [playing, setPlaying] = useState<number | null>(null);

	const stop = useCallback(() => {
		runId.current += 1;
		timers.current.forEach(clearTimeout);
		timers.current = [];
		setPlaying(null);
	}, []);
	useEffect(() => stop, [stop]);

	const start = async (steps: readonly { index: number; pitches: readonly number[] }[], bpm: number) => {
		stop();
		if (steps.length === 0) return;
		const id = runId.current;
		setPlaying(steps[0].index);
		// The samples first, so the first chord is not late against the rest.
		await preview.prepare();
		if (runId.current !== id) return;
		const every = Math.round((60 / bpm) * BEATS_PER_CHORD * 1000);
		steps.forEach((step, n) =>
			timers.current.push(
				setTimeout(() => {
					setPlaying(step.index);
					void preview.play(step.pitches);
				}, n * every),
			),
		);
		timers.current.push(setTimeout(stop, steps.length * every));
	};

	return { playing, loading: preview.isPreloading, start, stop };
}

/** The chords side by side, each on the shape the player paged to. */
export default function Board({ items, cards, transpose, capo, onChange, onTranspose, onCapo }: Props) {
	const router = useRouter();
	const [bpm, setBpm] = useState(DEFAULT_BOARD_BPM);
	const run = usePlayThrough();
	const cardsRef = useRef<HTMLDivElement>(null);
	const [adjustOpen, setAdjustOpen] = useState(false);

	// A board wider than its row scrolls sideways: keep the sounding card in view.
	useEffect(() => {
		const row = cardsRef.current;
		const card = run.playing === null ? null : row?.querySelector<HTMLElement>(`[data-card="${run.playing}"]`);
		if (!row || !card) return;
		const left = card.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
		const to = revealScrollLeft(row.scrollLeft, row.clientWidth, left, card.offsetWidth, 12);
		if (to !== null) row.scrollTo({ left: to, behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [run.playing]);
	const found = cards.filter((c) => c.status === "found").length;
	// A run plays the cards as they were when it started; any change ends it.
	const change = (next: BoardItem[]) => {
		run.stop();
		onChange(next);
	};

	function playThrough() {
		if (run.playing !== null) return run.stop();
		const steps = cards.flatMap((card, index) => {
			const shape = card.status === "found" ? shownShape(card) : undefined;
			return shape ? [{ index, pitches: shape.pitches.map((p) => p + capo) }] : [];
		});
		void run.start(steps, bpm);
	}

	function openInStrum() {
		let patternId = PRESET_STRUM_PATTERNS[0].id;
		try {
			patternId = localStorage.getItem(LAST_STRUM_PATTERN_KEY) ?? patternId;
		} catch {
			// no storage: the first preset
		}
		// The shapes as drawn, and the capo: Strum plays what is held and sounds it higher.
		const chords: BoardChord[] = cards.map((card) =>
			card.status === "found"
				? { chord: { root: card.root, suffix: card.suffix, voicingId: shownShape(card)?.id ?? null } }
				: { unknown: card.name },
		);
		stashHandoff(boardProgression(chords, patternId, capo));
		router.push("/strum");
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			toast("Link copied — it opens this board.");
		} catch {
			toast("Could not copy. The address bar holds the same link.");
		}
	}

	/** Transpose, capo and tempo: in the head on a desktop, in the Adjust sheet below it (`labelled` names the tempo there). */
	const steppers = (labelled: boolean) => (
		<>
			<div className="hb-control">
				<span className="hb-meta">Transpose</span>
				<Stepper
					label="Transpose"
					size="sm"
					value={transpose}
					onChange={(n) => {
						run.stop();
						onTranspose(n);
					}}
					min={-BOARD_TRANSPOSE_LIMIT}
					max={BOARD_TRANSPOSE_LIMIT}
				/>
			</div>
			<div className="hb-control">
				<span className="hb-meta">Capo</span>
				<Stepper
					label="Capo"
					size="sm"
					value={capo}
					onChange={(n) => {
						run.stop();
						onCapo(n);
					}}
					max={BOARD_CAPO_MAX}
				/>
			</div>
			<div className="hb-control">
				{labelled && <span className="hb-meta">Tempo</span>}
				<Stepper
					label="Tempo"
					size="sm"
					value={bpm}
					onChange={setBpm}
					min={STRUM_BPM_MIN}
					max={STRUM_BPM_MAX}
					unit={labelled ? undefined : "BPM"}
				/>
			</div>
		</>
	);

	return (
		<section className="hb-board" aria-label="Board">
			<div className="hb-board-head">
				<h2>Board</h2>
				<div className="hb-controls">{steppers(false)}</div>
				{/* Below the desktop width the steppers fold into one button and rise in a sheet, as Strum's and Tab's settings do. */}
				<Sheet
					open={adjustOpen}
					onOpenChange={setAdjustOpen}
					title="Transpose, capo and tempo"
					trigger={
						<Button variant="secondary" size="sm" className="hb-adjust" aria-label="Transpose, capo and tempo">
							<SlidersHorizontal aria-hidden />
							Adjust
							{(transpose !== 0 || capo !== 0) && <span className="hb-adjust-dot" aria-hidden />}
						</Button>
					}
				>
					<div className="hb-adjust-sheet" data-m="chords">
						{steppers(true)}
					</div>
				</Sheet>
				<Button size="sm" className="hb-play" disabled={found === 0} loading={run.loading} onClick={playThrough}>
					{/* Both labels laid in one cell, so the button is as wide either way. */}
					<span className="hb-swap">
						<span data-shown={run.playing === null || undefined}>
							<Play aria-hidden />
							Play through
						</span>
						<span data-shown={run.playing !== null || undefined}>
							<Square aria-hidden />
							Stop
						</span>
					</span>
				</Button>
			</div>
			<div className="hb-cards" ref={cardsRef}>
				{cards.length === 0 && (
					<p className="hb-meta hb-board-empty">
						The board is empty. Type a few chords above — <b>C Am F G</b> — and put them here side by side.
					</p>
				)}
				{cards.map((card, i) => {
					const name = withGlyphs(card.status === "found" ? chordSymbol(card.root, card.suffix) : card.name);
					const remove = (
						<CornerButton kind="remove" className="hb-remove" label={`Take ${name} off the board`} onClick={() => change(removeFromBoard(items, i))} />
					);
					if (card.status === "missing") {
						return (
							<div key={i} className="hb-card" data-miss="" style={{ "--i": i } as CSSProperties}>
								{remove}
								<span className="hb-card-name">{name}</span>
								<span className="hb-meta">No chord found</span>
								<ChordRequestButton key={card.name} query={card.name} label="Report as missing" />
							</div>
						);
					}
					const count = card.shapes?.length ?? 0;
					const at = count > 0 ? Math.min(card.item.shape, count - 1) : 0;
					const shape = shownShape(card);
					return (
						<div
							key={i}
							className="hb-card"
							data-card={i}
							data-now={run.playing === i ? "" : undefined}
							style={{ "--i": i } as CSSProperties}
						>
							{remove}
							<Link className="hb-card-name gp-focus" href={chordHref(card.root, card.suffix)}>
								<span className="gp-title">{name}</span>
							</Link>
							<span className="hb-card-sounds">{card.sounds && `sounds ${withGlyphs(card.sounds)}`}</span>
							<span className="hb-meta hb-card-label">{shape?.label ?? " "}</span>
							<span className="hb-card-dg" aria-hidden>
								{shape ? (
									<ChordDiagramSVG {...shape.def} rootMidi={rootPitchClass(card.root)} size="compact" />
								) : (
									<Skeleton className="h-24 w-24" />
								)}
							</span>
							<div className="hb-card-tools">
								<Button variant="ghost" size="xs" aria-label={`Move ${name} left`} disabled={i === 0} onClick={() => change(moveOnBoard(items, i, -1))}>
									<MoveLeft aria-hidden />
								</Button>
								<Button variant="ghost" size="xs" aria-label={`Previous shape of ${name}`} disabled={count < 2} onClick={() => change(pageOnBoard(items, i, -1, count))}>
									<ChevronLeft aria-hidden />
								</Button>
								<span className="hb-meta hb-count">{count > 0 ? `${at + 1}/${count}` : "–"}</span>
								<Button variant="ghost" size="xs" aria-label={`Next shape of ${name}`} disabled={count < 2} onClick={() => change(pageOnBoard(items, i, 1, count))}>
									<ChevronRight aria-hidden />
								</Button>
								<Button
									variant="ghost"
									size="xs"
									aria-label={`Move ${name} right`}
									disabled={i === cards.length - 1}
									onClick={() => change(moveOnBoard(items, i, 1))}
								>
									<MoveRight aria-hidden />
								</Button>
							</div>
						</div>
					);
				})}
			</div>
			{cards.length > 0 && (
				<div className="hb-board-foot">
					<Button variant="secondary" size="sm" disabled={found === 0} onClick={openInStrum}>
						Open in Strum as a progression
					</Button>
					<Button variant="secondary" size="sm" onClick={() => void copyLink()}>
						Copy a link
					</Button>
					<Button variant="ghost" size="sm" onClick={() => change([])}>
						Clear
					</Button>
					<p className="hb-hint">Add more with the search above, or the + on any chord in the library</p>
				</div>
			)}
		</section>
	);
}
