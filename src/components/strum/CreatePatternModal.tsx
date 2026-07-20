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
import { MoveDown, MoveUp, X, Dot, Plus, Minus } from "lucide-react";
import { Beat, StrumPattern, StepValue } from "@/lib/strumPatterns";

const STEP_CYCLE: StepValue[] = ["", "D", "U", "X"];

function cycleStep(current: StepValue): StepValue {
	const idx = STEP_CYCLE.indexOf(current);
	// idx === -1 for D3/U3/DG/UG: (−1+1)%4 = 0 → "" which resets gracefully
	return STEP_CYCLE[(idx + 1) % STEP_CYCLE.length];
}

function StepIcon({ step }: { step: StepValue }) {
	if (step === "D" || step === "D3" || step === "DG") return <MoveDown className="size-4" />;
	if (step === "U" || step === "U3" || step === "UG") return <MoveUp className="size-4" />;
	if (step === "X") return <X className="size-4" />;
	return <Dot className="size-4" />;
}

const EMPTY_BEATS: Beat[] = [
	["", ""],
	["", ""],
	["", ""],
	["", ""],
];

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
	const [beats, setBeats] = useState<Beat[]>(EMPTY_BEATS);
	const [nameError, setNameError] = useState(false);
	const [showSignInPrompt, setShowSignInPrompt] = useState(false);

	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			setName(editPattern?.name ?? "");
			setBeats(editPattern?.beats ?? EMPTY_BEATS);
			setNameError(false);
			setShowSignInPrompt(false);
		});
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	function handleCellClick(beatIdx: number, cellIdx: number) {
		setBeats((prev) =>
			prev.map((beat, bi) =>
				bi !== beatIdx
					? beat
					: (beat.map((cell, ci) => (ci === cellIdx ? cycleStep(cell) : cell)) as Beat),
			),
		);
	}

	function addCell(beatIdx: number) {
		setBeats((prev) =>
			prev.map((beat, bi) =>
				bi === beatIdx && beat.length < 4 ? ([...beat, ""] as Beat) : beat,
			),
		);
	}

	function removeCell(beatIdx: number) {
		setBeats((prev) =>
			prev.map((beat, bi) =>
				bi === beatIdx && beat.length > 2 ? (beat.slice(0, -1) as Beat) : beat,
			),
		);
	}

	function buildPattern(): StrumPattern {
		return {
			id: editPattern?.id ?? crypto.randomUUID(),
			name: name.trim(),
			beats,
			description: editPattern?.description ?? "",
		};
	}

	function handleSave() {
		if (!name.trim()) {
			setNameError(true);
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
		setBeats(EMPTY_BEATS);
		setNameError(false);
		setShowSignInPrompt(false);
		onClose();
	}

	return (
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

					{/* Beat grid */}
					<div className="flex flex-col gap-2">
						<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Pattern
						</span>
						<div className="flex gap-2">
							{beats.map((beat, beatIdx) => (
								<div key={beatIdx} className="flex-1 flex flex-col gap-1.5">
									{/* Cells */}
									<div className="flex border border-line-strong py-2">
										{beat.map((cell, cellIdx) => (
											<button
												key={cellIdx}
												onClick={() => handleCellClick(beatIdx, cellIdx)}
												className="flex-1 flex justify-center items-center text-ink-dim hover:text-denim hover:bg-denim-tint transition-colors"
											>
												<StepIcon step={cell} />
											</button>
										))}
									</div>
									{/* Cell count controls */}
									<div className="flex gap-1">
										<button
											onClick={() => removeCell(beatIdx)}
											disabled={beat.length <= 2}
											className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											<Minus size={10} />
										</button>
										<button
											onClick={() => addCell(beatIdx)}
											disabled={beat.length >= 4}
											className="flex-1 flex justify-center items-center h-6 border border-line-strong text-ink-faint hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											<Plus size={10} />
										</button>
									</div>
								</div>
							))}
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
	);
}
