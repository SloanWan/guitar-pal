"use client";

import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import ChordShapeFields from "@/components/chords/ChordShapeFields";
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
import type { ChordVoicing } from "@/lib/chordVoicing";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { normalizeChordName } from "@/lib/chordSearch";

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
	/**
	 * The chord this shape belongs to. Null while it is still to be named, which
	 * is the case for a bar kept under a name the library has no chord for —
	 * `namingFrom` then carries that name.
	 */
	chord: ChordRef | null;
	/**
	 * The name the bar was kept under. Given, the dialog asks what the chord is
	 * called as well as what it looks like: a shape is filed under a chord
	 * identity, and for a chord the library never had, this is the moment that
	 * identity gets settled. The name is normalized the way search reads one, so
	 * "cadd9#11" and "Cadd9#11" file under the same chord.
	 */
	namingFrom?: string;
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
	/** Plays the shape as drawn; without it there is no Hear button. */
	onHear?: (voicing: ChordVoicing) => void;
	/** The module the dialog is coloured by: it is portaled, out of the page's `data-m`. */
	module?: "strum" | "tab" | "chords";
}

export default function ChordShapeModal({
	open,
	chord,
	namingFrom,
	initialVoicing,
	onClose,
	onApply,
	matchingBarCount,
	onHear,
	module,
}: Props) {
	const [shape, setShape] = useState<ChordShape>(() => emptyChordShape());
	const [name, setName] = useState("");
	// What the chord is called. Only asked while it has no identity yet.
	const [chordName, setChordName] = useState("");
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
			setChordName(namingFrom ?? "");
			setDiscardConfirm(false);
			setPristine(JSON.stringify(start));
		});
	}, [open, initialVoicing, namingFrom]);

	// A chord being named resolves from the field; one that already has an
	// identity keeps it. Null is a name nothing in it reads as a root note, which
	// is the one thing a chord identity cannot be invented without.
	const naming = chord === null;
	const identity = naming ? normalizeChordName(chordName) : chord;
	const label = identity
		? chordDisplayName(identity.root, identity.suffix)
		: chordName.trim() || "New chord";
	const valid = validateChordShape(shape).ok && identity !== null;
	const dirty =
		JSON.stringify(shape) !== pristine ||
		name.trim() !== "" ||
		chordName.trim() !== (namingFrom ?? "").trim();

	function apply(scope: ApplyScope) {
		if (!valid || !identity) return;
		onApply(
			{
				...chordShapeToVoicing(shape, userVoicingId(crypto.randomUUID()), name.trim() || null),
				root: identity.root,
				suffix: identity.suffix,
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
				data-m={module}
				showCloseButton={false}
				className="flex max-h-[88dvh] flex-col gap-0 p-0 sm:max-w-[440px]"
				onEscapeKeyDown={(e) => {
					e.preventDefault();
					requestClose();
				}}
			>
				{/* The close button and the discard question share one slot beside the title,
				    and nothing else sits in that row, so swapping them cannot move the
				    dialog under the player's cursor. */}
				<div className="flex min-h-16 items-start gap-3 px-6 pt-5">
					<div className="min-w-0 flex-1">
						<span className="text-[12px] font-semibold text-ink-3">{naming ? "A new chord" : "My own shape"}</span>
						<DialogTitle className="mt-0.5 text-[19px] leading-tight font-bold break-words">{label}</DialogTitle>
						<DialogDescription className="sr-only">Draw the shape; it is kept with your shapes and used here.</DialogDescription>
					</div>
					<span className="flex h-8 shrink-0 items-center gap-1.5">
						{discardConfirm ? (
							<>
								<span className="text-[12px] font-semibold text-ink-3">Discard changes?</span>
								<Button variant="danger" size="xs" onClick={onClose}>
									Discard
								</Button>
								<Button variant="secondary" size="xs" onClick={() => setDiscardConfirm(false)}>
									Keep
								</Button>
							</>
						) : (
							<Button variant="icon" size="xs" aria-label="Close" onClick={requestClose}>
								<X aria-hidden />
							</Button>
						)}
					</span>
				</div>

				{/* The chord-name field appears only for a chord that has none yet: a
				    named chord's identity is not editable here, since renaming it would
				    move every bar pinned to it. */}
				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-3.5 pb-5">
					<ChordShapeFields
						shape={shape}
						onShapeChange={setShape}
						name={name}
						onNameChange={setName}
						chordName={naming ? chordName : undefined}
						onChordNameChange={naming ? setChordName : undefined}
					/>
				</div>

				{/* Leaving is Cancel, the close button and Escape, all through the same
				    discard guard; applying is one button per scope the change can reach. */}
				<div className="flex flex-wrap items-center gap-2.5 px-6 pt-3.5 pb-4.5 shadow-[0_-1px_0_var(--gp-line)]">
					<Button variant="ghost" size="sm" onClick={requestClose}>
						Cancel
					</Button>
					<span className="flex-1" />
					{onHear && (
						<Button
							variant="secondary"
							size="sm"
							disabled={!validateChordShape(shape).ok}
							onClick={() => onHear(chordShapeToVoicing(shape, "preview", null))}
						>
							<Play aria-hidden />
							Hear it
						</Button>
					)}
					{matchingBarCount > 1 ? (
						<>
							<Button variant="secondary" size="sm" disabled={!valid} onClick={() => apply("bar")}>
								This bar only
							</Button>
							<Button size="sm" disabled={!valid} onClick={() => apply("chord")}>
								Whole pattern
							</Button>
						</>
					) : (
						<Button size="sm" disabled={!valid} onClick={() => apply("bar")}>
							Apply
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
