"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ChordShapeEditor from "@/components/chords/ChordShapeEditor";
import {
	chordShapeToVoicing,
	emptyChordShape,
	suggestFingers,
	validateChordShape,
	voicingToChordShape,
	type ChordShape,
} from "@/lib/chordShape";
import { userVoicingId, type UserChordVoicing } from "@/lib/userChordVoicings";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { chordDisplayName } from "@/lib/chordSuffixes";

/**
 * Write a shape for the chord a bar is playing.
 *
 * How far the change reaches is the player's to choose, so the two apply
 * buttons are the two scopes rather than one button and a setting. There is
 * deliberately no "use it without saving": a bar stores a chord identity and a
 * voicing id, never the frets themselves, so a shape nobody stored has nothing
 * to point at and would be gone on the next load.
 */

export type ApplyScope = "bar" | "chord";

interface Props {
	open: boolean;
	chord: ChordRef;
	/** The shape currently drawn for this bar, to start from. */
	initialVoicing: ChordVoicing | null;
	onClose: () => void;
	onApply: (voicing: UserChordVoicing, scope: ApplyScope) => void;
	/**
	 * How many bars on screen play this chord. With one there is only one thing
	 * the change can reach, so offering two scopes would be two buttons doing the
	 * same thing.
	 */
	matchingBarCount: number;
}

export default function ChordShapeModal({
	open,
	chord,
	initialVoicing,
	onClose,
	onApply,
	matchingBarCount,
}: Props) {
	const [shape, setShape] = useState<ChordShape>(() => emptyChordShape());
	const [name, setName] = useState("");
	// Shown in place of the close control once there is work to lose.
	const [discardConfirm, setDiscardConfirm] = useState(false);
	const [pristine, setPristine] = useState("");

	useEffect(() => {
		if (!open) return;
		// Start from the shape on screen: borrowing one is what this is for, so it
		// opens on what is being borrowed rather than on an empty neck.
		const start = initialVoicing
			? voicingToChordShape(initialVoicing)
			: (() => {
					const blank = emptyChordShape();
					return { ...blank, fingers: suggestFingers(blank) };
				})();
		// Deferred, as CreatePatternModal's open effect is: seeding straight from
		// the effect body is the cascading-render pattern the linter flags.
		queueMicrotask(() => {
			setShape(start);
			setName("");
			setDiscardConfirm(false);
			setPristine(JSON.stringify(start));
		});
	}, [open, initialVoicing]);

	const label = chordDisplayName(chord.root, chord.suffix);
	const valid = validateChordShape(shape).ok;
	const dirty = JSON.stringify(shape) !== pristine || name.trim() !== "";

	function apply(scope: ApplyScope) {
		if (!valid) return;
		onApply(
			{
				...chordShapeToVoicing(shape, userVoicingId(crypto.randomUUID()), name.trim() || null),
				root: chord.root,
				suffix: chord.suffix,
			},
			scope,
		);
		onClose();
	}

	function requestClose() {
		if (dirty) {
			setDiscardConfirm(true);
			return;
		}
		onClose();
	}

	return (
		<Dialog open={open} onOpenChange={(next) => (next ? undefined : requestClose())}>
			<DialogContent
				showCloseButton={false}
				className="max-w-lg gap-4 border-line-strong p-4"
				onEscapeKeyDown={(e) => {
					e.preventDefault();
					requestClose();
				}}
			>
				{/* min-h and a control-height close button so swapping in the discard
				    question cannot move the dialog under the player's cursor. The title
				    wraps rather than pushing the row taller. */}
				<DialogHeader className="min-h-(--h-control) flex-row items-center justify-between gap-2 space-y-0">
					<DialogTitle className="min-w-0 break-words text-base leading-tight">
						{label} — my shape
					</DialogTitle>
					{discardConfirm ? (
						<div className="flex shrink-0 items-center gap-2">
							<span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim">
								Discard?
							</span>
							<button
								type="button"
								onClick={onClose}
								className="flex h-(--h-control) items-center border border-destructive px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-destructive transition-colors hover:bg-destructive hover:text-on-denim"
							>
								Discard
							</button>
							<button
								type="button"
								onClick={() => setDiscardConfirm(false)}
								className="flex h-(--h-control) items-center border border-line-strong px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:border-denim hover:text-denim-accent"
							>
								Keep editing
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={requestClose}
							aria-label="Close"
							className="flex h-(--h-control) shrink-0 items-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim transition-colors hover:text-denim-accent"
						>
							Close
						</button>
					)}
				</DialogHeader>

				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Name it (optional)"
					aria-label="Name for this shape"
					className="h-(--h-control) w-full border border-line-strong bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
				/>

				<ChordShapeEditor shape={shape} onChange={setShape} />

				{/* The two scopes only. Leaving is the close control and Escape, both
				    of which go through the same discard guard — a third button
				    repeating that just widened the row. */}
				<div className="flex flex-wrap gap-2">
					{matchingBarCount > 1 ? (
						<>
							<button
								type="button"
								onClick={() => apply("chord")}
								disabled={!valid}
								className="flex h-(--h-control) items-center border border-denim bg-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-on-denim transition-colors hover:bg-denim-dark disabled:cursor-not-allowed disabled:opacity-30"
							>
								Apply to whole pattern
							</button>
							<button
								type="button"
								onClick={() => apply("bar")}
								disabled={!valid}
								className="flex h-(--h-control) items-center border border-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:bg-denim hover:text-on-denim disabled:cursor-not-allowed disabled:opacity-30"
							>
								This bar only
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => apply("bar")}
							disabled={!valid}
							className="flex h-(--h-control) items-center border border-denim bg-denim px-3 font-mono text-[11px] uppercase tracking-[0.08em] text-on-denim transition-colors hover:bg-denim-dark disabled:cursor-not-allowed disabled:opacity-30"
						>
							Apply
						</button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
