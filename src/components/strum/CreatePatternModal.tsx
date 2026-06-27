"use client";

import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
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
}: {
	open: boolean;
	onClose: () => void;
	onSave: (pattern: StrumPattern) => void;
}) {
	const [name, setName] = useState("");
	const [beats, setBeats] = useState<Beat[]>(EMPTY_BEATS);
	const [nameError, setNameError] = useState(false);

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

	function handleSave() {
		if (!name.trim()) {
			setNameError(true);
			return;
		}
		onSave({
			id: crypto.randomUUID(),
			name: name.trim(),
			beats,
			description: "",
		});
		handleClose();
	}

	function handleClose() {
		setName("");
		setBeats(EMPTY_BEATS);
		setNameError(false);
		onClose();
	}

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
			<DialogContent className="max-w-120 w-full">
				<DialogHeader>
					<DialogTitle>Create pattern</DialogTitle>
				</DialogHeader>

				<div className="flex flex-col gap-5">
					{/* Name input */}
					<div className="flex flex-col gap-1.5">
						<label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
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
							className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-denim/40 ${
								nameError ? "border-red-400" : "border-slate-200"
							}`}
						/>
						{nameError && (
							<p className="text-xs text-red-500">Pattern name is required</p>
						)}
					</div>

					{/* Beat grid */}
					<div className="flex flex-col gap-2">
						<span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
							Pattern
						</span>
						<div className="flex gap-2">
							{beats.map((beat, beatIdx) => (
								<div key={beatIdx} className="flex-1 flex flex-col gap-1.5">
									{/* Cells */}
									<div className="flex border border-slate-200 rounded-sm py-2">
										{beat.map((cell, cellIdx) => (
											<button
												key={cellIdx}
												onClick={() => handleCellClick(beatIdx, cellIdx)}
												className="flex-1 flex justify-center items-center text-slate-500 hover:text-denim hover:bg-denim-tint/60 rounded-sm transition-colors"
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
											className="flex-1 flex justify-center items-center h-6 rounded border border-slate-200 text-slate-400 hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											<Minus size={10} />
										</button>
										<button
											onClick={() => addCell(beatIdx)}
											disabled={beat.length >= 4}
											className="flex-1 flex justify-center items-center h-6 rounded border border-slate-200 text-slate-400 hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											<Plus size={10} />
										</button>
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Warning */}
					<p className="text-[11px] text-red-600">
						Saved locally. Clear browser data and your patterns will be lost.
					</p>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleSave}
						style={{ backgroundColor: "var(--denim)", color: "white" }}
					>
						Save pattern
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
