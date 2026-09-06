"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MoveDown, MoveUp, X, Dot, Plus, Minus } from "lucide-react";
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
import { emptyBar, cycleCell, addCell, removeCell } from "@/lib/strumBarEdit";
import {
	DEFAULT_METER,
	SUPPORTED_METERS,
	beatUnitLabel,
	meterLabel,
	metersEqual,
	stepCellsPerBeat,
	type Meter,
} from "@/lib/strumMeter";
import { patternNotation } from "@/lib/strumNotation";

function StepIcon({ step }: { step: StepValue }) {
	if (step === "D" || step === "D3" || step === "DG") return <MoveDown className="size-4" />;
	if (step === "U" || step === "U3" || step === "UG") return <MoveUp className="size-4" />;
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
	const [bars, setBars] = useState<Bar[]>([emptyBar()]);
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
	const [showSignInPrompt, setShowSignInPrompt] = useState(false);

	const beats = bars[0].beats;

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
			setBars(initialBars);
			setMeter(initialMeter);
			setNameError(false);
			setShowSignInPrompt(false);
			setDiscardConfirm(false);
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

	function handleSave() {
		if (!name.trim()) {
			setNameError(true);
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
		setBars([emptyBar()]);
		setMeter(DEFAULT_METER);
		setNameError(false);
		setShowSignInPrompt(false);
		setDiscardConfirm(false);
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
					className="w-full max-w-120 flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 rounded-none border border-line-strong shadow-none"
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
								<p className="text-xs text-destructive">Pattern name is required</p>
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

							<div className="flex flex-col gap-1.5 border-l border-line-strong pl-2">
								<div className="flex gap-2">
									{beats.map((beat, beatIdx) => (
										<div key={beatIdx} className="flex-1 flex flex-col gap-1.5">
											{/* Cells */}
											<div className="flex border border-line-strong py-2">
												{beat.map((cell, cellIdx) => (
													<button
														key={cellIdx}
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
										</div>
									))}
								</div>
							</div>
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
