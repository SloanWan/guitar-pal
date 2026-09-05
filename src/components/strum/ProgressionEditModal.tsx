"use client";

import { useState, useEffect, useRef } from "react";
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
	Trash2,
	Copy,
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
import { validateBars, MAX_CELLS_PER_BEAT, normalizeBpm } from "@/lib/strumBars";
import {
	addBar,
	removeBar,
	duplicateBar,
	swapBars,
	setBarChord,
	cycleCell,
	addCell,
	removeCell,
	MAX_BARS,
	MIN_CELLS_PER_BEAT,
} from "@/lib/strumBarEdit";
import { defaultProgressionName, normalizeCapo, progressionCapo } from "@/lib/strumProgressions";
import ChordSearchSelect from "./ChordSearchSelect";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";

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
}: {
	open: boolean;
	onClose: () => void;
	onSave: (update: { bars: Bar[]; name: string; bpm?: number; capo: number }) => void;
	/** The progression being edited. */
	progression: ChordProgression;
	/** Tempo the progression falls back to when it carries none of its own. */
	patternBpm: number;
}) {
	const [bars, setBars] = useState<Bar[]>(progression.bars);
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
			setBars(progression.bars);
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
								{bars.length}/{MAX_BARS} bars
							</span>
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
											onChange={(chord) =>
												setBars((prev) => setBarChord(prev, barIdx, chord))
											}
											index={chordIndex}
											ariaLabel={`Chord for bar ${barIdx + 1}`}
										/>
										<div className="ml-auto flex items-center">
											<button
												onClick={() => handleCopyBar(barIdx)}
												disabled={bars.length >= MAX_BARS}
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

									{/* Beats */}
									<div className="flex gap-2">
										{bar.beats.map((beat, beatIdx) => (
											<div key={beatIdx} className="flex-1 flex flex-col gap-1.5">
												{/* Cells */}
												<div className="flex border border-line-strong py-2">
													{beat.map((cell, cellIdx) => (
														<button
															key={cellIdx}
															onClick={() =>
																setBars((prev) =>
																	cycleCell(prev, barIdx, beatIdx, cellIdx),
																)
															}
															className="flex-1 flex justify-center items-center text-ink-dim hover:text-denim hover:bg-denim-tint transition-colors"
														>
															<StepIcon step={cell} />
														</button>
													))}
												</div>
												{/* Cell count controls */}
												<div className="flex gap-1">
													<button
														onClick={() =>
															setBars((prev) => removeCell(prev, barIdx, beatIdx))
														}
														disabled={beat.length <= MIN_CELLS_PER_BEAT}
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Minus size={10} />
													</button>
													<button
														onClick={() =>
															setBars((prev) => addCell(prev, barIdx, beatIdx))
														}
														disabled={beat.length >= MAX_CELLS_PER_BEAT}
														className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
													>
														<Plus size={10} />
													</button>
												</div>
											</div>
										))}
									</div>
								</div>
							))}
						</div>

						<button
							onClick={() => setBars((prev) => addBar(prev))}
							disabled={bars.length >= MAX_BARS}
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
