"use client";

import ChordShapeEditor from "@/components/chords/ChordShapeEditor";
import { Field, Input } from "@/components/ui/input";
import { normalizeChordName } from "@/lib/chordSearch";
import { chordDisplayName } from "@/lib/chordSuffixes";
import type { ChordShape } from "@/lib/chordShape";

/**
 * What writing a chord shape asks for, wherever it is asked: the chord's name
 * (only while it has none), the shape's own name, and the shape.
 */

interface Props {
	shape: ChordShape;
	onShapeChange: (shape: ChordShape) => void;
	/** The shape's own optional name: "the one up at the seventh". */
	name: string;
	onNameChange: (name: string) => void;
	/**
	 * Given, the chord itself is still to be named and the field for it is shown.
	 * Left out where the chord is known — renaming it there would move every bar
	 * pinned to it.
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
	// The same reading search does, so a chord filed here can be typed back later.
	const identity = naming ? normalizeChordName(chordName) : null;

	return (
		<>
			{naming && (
				<Field
					label="What is this chord called?"
					help={identity ? `Saved as ${chordDisplayName(identity.root, identity.suffix)}.` : undefined}
					error={identity || chordName.trim() === "" ? undefined : "Start with a root note (A–G) so the chord can be filed."}
				>
					{(control) => (
						<Input
							{...control}
							type="text"
							value={chordName}
							onChange={(e) => onChordNameChange(e.target.value)}
							placeholder="e.g. Cadd9#11"
							aria-label="Chord name"
						/>
					)}
				</Field>
			)}

			<Field label="Name this shape (optional)">
				{(control) => (
					<Input
						{...control}
						type="text"
						value={name}
						onChange={(e) => onNameChange(e.target.value)}
						placeholder="e.g. up at the seventh"
						aria-label="Name for this shape"
					/>
				)}
			</Field>

			<ChordShapeEditor shape={shape} onChange={onShapeChange} />
		</>
	);
}
