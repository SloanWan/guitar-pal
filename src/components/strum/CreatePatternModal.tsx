"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
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
import { Bar, StrumPattern, StepValue } from "@/lib/strumPatterns";
import { toBars, barsToLegacyBeats, validateBars } from "@/lib/strumBars";
import {
	emptyBar,
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
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";
import ChordSearchSelect from "./ChordSearchSelect";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";

function StepIcon({ step }: { step: StepValue }) {
	if (step === "D" || step === "D3" || step === "DG") return <MoveDown className="size-4" />;
	if (step === "U" || step === "U3" || step === "UG") return <MoveUp className="size-4" />;
	if (step === "X") return <X className="size-4" />;
	return <Dot className="size-4" />;
}

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
	const [bars, setBars] = useState<Bar[]>([emptyBar()]);
	const [nameError, setNameError] = useState(false);
	const [showSignInPrompt, setShowSignInPrompt] = useState(false);
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
			setName(editPattern?.name ?? "");
			setBars(editPattern ? toBars(editPattern) : [emptyBar()]);
			setNameError(false);
			setShowSignInPrompt(false);
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
			.catch((e: unknown) => console.error("[CreatePatternModal] chord index:", e));
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

	function buildPattern(): StrumPattern {
		return {
			id: editPattern?.id ?? crypto.randomUUID(),
			name: name.trim(),
			// beats stays in sync with the first bar — see strumBars.barsToLegacyBeats
			beats: barsToLegacyBeats(bars),
			bars,
			description: editPattern?.description ?? "",
		};
	}

	function handleSave() {
		if (!name.trim()) {
			setNameError(true);
			return;
		}
		const validation = validateBars(bars);
		if (!validation.ok) {
			console.error("[CreatePatternModal] refusing to save malformed bars:", validation.errors);
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
		setBars([emptyBar()]);
		setNameError(false);
		setShowSignInPrompt(false);
		onClose();
	}

	return (
		<>
			<Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
				<DialogContent className="max-w-120 w-full flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 rounded-none border border-line-strong shadow-none">
					<DialogHeader className="shrink-0 p-4 pb-0">
						<DialogTitle>{editPattern ? "Edit pattern" : "Create pattern"}</DialogTitle>
					</DialogHeader>

					<div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 min-h-0">
						{/* Name input */}
						<div className="flex flex-col gap-1.5">
							<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Pattern name
							</label>
							<input
								type="text"
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
							{nameError && (
								<p className="text-xs text-destructive">Pattern name is required</p>
							)}
						</div>

						{/* Bars */}
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
									Pattern
								</span>
								<span className="font-mono text-[9px] text-ink-faint">
									{bars.length}/{MAX_BARS} bars
								</span>
							</div>

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
									{/* Bar header — number, chord, remove */}
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

							<button
								onClick={() => setBars((prev) => addBar(prev))}
								disabled={bars.length >= MAX_BARS}
								className="flex items-center justify-center gap-1.5 border border-dashed border-line-strong py-2 text-xs text-ink-dim transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
							>
								<Plus size={12} />
								Add bar
							</button>
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
									onClick={handleClose}
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
