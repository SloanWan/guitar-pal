"use client";

import ChordShapeEditor from "@/components/chords/ChordShapeEditor";
import { normalizeChordName } from "@/lib/chordSearch";
import { chordDisplayName } from "@/lib/chordSuffixes";
import type { ChordShape } from "@/lib/chordShape";

/**
 * What writing a chord shape asks for, wherever it is asked.
 *
 * Shared by the dialog a bar opens and the page a chord is invented on, so the
 * two are the same three questions in the same order — what the chord is called,
 * what this shape is called, and what it looks like — and only the action
 * underneath them differs.
 */

interface Props {
	shape: ChordShape;
	onShapeChange: (shape: ChordShape) => void;
	/** The shape's own optional name: "the one up at the seventh". */
	name: string;
	onNameChange: (name: string) => void;
	/**
	 * Given, the chord itself is still to be named and the field for it is shown.
	 * Left out where the chord is already known — renaming it there would move
	 * every bar pinned to it.
	 */
	chordName?: string;
	onChordNameChange?: (name: string) => void;
}

export default function ChordShapeFields({
	shape,
	onShapeChange,
	name,
	onNameChange,
	chordName,
	onChordNameChange,
}: Props) {
	const naming = chordName !== undefined && onChordNameChange !== undefined;
	// The same reading the search does, so a chord filed here can be typed back
	// later and land on itself.
	const identity = naming ? normalizeChordName(chordName) : null;

	return (
		<>
			{naming && (
				<div className="flex flex-col gap-1">
					<input
						type="text"
						value={chordName}
						onChange={(e) => onChordNameChange(e.target.value)}
						placeholder="What is this chord called? e.g. Cadd9#11"
						aria-label="Chord name"
						className={`h-(--h-control) w-full border bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus-visible:outline-none ${
							identity
								? "border-line-strong focus-visible:border-denim"
								: "border-destructive"
						}`}
					/>
					<p
						className={`font-mono text-[10px] ${
							identity ? "text-ink-faint" : "text-destructive"
						}`}
					>
						{identity
							? `Saved as ${chordDisplayName(identity.root, identity.suffix)} — you can write this chord again next time.`
							: "Start with a root note (A–G) so the chord can be filed."}
					</p>
				</div>
			)}

			<input
				type="text"
				value={name}
				onChange={(e) => onNameChange(e.target.value)}
				placeholder="Name it (optional)"
				aria-label="Name for this shape"
				className="h-(--h-control) w-full border border-line-strong bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus-visible:border-denim focus-visible:outline-none"
			/>

			<ChordShapeEditor shape={shape} onChange={onShapeChange} />
		</>
	);
}
