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
import { MoveDown, MoveUp, X, Dot, Plus, Minus, Music, Trash2 } from "lucide-react";
import { Bar, StrumPattern, StepValue } from "@/lib/strumPatterns";
import { toBars, barsToLegacyBeats, validateBars } from "@/lib/strumBars";
import {
	emptyBar,
	addBar,
	removeBar,
	setBarChord,
	cycleCell,
	addCell,
	removeCell,
	MAX_BARS,
	MIN_CELLS_PER_BEAT,
} from "@/lib/strumBarEdit";
import { MAX_CELLS_PER_BEAT } from "@/lib/strumBars";
import ChordPickerModal, { type ConfirmedChord } from "./ChordPickerModal";

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
	const [pickerBarIdx, setPickerBarIdx] = useState<number | null>(null);

	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			setName(editPattern?.name ?? "");
			setBars(editPattern ? toBars(editPattern) : [emptyBar()]);
			setNameError(false);
			setShowSignInPrompt(false);
			setPickerBarIdx(null);
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	function handleChordConfirm(chord: ConfirmedChord | null) {
		if (pickerBarIdx !== null) {
			setBars((prev) =>
				setBarChord(
					prev,
					pickerBarIdx,
					chord
						? { root: chord.root, suffix: chord.suffix, voicingId: chord.voicingId ?? null }
						: null,
				),
			);
		}
		setPickerBarIdx(null);
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
		setPickerBarIdx(null);
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
									className="flex flex-col gap-1.5 border-l border-line-strong pl-2"
								>
									{/* Bar header — number, chord, remove */}
									<div className="flex items-center gap-2">
										<span className="font-mono text-[9px] tracking-[0.2em] text-ink-faint">
											{barIdx + 1}
										</span>
										<button
											onClick={() => setPickerBarIdx(barIdx)}
											className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold transition-colors ${
												bar.chord
													? "border-denim bg-denim-tint text-denim hover:bg-denim hover:text-on-denim"
													: "border-line-strong text-ink-dim hover:border-denim hover:bg-denim-tint hover:text-denim"
											}`}
										>
											<Music size={10} />
											<span>
												{bar.chord
													? `${bar.chord.root} ${bar.chord.suffix}`
													: "No chord"}
											</span>
										</button>
										<button
											onClick={() => setBars((prev) => removeBar(prev, barIdx))}
											disabled={bars.length <= 1}
											aria-label={`Remove bar ${barIdx + 1}`}
											className="ml-auto flex size-6 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
										>
											<Trash2 size={10} />
										</button>
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

			<ChordPickerModal
				open={pickerBarIdx !== null}
				onClose={() => setPickerBarIdx(null)}
				onConfirm={handleChordConfirm}
				initialChord={pickerBarIdx !== null ? bars[pickerBarIdx]?.chord : null}
			/>
		</>
	);
}
