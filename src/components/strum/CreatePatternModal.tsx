"use client";

import { useState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
} from "lucide-react";
import {
	Bar,
	StrumPattern,
	StepValue,
	DEFAULT_STRUM_BPM,
} from "@/lib/strumPatterns";
import {
	toBars,
	validateBars,
	patternBpm,
	patternMeter,
	bpmRangeForMeter,
	clampBpmToMeter,
	rescaleBpmForMeter,
} from "@/lib/strumBars";
import {
	emptyBar,
	cycleCell,
	addCell,
	removeCell,
	clearBeat,
	copyBeat,
	swapBeats,
	setBarBeats,
	setBarCells,
	setCell,
	stepCellPosition,
} from "@/lib/strumBarEdit";
import {
	DEFAULT_METER,
	SUPPORTED_METERS,
	beatUnitLabel,
	meterLabel,
	allowedCellsPerBeat,
	beatsPerBar,
	cellCountLabel,
	naturalCellsPerBeat,
	metersEqual,
	stepCellsPerBeat,
	type Meter,
} from "@/lib/strumMeter";
import { patternNotation } from "@/lib/strumNotation";
import { parseRhythmInMeter } from "@/lib/strumAssistant/parseRhythm";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";
import { useBarHistory } from "./useBarHistory";

function StepIcon({ step }: { step: StepValue }) {
	if (step === "D") return <MoveDown className="size-4" />;
	if (step === "U") return <MoveUp className="size-4" />;
	if (step === "X") return <X className="size-4" />;
	return <Dot className="size-4" />;
}

/**
 * The pattern editor: name, default tempo and the pattern's single bar of
 * rhythm. Chords are not part of a pattern — a chord sequence is a
 * `ChordProgression`, edited in its own modal.
 */
export default function CreatePatternModal({
	open,
	onClose,
	onSave,
	user,
	editPattern,
}: {
	open: boolean;
	onClose: () => void;
	onSave: (pattern: StrumPattern) => void;
	user: User | null;
	editPattern?: StrumPattern;
}) {
	const router = useRouter();
	const [name, setName] = useState("");
	// Free text while typing so the field can be cleared; normalized on save.
	const [bpmInput, setBpmInput] = useState(String(DEFAULT_STRUM_BPM));
	// Held as a one-element Bar[] so the shared cell editors in strumBarEdit
	// apply unchanged; the bar's chord stays null throughout.
	const {
		bars,
		setBars,
		reset: resetBars,
		undo,
		redo,
		canUndo,
		canRedo,
	} = useBarHistory([emptyBar()]);
	// The bar's shape follows the meter: four two-cell beats in 4/4, two
	// three-cell beats in 6/8. Stored on the pattern because nothing else can
	// tell a compound beat's three cells from a triplet's.
	const [meter, setMeter] = useState<Meter>(DEFAULT_METER);
	const [nameError, setNameError] = useState(false);
	// Inline "Discard changes?" confirmation shown when the user tries to close
	// with unsaved edits. Rendered in the header in place of the close button.
	const [discardConfirm, setDiscardConfirm] = useState(false);
	// Serialized draft taken when the modal opened. Comparing the live draft
	// against it detects unsaved edits without flagging every mutation site.
	const pristineRef = useRef("");
	// Cell buttons by "beat:cell", so arrow keys can move focus without the grid
	// having to own a selection model of its own.
	const cellRefs = useRef(new Map<string, HTMLButtonElement>());
	// Beat columns, so a beat that was just copied or moved can announce itself.
	const beatRefs = useRef(new Map<number, HTMLDivElement>());

	const [showSignInPrompt, setShowSignInPrompt] = useState(false);

	/**
	 * The shortcut field: the bar written out as notation.
	 *
	 * A way in, not a second view of the grid — it holds what the player typed
	 * and is never written back to from the cells, the same bargain the chord
	 * shape editor's tab field strikes. Clicking a cell after typing leaves the
	 * text stale on purpose, rather than rewriting itself under the cursor.
	 */
	// The name field, so a save blocked on it can put the cursor where the answer
	// goes — a red border on a field the player cannot see is not an answer.
	const nameRef = useRef<HTMLInputElement>(null);
	const nameErrorId = useId();
	const [sequenceInput, setSequenceInput] = useState("");
	const [sequenceError, setSequenceError] = useState<string | null>(null);
	const sequenceFieldId = useId();

	const beats = bars[0].beats;
	// What the field's count is read against: 8 in 4/4, 6 in 6/8. Twice this many
	// characters halves every cell, which is the whole of the rule.
	const naturalBarCells = beatsPerBar(meter) * naturalCellsPerBeat(meter);

	/** Draw what has been typed, once it reads as a whole bar. */
	function applySequence(value: string) {
		// D, U and X are the alphabet; uppercasing as it is typed says so without
		// rejecting the keystroke. Same length in, same length out, so the caret
		// stays where the player left it.
		const written = value.toUpperCase();
		setSequenceInput(written);

		if (written.trim() === "") {
			setSequenceError(null);
			return;
		}
		if (written.includes("|")) {
			setSequenceError('A pattern is one bar — a chord sequence is where "|" belongs.');
			return;
		}
		const parsed = parseRhythmInMeter(written, meter);
		if (!parsed.ok) {
			setSequenceError(parsed.errors[0].message);
			return;
		}
		setSequenceError(null);
		setBars((prev) => setBarBeats(prev, 0, parsed.value.bars[0].beats));
	}

	/** The written bar no longer describes the grid — drop it rather than lie. */
	function clearSequence() {
		setSequenceInput("");
		setSequenceError(null);
	}

	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			const initialName = editPattern?.name ?? "";
			const initialBpm = editPattern ? patternBpm(editPattern) : DEFAULT_STRUM_BPM;
			const initialMeter = editPattern ? patternMeter(editPattern) : DEFAULT_METER;
			const initialBars = editPattern ? toBars(editPattern) : [emptyBar(initialMeter)];
			pristineRef.current = draftSnapshot(initialName, initialBpm, initialBars, initialMeter);
			setName(initialName);
			setBpmInput(String(initialBpm));
			resetBars(initialBars);
			setMeter(initialMeter);
			setNameError(false);
			setShowSignInPrompt(false);
			setDiscardConfirm(false);
			clearSequence();
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	function draftSnapshot(
		nameValue: string,
		bpmValue: number,
		barsValue: Bar[],
		meterValue: Meter,
	): string {
		return JSON.stringify({
			name: nameValue.trim(),
			bpm: bpmValue,
			bars: barsValue,
			meter: meterValue,
		});
	}

	/** An emptied field means "no opinion" — the default tempo, not a clamped 0. */
	function parsedBpm(): number {
		const raw = bpmInput.trim() === "" ? DEFAULT_STRUM_BPM : Number(bpmInput);
		return clampBpmToMeter(raw, meter);
	}

	function buildPattern(): StrumPattern {
		return {
			id: editPattern?.id ?? crypto.randomUUID(),
			name: name.trim(),
			beats,
			bpm: parsedBpm(),
			meter,
		};
	}

	/**
	 * Point the eye at a beat that just changed under it.
	 *
	 * No state and no effect: the column's DOM node survives the re-render, so
	 * one frame's wait is enough for it to be showing the new content before it
	 * pops. Driving this from state would mean setting state inside an effect to
	 * clear it again, which is a cascading render for a 220 ms flourish.
	 */
	function flashBeat(beatIdx: number) {
		if (prefersReducedMotion()) return;
		requestAnimationFrame(() => {
			beatRefs.current.get(beatIdx)?.animate(
				[
					{ transform: "scale(0.94)", opacity: 0.55 },
					{ transform: "scale(1)", opacity: 1 },
				],
				{ duration: 220, easing: SPRING_POP_EASING },
			);
		});
	}

	/** Copy this beat onto another, and point the eye at where it landed. */
	function copyBeatTo(from: number, to: number) {
		if (to < 0 || to >= bars[0].beats.length) return;
		setBars((prev) => copyBeat(prev, 0, from, to));
		flashBeat(to);
	}

	/** Swap this beat with a neighbour; the beat follows the eye to its new seat. */
	function moveBeat(from: number, to: number) {
		if (to < 0 || to >= bars[0].beats.length) return;
		setBars((prev) => swapBeats(prev, 0, from, to));
		flashBeat(to);
	}

	/**
	 * Typing beats clicking on a dense grid: a stroke is one key rather than one
	 * to three presses, and the arrows walk beat and bar boundaries as if the
	 * grid were the single line of cells it actually is.
	 */
	function handleCellKeyDown(
		e: React.KeyboardEvent<HTMLButtonElement>,
		beatIdx: number,
		cellIdx: number,
	) {
		const move = (direction: 1 | -1) => {
			const next = stepCellPosition(bars, { barIdx: 0, beatIdx, cellIdx }, direction);
			if (!next) return;
			e.preventDefault();
			cellRefs.current.get(`${next.beatIdx}:${next.cellIdx}`)?.focus();
		};
		const write = (value: StepValue) => {
			e.preventDefault();
			setBars((prev) => setCell(prev, 0, beatIdx, cellIdx, value));
		};

		// Duplicate-rightwards, on the shortcut editors use for duplicate-line.
		// preventDefault because the browser reads it as "bookmark this page".
		if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
			e.preventDefault();
			copyBeatTo(beatIdx, beatIdx + 1);
			return;
		}
		if ((e.metaKey || e.ctrlKey) && (e.key === "Backspace" || e.key === "Delete")) {
			e.preventDefault();
			setBars((prev) => clearBeat(prev, 0, beatIdx));
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

	function handleSave() {
		if (!name.trim()) {
			setNameError(true);
			nameRef.current?.focus();
			return;
		}
		const validation = validateBars(bars);
		if (!validation.ok) {
			console.error(
				"[CreatePatternModal] refusing to save malformed bars:",
				validation.errors,
			);
			return;
		}
		if (!user && !editPattern) {
			setShowSignInPrompt(true);
			return;
		}
		onSave(buildPattern());
		handleClose();
	}

	function handleSaveLocally() {
		onSave(buildPattern());
		handleClose();
	}

	function handleClose() {
		setName("");
		setBpmInput(String(DEFAULT_STRUM_BPM));
		resetBars([emptyBar()]);
		setMeter(DEFAULT_METER);
		setNameError(false);
		setShowSignInPrompt(false);
		setDiscardConfirm(false);
		clearSequence();
		onClose();
	}

	// True when the live draft differs from the snapshot taken on open.
	function isDirty(): boolean {
		return draftSnapshot(name, parsedBpm(), bars, meter) !== pristineRef.current;
	}

	/**
	 * Enter saves, from anywhere in the dialog. It stands down on a focused
	 * button (Enter presses that button), inside a textarea, and while either the
	 * discard question or the sign-in prompt is waiting on an answer of its own.
	 */
	function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		// Undo/redo, before the Enter-to-save check. Skipped inside a text field,
		// where the browser's own undo is the one the player means.
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
		if (discardConfirm || showSignInPrompt) return;
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

	// Entry point for every close affordance (header button, Cancel, outside
	// click, Escape). Guards against discarding unsaved edits.
	function requestClose() {
		if (isDirty()) setDiscardConfirm(true);
		else handleClose();
	}

	return (
		<>
			<Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestClose()}>
				<DialogContent
					showCloseButton={false}
					onKeyDown={handleDialogKeyDown}
					className="w-[calc(100%-2rem)] max-w-100 flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 rounded-none border border-line-strong shadow-none"
				>
					<DialogHeader className="shrink-0 flex-row items-center justify-between gap-2 p-4 pb-0">
						<DialogTitle>{editPattern ? "Edit pattern" : "Create pattern"}</DialogTitle>
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
									onClick={handleClose}
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
						{/* Name + default tempo */}
						<div className="flex flex-col gap-1.5">
							<div className="flex items-end gap-3">
								<div className="flex min-w-0 flex-1 flex-col gap-1.5">
									<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
										Pattern name
									</label>
									<input
										ref={nameRef}
										type="text"
										required
										aria-invalid={nameError}
										aria-describedby={nameError ? nameErrorId : undefined}
										value={name}
										onChange={(e) => {
											setName(e.target.value);
											if (nameError) setNameError(false);
										}}
										placeholder="e.g. My strum pattern"
										className={`w-full border bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent ${
											nameError ? "border-destructive" : "border-line-strong"
										}`}
									/>
								</div>
								<div className="flex w-20 shrink-0 flex-col gap-1.5">
									<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
										Meter
									</label>
									{/* Changing the meter rebuilds the bar: 4/4 and 6/8 do not
									    share a grid, so there is nothing meaningful to carry
									    across. A native select rather than the Radix one — the
									    surrounding fields are plain inputs, and a portalled
									    listbox inside a Dialog buys nothing here. */}
									<select
										value={meterLabel(meter)}
										onChange={(e) => {
											const next = SUPPORTED_METERS.find(
												(m) => meterLabel(m) === e.target.value,
											);
											if (!next || metersEqual(next, meter)) return;
											// Carry the tempo across so the pattern does not appear
											// to leap: the beat changes note value, so the number
											// has to move for the speed to stay put.
											setBpmInput(
												String(
													clampBpmToMeter(
														Math.round(rescaleBpmForMeter(parsedBpm(), meter, next)),
														next,
													),
												),
											);
											setMeter(next);
											setBars([emptyBar(next)]);
											// The bar is rebuilt from scratch, so whatever was
											// written for the old meter describes nothing now.
											clearSequence();
										}}
										aria-label="Time signature"
										className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
									>
										{SUPPORTED_METERS.map((m) => (
											<option key={meterLabel(m)} value={meterLabel(m)}>
												{meterLabel(m)}
											</option>
										))}
									</select>
								</div>
								<div className="flex w-20 shrink-0 flex-col gap-1.5">
									<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
										BPM
									</label>
									{/* Kept as text state so the field can be emptied mid-edit; the
									    value is clamped to 40–220 on save and on blur. */}
									<input
										type="number"
										min={bpmRangeForMeter(meter).min}
										max={bpmRangeForMeter(meter).max}
										value={bpmInput}
										onChange={(e) => setBpmInput(e.target.value)}
										onBlur={() => setBpmInput(String(parsedBpm()))}
										aria-label={`Default tempo in ${beatUnitLabel(meter)}s per minute`}
										className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
									/>
									{/* 90 in 6/8 and 90 in 4/4 are not the same pulse. */}
									{/* <span className="font-mono text-[9px] leading-tight text-ink-faint">
										per {beatUnitLabel(meter)}
									</span> */}
								</div>
							</div>
							{nameError && (
								<p id={nameErrorId} className="text-xs text-destructive">
									Pattern name is required
								</p>
							)}
						</div>

						{/* The pattern's single bar */}
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Pattern
								</span>
								{/* The written form doubles as the pattern's description. */}
								<span className="whitespace-pre font-mono text-[9px] text-ink-faint">
									{patternNotation(beats)}
								</span>
							</div>

							{/* Divide the whole bar at once. Setting sixteenths beat by beat
							    took four presses before a single stroke could be drawn. */}
							<div className="flex items-center gap-1">
								<span className="mr-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Divide
								</span>
								{allowedCellsPerBeat(meter).map((cells) => {
									const active = beats.every((b) => b.length === cells);
									return (
										<button
											key={cells}
											type="button"
											onClick={() => setBars((prev) => setBarCells(prev, 0, cells))}
											aria-pressed={active}
											className={`border px-2 py-1 font-mono text-[11px] tracking-[0.04em] transition-[color,border-color] duration-(--dur-hover) ease-out focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1 ${
												active
													? "border-denim text-denim-accent"
													: "border-line-strong text-ink-dim hover:border-denim hover:text-denim-accent"
											}`}
										>
											{cellCountLabel(meter, cells)}
										</button>
									);
								})}

								<div className="ml-auto flex gap-1">
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
							</div>

							<div className="flex flex-col gap-1.5 border-l border-line-strong pl-2">
								<div className="flex gap-2">
									{beats.map((beat, beatIdx) => (
										<div
											key={beatIdx}
											ref={(el) => {
												if (el) beatRefs.current.set(beatIdx, el);
												else beatRefs.current.delete(beatIdx);
											}}
											className="group flex-1 flex flex-col gap-1.5"
										>
											{/* Cells. Plain CSS hover — the highlight is presentation,
											    not state, so it never touches React. */}
											<div className="flex border border-line-strong py-2 transition-colors group-hover:border-denim">
												{beat.map((cell, cellIdx) => (
													<button
														key={cellIdx}
														ref={(el) => {
															const key = `${beatIdx}:${cellIdx}`;
															if (el) cellRefs.current.set(key, el);
															else cellRefs.current.delete(key);
														}}
														onClick={() =>
															setBars((prev) =>
																cycleCell(
																	prev,
																	0,
																	beatIdx,
																	cellIdx,
																),
															)
														}
														onKeyDown={(e) =>
															handleCellKeyDown(e, beatIdx, cellIdx)
														}
														aria-label={`Beat ${beatIdx + 1} cell ${cellIdx + 1}`}
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
														setBars((prev) =>
															removeCell(prev, 0, beatIdx, meter),
														)
													}
													// The legal divisions are a set, not a range: a
													// quarter beat steps 2-3-4, a dotted beat 3-6.
													disabled={stepCellsPerBeat(meter, beat.length, -1) === null}
													className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												>
													<Minus size={10} />
												</button>
												{/* Clearing sits between the steppers: all three act on
												    this beat's own contents, where the row below moves it
												    around the bar. */}
												<button
													type="button"
													onClick={() => setBars((prev) => clearBeat(prev, 0, beatIdx))}
													disabled={beat.every((cell) => cell === "")}
													aria-label={`Clear beat ${beatIdx + 1}`}
													title="Clear this beat (Cmd/Ctrl+Backspace)"
													// The one beat control that throws work away, so it warns in the
													// destructive colour rather than the denim the others share.
													className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-destructive hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												>
													<Eraser size={10} />
												</button>
												<button
													onClick={() =>
														setBars((prev) => addCell(prev, 0, beatIdx, meter))
													}
													disabled={stepCellsPerBeat(meter, beat.length, 1) === null}
													className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												>
													<Plus size={10} />
												</button>
											</div>

											{/* Beat operations, kept off the cell-count row: three more
											    controls squeezed beside +/- would each be a sliver. */}
											<div className="flex gap-1">
												<button
													type="button"
													onClick={() => moveBeat(beatIdx, beatIdx - 1)}
													disabled={beatIdx === 0}
													aria-label={`Move beat ${beatIdx + 1} left`}
													title="Move this beat left"
													className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												>
													<ChevronLeft size={10} />
												</button>
												{/* Copy this beat onto the next. Copying, not inserting:
												    the bar's beat count belongs to the meter. Clicking
												    along fills the bar with one figure. */}
												<button
													type="button"
													onClick={() => copyBeatTo(beatIdx, beatIdx + 1)}
													disabled={beatIdx >= beats.length - 1}
													aria-label={`Copy beat ${beatIdx + 1} onto beat ${beatIdx + 2}`}
													title="Copy this beat to the next"
													className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												>
													<Copy size={10} />
												</button>
												<button
													type="button"
													onClick={() => moveBeat(beatIdx, beatIdx + 1)}
													disabled={beatIdx >= beats.length - 1}
													aria-label={`Move beat ${beatIdx + 1} right`}
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
						</div>

						{/* The written way in. The grid is what this editor is, so the field
						    sits under it: a player who already knows the pattern as letters
						    types it once instead of clicking sixteen cells. */}
						<div className="flex flex-col gap-1">
							<label
								htmlFor={sequenceFieldId}
								className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim"
							>
								Or, type in the strumming sequence..
							</label>
							<input
								id={sequenceFieldId}
								type="text"
								inputMode="text"
								autoComplete="off"
								spellCheck={false}
								value={sequenceInput}
								onChange={(e) => applySequence(e.target.value)}
								onKeyDown={(e) => {
									if (e.key !== "Enter") return;
									// The dialog saves on Enter; writing a bar must not also close
									// the editor it is being written in.
									e.preventDefault();
									e.stopPropagation();
									applySequence(sequenceInput);
								}}
								placeholder="D DU UD"
								aria-label="Strumming sequence"
								aria-describedby={`${sequenceFieldId}-hint`}
								className={`h-(--h-control) w-full border bg-surface px-2 font-mono text-xs tracking-[0.12em] text-ink placeholder:tracking-normal placeholder:text-ink-faint focus-visible:outline-none ${
									sequenceError
										? "border-destructive"
										: "border-line-strong focus-visible:border-denim"
								}`}
							/>
							<p
								id={`${sequenceFieldId}-hint`}
								className={`font-mono text-[10px] leading-snug ${
									sequenceError ? "text-destructive" : "text-ink-faint"
								}`}
							>
								{sequenceError ??
									`D down, U up, X muted, a space for a cell nobody strikes. The subdivision follows the count — ${naturalBarCells} cells fill a bar of ${meterLabel(meter)}.`}
							</p>
						</div>

						{/* Sign-in prompt — shown when user is not logged in and tries to save */}
						{showSignInPrompt && (
							<div className="border border-denim/20 bg-denim-tint px-4 py-3">
								<p className="text-sm text-ink">
									Sign in to keep your patterns safe across devices.
								</p>
							</div>
						)}
					</div>

					<div className="flex items-center justify-end gap-2 shrink-0 border-t border-line bg-popover px-4 py-3">
						{showSignInPrompt ? (
							<>
								<button
									onClick={handleSaveLocally}
									className="px-4 py-2 border border-line-strong text-ink-dim text-sm hover:border-denim hover:text-denim-accent active:bg-denim-tint transition-colors"
								>
									Save locally anyway
								</button>
								<Button
									onClick={() => {
										onSave(buildPattern());
										router.push("/auth?redirect=/strum");
									}}
									className="h-9 px-4 rounded-none bg-denim text-on-denim hover:bg-denim-accent active:bg-denim-accent disabled:opacity-40"
								>
									Sign in
								</Button>
							</>
						) : (
							<>
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
									{editPattern ? "Save changes" : "Save pattern"}
								</Button>
							</>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
