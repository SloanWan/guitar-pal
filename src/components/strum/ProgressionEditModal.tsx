"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	MoveDown,
	MoveUp,
	X,
	Dot,
	Plus,
	Minus,
	Copy,
	Eraser,
	ChevronLeft,
	ChevronRight,
	Undo2,
	Redo2,
	Trash2,
	ArrowUp,
	ArrowDown,
} from "lucide-react";
import {
	Bar,
	ChordProgression,
	StepValue,
	STRUM_BPM_MIN,
	STRUM_BPM_MAX,
	STRUM_CAPO_MAX,
} from "@/lib/strumPatterns";
import { barPlaceholder, validateBars, normalizeBpm } from "@/lib/strumBars";
import {
	allowedCellsPerBeat,
	cellCountLabel,
	stepCellsPerBeat,
	type Meter,
} from "@/lib/strumMeter";
import {
	addBar,
	clearBeat,
	copyBeat,
	swapBeats,
	setBarCells,
	setCell,
	stepCellPosition,
	removeBar,
	duplicateBar,
	swapBars,
	setBarChord,
	cycleCell,
	addCell,
	removeCell,
} from "@/lib/strumBarEdit";
import { defaultProgressionName, normalizeCapo, progressionCapo } from "@/lib/strumProgressions";
import { chordIndexWithUser, type UserChordVoicing } from "@/lib/userChordVoicings";
import ChordSearchSelect from "./ChordSearchSelect";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";
import { useBarHistory } from "./useBarHistory";

function StepIcon({ step }: { step: StepValue }) {
	if (step === "D" || step === "D3" || step === "DG") return <MoveDown className="size-4" />;
	if (step === "U" || step === "U3" || step === "UG") return <MoveUp className="size-4" />;
	if (step === "X") return <X className="size-4" />;
	return <Dot className="size-4" />;
}

/**
 * The chord progression editor: several bars, each with its own rhythm and
 * chord, plus the sequence's own name, tempo and capo. Progressions are created
 * by typing a chord sequence in the workspace; this editor only changes one
 * that already exists.
 */
export default function ProgressionEditModal({
	open,
	onClose,
	onSave,
	progression,
	patternBpm,
	meter,
	userVoicings = [],
}: {
	open: boolean;
	onClose: () => void;
	onSave: (update: { bars: Bar[]; name: string; bpm?: number; capo: number }) => void;
	/** The progression being edited. */
	progression: ChordProgression;
	/** Tempo the progression falls back to when it carries none of its own. */
	patternBpm: number;
	/** The pattern's time signature. A progression never has one of its own. */
	meter: Meter;
	/**
	 * The player's own shapes. Their chords join the library's in the bar chord
	 * fields, so a chord written once can be typed again here.
	 */
	userVoicings?: readonly UserChordVoicing[];
}) {
	const {
		bars,
		setBars,
		reset: resetBars,
		undo,
		redo,
		canUndo,
		canRedo,
	} = useBarHistory(progression.bars);
	// Cell buttons by "bar:beat:cell", so arrow keys can walk the whole
	// progression as the one line of cells it is.
	const cellRefs = useRef(new Map<string, HTMLButtonElement>());
	// Beat columns, keyed "bar:beat", so one that was just copied or moved pops.
	const beatRefs = useRef(new Map<string, HTMLDivElement>());
	const [name, setName] = useState(progression.name ?? "");
	// Free text so the field can be emptied — empty means "follow the pattern".
	const [bpmInput, setBpmInput] = useState(
		progression.bpm === undefined ? "" : String(progression.bpm),
	);
	// Free text too — empty reads as "no capo".
	const [capoInput, setCapoInput] = useState(
		progressionCapo(progression) === 0 ? "" : String(progressionCapo(progression)),
	);
	// Inline "Discard changes?" confirmation shown when the user tries to close
	// with unsaved edits. Rendered in the header in place of the close button.
	const [discardConfirm, setDiscardConfirm] = useState(false);
	// Serialized bars taken when the modal opened, so unsaved edits are detected
	// without flagging every mutation site.
	const pristineRef = useRef("");
	// Browsable (root, suffix) pairs, fetched once per modal open and shared by
	// every bar's selector rather than refetched per bar.
	const [chordIndex, setChordIndex] = useState<readonly ChordIndexEntry[]>([]);
	// The library's chords plus the ones the player's own shapes are filed under.
	const searchIndex = useMemo(
		() => chordIndexWithUser(chordIndex, userVoicings),
		[chordIndex, userVoicings],
	);
	// Index of the bar most recently copied or moved. That block gets a denim
	// glow so the user can find where the edit landed.
	const [highlightedBarIdx, setHighlightedBarIdx] = useState<number | null>(null);
	// The bar that just moved and which way it travelled, so its landing nudge
	// can play. Cleared before re-setting, otherwise a repeated move would not
	// re-fire the CSS animation.
	const [moveNudge, setMoveNudge] = useState<{ idx: number; dir: "up" | "down" } | null>(
		null,
	);

	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			const initialName = progression.name ?? "";
			const initialBpm = progression.bpm === undefined ? "" : String(progression.bpm);
			const initialCapo =
				progressionCapo(progression) === 0 ? "" : String(progressionCapo(progression));
			pristineRef.current = draftSnapshot(
				progression.bars,
				initialName,
				initialBpm,
				initialCapo,
			);
			resetBars(progression.bars);
			setName(initialName);
			setBpmInput(initialBpm);
			setCapoInput(initialCapo);
			setDiscardConfirm(false);
			setHighlightedBarIdx(null);
			setMoveNudge(null);
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	useEffect(() => {
		if (!open || chordIndex.length > 0) return;
		let cancelled = false;
		getChordIndex()
			.then((index) => {
				if (!cancelled) setChordIndex(index);
			})
			.catch((e: unknown) => console.error("[ProgressionEditModal] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, [open, chordIndex.length]);

	// Clear the copy/move highlight on the next pointer press anywhere. A press on
	// a copy/move control clears here first (pointerdown precedes click), then that
	// control's click re-sets the highlight to its own bar.
	useEffect(() => {
		if (!open) return;
		function handlePointerDown() {
			setHighlightedBarIdx(null);
			setMoveNudge(null);
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [open]);

	function handleCopyBar(barIdx: number) {
		setBars((prev) => {
			const next = duplicateBar(prev, barIdx);
			// The copy lands last; highlight it only if one was actually made.
			setHighlightedBarIdx(next === prev ? null : next.length - 1);
			return next;
		});
	}

	function handleMoveBar(barIdx: number, dir: "up" | "down") {
		const target = dir === "up" ? barIdx - 1 : barIdx + 1;
		setBars((prev) => {
			const next = swapBars(prev, barIdx, target);
			if (next !== prev) {
				setHighlightedBarIdx(target);
				setMoveNudge({ idx: target, dir });
			}
			return next;
		});
	}

	function draftSnapshot(
		barsValue: Bar[],
		nameValue: string,
		bpmValue: string,
		capoValue: string,
	): string {
		return JSON.stringify({
			bars: barsValue,
			name: nameValue.trim(),
			bpm: bpmValue.trim(),
			capo: capoValue.trim(),
		});
	}

	/** Point the eye at a beat that just changed under it. See CreatePatternModal. */
	function flashBeat(barIdx: number, beatIdx: number) {
		if (prefersReducedMotion()) return;
		requestAnimationFrame(() => {
			beatRefs.current.get(`${barIdx}:${beatIdx}`)?.animate(
				[
					{ transform: "scale(0.94)", opacity: 0.55 },
					{ transform: "scale(1)", opacity: 1 },
				],
				{ duration: 220, easing: SPRING_POP_EASING },
			);
		});
	}

	function copyBeatTo(barIdx: number, from: number, to: number) {
		if (to < 0 || to >= bars[barIdx].beats.length) return;
		setBars((prev) => copyBeat(prev, barIdx, from, to));
		flashBeat(barIdx, to);
	}

	function moveBeat(barIdx: number, from: number, to: number) {
		if (to < 0 || to >= bars[barIdx].beats.length) return;
		setBars((prev) => swapBeats(prev, barIdx, from, to));
		flashBeat(barIdx, to);
	}

	/** Typing a stroke, and arrowing across beat and bar boundaries. */
	function handleCellKeyDown(
		e: React.KeyboardEvent<HTMLButtonElement>,
		barIdx: number,
		beatIdx: number,
		cellIdx: number,
	) {
		const move = (direction: 1 | -1) => {
			const next = stepCellPosition(bars, { barIdx, beatIdx, cellIdx }, direction);
			if (!next) return;
			e.preventDefault();
			cellRefs.current.get(`${next.barIdx}:${next.beatIdx}:${next.cellIdx}`)?.focus();
		};
		const write = (value: StepValue) => {
			e.preventDefault();
			setBars((prev) => setCell(prev, barIdx, beatIdx, cellIdx, value));
		};

		// Duplicate-rightwards, on the shortcut editors use for duplicate-line.
		if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
			e.preventDefault();
			copyBeatTo(barIdx, beatIdx, beatIdx + 1);
			return;
		}
		if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
			e.preventDefault();
			setBars((prev) => clearBeat(prev, barIdx, beatIdx));
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		switch (e.key) {
			case "ArrowRight":
				return move(1);
			case "ArrowLeft":
				return move(-1);
			case "d":
			case "D":
				return write("D");
			case "u":
			case "U":
				return write("U");
			case "x":
			case "X":
				return write("X");
			case "Backspace":
			case "Delete":
				return write("");
			default:
				return;
		}
	}

	/** An emptied tempo field means "play at the pattern's tempo". */
	function parsedBpm(): number | undefined {
		return bpmInput.trim() === "" ? undefined : normalizeBpm(Number(bpmInput));
	}

	/** An emptied capo field means "no capo". */
	function parsedCapo(): number {
		return capoInput.trim() === "" ? 0 : normalizeCapo(Number(capoInput));
	}

	function handleSave() {
		const validation = validateBars(bars);
		if (!validation.ok) {
			console.error(
				"[ProgressionEditModal] refusing to save malformed bars:",
				validation.errors,
			);
			return;
		}
		onSave({ bars, name: name.trim(), bpm: parsedBpm(), capo: parsedCapo() });
		onClose();
	}

	/**
	 * Enter saves, from anywhere in the dialog — the same key that commits a
	 * one-line form everywhere else. It stands down on a focused button (Enter
	 * presses that button), inside a textarea, and while the discard question is
	 * up; the chord fields stop the key before it ever reaches here.
	 */
	function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		// Undo/redo first; skipped inside a text field, where the browser's own
		// undo is the one the player means.
		const mod = e.metaKey || e.ctrlKey;
		const inTextField =
			e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
		if (mod && !inTextField && (e.key === "z" || e.key === "Z")) {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
			return;
		}
		if (mod && !inTextField && (e.key === "y" || e.key === "Y")) {
			e.preventDefault();
			redo();
			return;
		}

		if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
		if (discardConfirm) return;
		if (
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLButtonElement ||
			e.target instanceof HTMLAnchorElement
		) {
			return;
		}
		e.preventDefault();
		handleSave();
	}

	function requestClose() {
		if (draftSnapshot(bars, name, bpmInput, capoInput) !== pristineRef.current)
			setDiscardConfirm(true);
		else onClose();
	}

	function discardAndClose() {
		setDiscardConfirm(false);
		onClose();
	}

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestClose()}>
			<DialogContent
				showCloseButton={false}
				onKeyDown={handleDialogKeyDown}
				className="w-full max-w-120 md:max-w-[58rem] flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 rounded-none border border-line-strong shadow-none"
			>
				<DialogHeader className="shrink-0 flex-row items-center justify-between gap-2 p-4 pb-0">
					<DialogTitle>Edit progression</DialogTitle>
					{discardConfirm ? (
						<div className="flex items-center gap-2">
							<span className="text-xs text-ink-dim">Discard changes?</span>
							<button
								onClick={() => setDiscardConfirm(false)}
								className="h-8 px-3 text-xs font-medium text-ink-dim transition-colors hover:bg-raise active:bg-denim-tint"
							>
								Keep editing
							</button>
							<button
								onClick={discardAndClose}
								className="h-8 px-3 text-xs font-semibold text-white bg-destructive transition-colors hover:bg-destructive/90"
							>
								Discard
							</button>
						</div>
					) : (
						<button
							onClick={requestClose}
							aria-label="Close"
							className="flex h-8 w-8 items-center justify-center text-ink-dim transition-colors hover:bg-raise hover:text-ink active:bg-denim-tint"
						>
							<X size={18} />
						</button>
					)}
				</DialogHeader>

				<div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 min-h-0">
					{/* Name + tempo + capo */}
					<div className="flex flex-wrap items-end gap-3">
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Progression name
							</label>
							{/* Left empty, the chord abbreviations name it. */}
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={defaultProgressionName(bars)}
								maxLength={60}
								className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
							/>
						</div>
						<div className="flex w-24 shrink-0 flex-col gap-1.5">
							<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								BPM
							</label>
							{/* Empty = follow the pattern's tempo, shown as the placeholder. */}
							<input
								type="number"
								min={STRUM_BPM_MIN}
								max={STRUM_BPM_MAX}
								value={bpmInput}
								onChange={(e) => setBpmInput(e.target.value)}
								onBlur={() => {
									const parsed = parsedBpm();
									setBpmInput(parsed === undefined ? "" : String(parsed));
								}}
								placeholder={String(patternBpm)}
								aria-label="Tempo in BPM — empty follows the pattern"
								className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
							/>
						</div>
						<div className="flex w-24 shrink-0 flex-col gap-1.5">
							<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Capo
							</label>
							{/* The chords name the shapes fingered behind the capo, so playback
							    sounds this many semitones higher. Empty = no capo. */}
							<input
								type="number"
								min={0}
								max={STRUM_CAPO_MAX}
								value={capoInput}
								onChange={(e) => setCapoInput(e.target.value)}
								onBlur={() => {
									const parsed = parsedCapo();
									setCapoInput(parsed === 0 ? "" : String(parsed));
								}}
								placeholder="0"
								aria-label="Capo fret — empty means no capo"
								className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
							/>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between gap-3">
							<span className="truncate font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								{defaultProgressionName(bars)}
							</span>
							<span className="shrink-0 font-mono text-[9px] text-ink-faint">
								{bars.length} bars
							</span>
						</div>

						{/* Undo/redo for the whole grid, not for one bar — the history is
						    of the progression, so the controls sit above all of it. */}
						<div className="mb-2 flex justify-end gap-1">
							<button
								type="button"
								onClick={undo}
								disabled={!canUndo}
								aria-label="Undo"
								title="Undo (Cmd/Ctrl+Z)"
								className="flex h-6 w-7 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
							>
								<Undo2 size={11} />
							</button>
							<button
								type="button"
								onClick={redo}
								disabled={!canRedo}
								aria-label="Redo"
								title="Redo (Cmd/Ctrl+Shift+Z)"
								className="flex h-6 w-7 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
							>
								<Redo2 size={11} />
							</button>
						</div>

						{/* One bar per row, two per row from md upwards — the desktop dialog
						    is wide enough for two, and a lone bar keeps the full width. */}
						<div
							className={`grid grid-cols-1 gap-3 ${
								bars.length > 1 ? "md:grid-cols-2" : ""
							}`}
						>
							{bars.map((bar, barIdx) => (
								<div
									key={barIdx}
									className={`flex flex-col gap-1.5 border-l pl-2 transition-shadow duration-200 ${
										highlightedBarIdx === barIdx
											? "border-denim shadow-[0_0_0_1px_var(--color-denim),0_0_12px_var(--denim-glow)]"
											: "border-line-strong"
									} ${
										moveNudge?.idx === barIdx
											? moveNudge.dir === "up"
												? "sb-nudge-up"
												: "sb-nudge-down"
											: ""
									}`}
								>
									{/* Bar header — number, chord, copy / move / remove */}
									<div className="flex items-center gap-2">
										<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">
											{barIdx + 1}
										</span>
										<ChordSearchSelect
											chord={bar.chord}
											unknownLabel={barPlaceholder(bar)}
											onChange={(chord) =>
												setBars((prev) => setBarChord(prev, barIdx, chord))
											}
											index={searchIndex}
											ariaLabel={`Chord for bar ${barIdx + 1}`}
										/>
										<div className="ml-auto flex items-center">
											<button
												onClick={() => handleCopyBar(barIdx)}
												aria-label={`Copy bar ${barIdx + 1}`}
												title="Copy bar — the copy is added at the end"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim transition-colors hover:bg-denim-tint hover:text-denim disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim"
											>
												<Copy size={14} />
											</button>
											<button
												onClick={() => handleMoveBar(barIdx, "up")}
												disabled={barIdx === 0}
												aria-label={`Move bar ${barIdx + 1} up`}
												title="Move bar up"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim transition-colors hover:bg-denim-tint hover:text-denim disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim"
											>
												<ArrowUp size={14} />
											</button>
											<button
												onClick={() => handleMoveBar(barIdx, "down")}
												disabled={barIdx === bars.length - 1}
												aria-label={`Move bar ${barIdx + 1} down`}
												title="Move bar down"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim transition-colors hover:bg-denim-tint hover:text-denim disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim"
											>
												<ArrowDown size={14} />
											</button>
											<button
												onClick={() => setBars((prev) => removeBar(prev, barIdx))}
												disabled={bars.length <= 1}
												aria-label={`Remove bar ${barIdx + 1}`}
												title="Delete bar"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim transition-colors hover:bg-denim-tint hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim"
											>
												<Trash2 size={14} />
											</button>
										</div>
									</div>

									{/* Divide this bar at once, rather than beat by beat. */}
									<div className="mb-1.5 flex items-center gap-1">
										<span className="mr-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
											Divide
										</span>
										{allowedCellsPerBeat(meter).map((cells) => {
											const active = bar.beats.every((b) => b.length === cells);
											return (
												<button
													key={cells}
													type="button"
													onClick={() =>
														setBars((prev) => setBarCells(prev, barIdx, cells))
													}
													aria-pressed={active}
													aria-label={`Bar ${barIdx + 1} in ${cellCountLabel(meter, cells)}`}
													className={`border px-2 py-0.5 font-mono text-[11px] tracking-[0.04em] transition-[color,border-color] duration-(--dur-hover) ease-out focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 ${
														active
															? "border-denim text-denim-accent"
															: "border-line-strong text-ink-dim hover:border-denim hover:text-denim-accent"
													}`}
												>
													{cellCountLabel(meter, cells)}
												</button>
											);
										})}
									</div>

									{/* Beats */}
									<div className="flex gap-2">
										{bar.beats.map((beat, beatIdx) => (
											<div
												key={beatIdx}
												ref={(el) => {
													const key = `${barIdx}:${beatIdx}`;
													if (el) beatRefs.current.set(key, el);
													else beatRefs.current.delete(key);
												}}
												className="group flex-1 flex flex-col gap-1.5"
											>
												{/* Cells, with a plain-CSS hover highlight. */}
												<div className="flex border border-line-strong py-2 transition-colors group-hover:border-denim">
													{beat.map((cell, cellIdx) => (
														<button
															key={cellIdx}
															ref={(el) => {
																const key = `${barIdx}:${beatIdx}:${cellIdx}`;
																if (el) cellRefs.current.set(key, el);
																else cellRefs.current.delete(key);
															}}
															onClick={() =>
																setBars((prev) =>
																	cycleCell(prev, barIdx, beatIdx, cellIdx),
																)
															}
															onKeyDown={(e) =>
																handleCellKeyDown(e, barIdx, beatIdx, cellIdx)
															}
															aria-label={`Bar ${barIdx + 1} beat ${beatIdx + 1} cell ${cellIdx + 1}`}
															className="flex-1 flex justify-center items-center text-ink-dim hover:text-denim hover:bg-denim-tint focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-[-2px] transition-colors"
														>
															<StepIcon step={cell} />
														</button>
													))}
												</div>
												{/* Cell count controls */}
												<div className="flex gap-1">
													<button
														onClick={() =>
															setBars((prev) => removeCell(prev, barIdx, beatIdx, meter))
														}
														// The legal divisions are a set, not a range: a
														// quarter beat steps 2-3-4, a dotted beat 3-6.
														disabled={
															stepCellsPerBeat(meter, beat.length, -1) === null
														}
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Minus size={10} />
													</button>
													{/* Clearing sits between the steppers: all three act on
													    this beat's own contents, where the row below moves
													    it around the bar. */}
													<button
														type="button"
														onClick={() =>
															setBars((prev) => clearBeat(prev, barIdx, beatIdx))
														}
														disabled={beat.every((cell) => cell === "")}
														aria-label={`Clear bar ${barIdx + 1} beat ${beatIdx + 1}`}
														title="Clear this beat (Cmd/Ctrl+Backspace)"
														// The one beat control that throws work away, so it warns in the
														// destructive colour rather than the denim the others share.
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-destructive hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Eraser size={10} />
													</button>
													<button
														onClick={() =>
															setBars((prev) => addCell(prev, barIdx, beatIdx, meter))
														}
														disabled={
															stepCellsPerBeat(meter, beat.length, 1) === null
														}
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Plus size={10} />
													</button>
												</div>

												{/* Beat operations on their own row: three more controls
												    beside +/- would each be a sliver. */}
												<div className="flex gap-1">
													<button
														type="button"
														onClick={() => moveBeat(barIdx, beatIdx, beatIdx - 1)}
														disabled={beatIdx === 0}
														aria-label={`Move bar ${barIdx + 1} beat ${beatIdx + 1} left`}
														title="Move this beat left"
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<ChevronLeft size={10} />
													</button>
													{/* Copy this beat onto the next. Copying, not inserting:
													    the bar's beat count belongs to the meter. */}
													<button
														type="button"
														onClick={() => copyBeatTo(barIdx, beatIdx, beatIdx + 1)}
														disabled={beatIdx >= bar.beats.length - 1}
														aria-label={`Copy bar ${barIdx + 1} beat ${beatIdx + 1} onto beat ${beatIdx + 2}`}
														title="Copy this beat to the next"
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Copy size={10} />
													</button>
													<button
														type="button"
														onClick={() => moveBeat(barIdx, beatIdx, beatIdx + 1)}
														disabled={beatIdx >= bar.beats.length - 1}
														aria-label={`Move bar ${barIdx + 1} beat ${beatIdx + 1} right`}
														title="Move this beat right"
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<ChevronRight size={10} />
													</button>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>

						<button
							onClick={() => setBars((prev) => addBar(prev, meter))}
							className="flex items-center justify-center gap-1.5 border border-dashed border-line-strong py-2 text-xs text-ink-dim transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
						>
							<Plus size={12} />
							Add bar
						</button>
					</div>
				</div>

				<div className="flex items-center justify-end gap-2 shrink-0 border-t border-line bg-popover px-4 py-3">
					<button
						onClick={requestClose}
						className="px-4 py-2 border border-line-strong text-ink-dim text-sm hover:border-denim hover:text-denim-accent active:bg-denim-tint transition-colors"
					>
						Cancel
					</button>
					<Button
						onClick={handleSave}
						className="h-9 px-4 rounded-none bg-denim text-on-denim hover:bg-denim-accent active:bg-denim-accent disabled:opacity-40"
					>
						Save changes
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
