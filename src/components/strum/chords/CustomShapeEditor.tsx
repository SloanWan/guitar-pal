"use client";

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

/** What the player has drawn and typed so far; the chord sheet holds it so its footer can save it. */
export interface ShapeDraft {
	shape: ChordShape;
	/** The shape's own name, optional. */
	name: string;
	/** The chord's name, typed only when the chord has none yet. */
	chordName: string;
}

/**
 * A fresh draft: the shape being borrowed (or a blank one with suggested fingers), and
 * the name a bar was kept under, for a chord the library never had.
 */
export function startDraft(voicing: ChordVoicing | null, namingFrom: string | null): ShapeDraft {
	if (voicing) return { shape: voicingToChordShape(voicing), name: "", chordName: namingFrom ?? "" };
	const blank = emptyChordShape();
	return { shape: { ...blank, fingers: suggestFingers(blank) }, name: "", chordName: namingFrom ?? "" };
}

/** The draft read against the chord it is for (null while it still has to be named). */
function readDraft(draft: ShapeDraft, chord: ChordRef | null) {
	const naming = chord === null;
	const identity = naming ? normalizeChordName(draft.chordName) : chord;
	const check = validateStrumShape(draft.shape);
	const sounding = soundingStrings(draft.shape);
	return { naming, identity, check, sounding, valid: check.ok && identity !== null };
}

interface Props {
	/** The chord the shape is for; null while it still has to be named. */
	chord: ChordRef | null;
	draft: ShapeDraft;
	/** Takes an update, so edits made in one event build on each other. */
	onDraftChange: (update: (draft: ShapeDraft) => ShapeDraft) => void;
	onBack: () => void;
}

/**
 * "My own shape", over the chord list: the fretboard to draw on, a name for the
 * shape, and — for a chord nobody has named — a name for the chord. Its actions
 * are `CustomShapeFooter`, pinned under the sheet.
 */
export default function CustomShapeEditor({ chord, draft, onDraftChange, onBack }: Props) {
	const { naming, identity, check, sounding } = readDraft(draft, chord);
	const status = !check.ok
		? sounding < MIN_STRUM_SHAPE_STRINGS
			? `Hold at least ${MIN_STRUM_SHAPE_STRINGS} strings — ${sounding} so far.`
			: check.errors[0]
		: `${sounding} strings sound.`;

	return (
		<div className="st-slide">
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="xs" onClick={onBack} aria-label="Back to the chord list">
					<ChevronLeft aria-hidden />
				</Button>
				<div className="min-w-0">
					<span className="st-lab">My own shape</span>
					<h3 className="m-0 text-xl font-extrabold">
						{identity ? chordDisplayName(identity.root, identity.suffix) : draft.chordName.trim() || "New chord"}
					</h3>
				</div>
			</div>
			<p className="st-lab m-0">
				Tap a fret to place a finger; tap above the nut to switch a string between open and muted.
			</p>
			<div className="flex flex-col gap-3">
				<ChordShapeFields
					shape={draft.shape}
					onShapeChange={(shape) => onDraftChange((d) => ({ ...d, shape }))}
					name={draft.name}
					onNameChange={(name) => onDraftChange((d) => ({ ...d, name }))}
					chordName={naming ? draft.chordName : undefined}
					onChordNameChange={naming ? (chordName) => onDraftChange((d) => ({ ...d, chordName })) : undefined}
				/>
			</div>
			<span className="st-lab" role="status">
				{status}
			</span>
		</div>
	);
}

interface FooterProps {
	chord: ChordRef | null;
	draft: ShapeDraft;
	onBack: () => void;
	onHear: (voicing: ChordVoicing) => void;
	/** Files the shape with the player's shapes and hands it back to be applied. */
	onSave: (voicing: UserChordVoicing) => void;
}

/** Cancel / Hear it / Save shape, under the editor. */
export function CustomShapeFooter({ chord, draft, onBack, onHear, onSave }: FooterProps) {
	const { identity, sounding, valid } = readDraft(draft, chord);

	function save() {
		if (!valid || !identity) return;
		onSave({
			...chordShapeToVoicing(draft.shape, userVoicingId(crypto.randomUUID()), draft.name.trim() || null),
			root: identity.root,
			suffix: identity.suffix,
		});
	}

	return (
		<>
			<Button variant="ghost" size="xs" onClick={onBack}>
				Cancel
			</Button>
			<span className="flex-1" />
			<Button
				variant="secondary"
				size="xs"
				disabled={sounding === 0}
				onClick={() => onHear(chordShapeToVoicing(draft.shape, "preview"))}
			>
				Hear it
			</Button>
			<Button size="xs" disabled={!valid} onClick={save}>
				Save shape
			</Button>
		</>
	);
}
