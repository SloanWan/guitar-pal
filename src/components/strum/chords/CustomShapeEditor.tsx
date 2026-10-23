"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ChordShapeFields from "@/components/chords/ChordShapeFields";
import {
	MIN_STRUM_SHAPE_STRINGS,
	chordShapeToVoicing,
	emptyChordShape,
	soundingStrings,
	suggestFingers,
	validateStrumShape,
	voicingToChordShape,
	type ChordShape,
} from "@/lib/chordShape";
import { normalizeChordName } from "@/lib/chordSearch";
import { chordDisplayName } from "@/lib/chordSuffixes";
import type { ChordVoicing } from "@/lib/chordVoicing";
import type { ChordRef } from "@/lib/strumPatterns";
import { userVoicingId, type UserChordVoicing } from "@/lib/userChordVoicings";

interface Props {
	/** The chord the shape is for; null while it still has to be named. */
	chord: ChordRef | null;
	/** The name a bar was kept under, for a chord the library never had. */
	namingFrom: string | null;
	/** The shape to start from — the one being borrowed. */
	initialVoicing: ChordVoicing | null;
	onSave: (voicing: UserChordVoicing) => void;
	onBack: () => void;
	onHear: (voicing: ChordVoicing) => void;
}

function startShape(voicing: ChordVoicing | null): ChordShape {
	if (voicing) return voicingToChordShape(voicing);
	const blank = emptyChordShape();
	return { ...blank, fingers: suggestFingers(blank) };
}

/**
 * "My own shape", over the chord list: the fretboard to draw on, a name for the
 * shape, and — for a chord nobody has named — a name for the chord. Saving files
 * it with the player's shapes and hands it back to be applied.
 */
export default function CustomShapeEditor({ chord, namingFrom, initialVoicing, onSave, onBack, onHear }: Props) {
	const [shape, setShape] = useState<ChordShape>(() => startShape(initialVoicing));
	const [name, setName] = useState("");
	const [chordName, setChordName] = useState(namingFrom ?? "");
	const naming = chord === null;
	const identity = naming ? normalizeChordName(chordName) : chord;
	const check = validateStrumShape(shape);
	const sounding = soundingStrings(shape);
	const valid = check.ok && identity !== null;
	const status = !check.ok
		? sounding < MIN_STRUM_SHAPE_STRINGS
			? `Hold at least ${MIN_STRUM_SHAPE_STRINGS} strings — ${sounding} so far.`
			: check.errors[0]
		: `${sounding} strings sound.`;

	function save() {
		if (!valid || !identity) return;
		onSave({
			...chordShapeToVoicing(shape, userVoicingId(crypto.randomUUID()), name.trim() || null),
			root: identity.root,
			suffix: identity.suffix,
		});
	}

	return (
		<div className="st-slide">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="xs" onClick={onBack} aria-label="Back to the chord list">
					<ChevronLeft aria-hidden />
				</Button>
				<div className="min-w-0">
					<span className="st-lab">My own shape</span>
					<h3 className="m-0 text-xl font-extrabold">
						{identity ? chordDisplayName(identity.root, identity.suffix) : chordName.trim() || "New chord"}
					</h3>
				</div>
			</div>
			<p className="st-lab m-0">
				Tap a fret to place a finger; tap above the nut to switch a string between open and muted.
			</p>
			<div className="flex flex-col gap-3">
				<ChordShapeFields
					shape={shape}
					onShapeChange={setShape}
					name={name}
					onNameChange={setName}
					chordName={naming ? chordName : undefined}
					onChordNameChange={naming ? setChordName : undefined}
				/>
			</div>
			<span className="st-lab" role="status">
				{status}
			</span>
			<div className="st-sheet-foot">
				<Button variant="ghost" size="xs" onClick={onBack}>
					Cancel
				</Button>
				<span className="flex-1" />
				<Button variant="secondary" size="xs" disabled={sounding === 0} onClick={() => onHear(chordShapeToVoicing(shape, "preview"))}>
					Hear it
				</Button>
				<Button size="xs" disabled={!valid} onClick={save}>
					Save shape
				</Button>
			</div>
		</div>
	);
}
