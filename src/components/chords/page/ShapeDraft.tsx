"use client";

import { ChevronLeft } from "lucide-react";
import ChordShapeFields from "@/components/chords/ChordShapeFields";
import { Button } from "@/components/ui/button";
import { validateChordShape, type ChordShape } from "@/lib/chordShape";

/** A shape being drawn for the page's chord: a new one, or one of the player's own redrawn. */
export interface Draft {
	/** The shape being redrawn; null for a new one. */
	editingId: string | null;
	shape: ChordShape;
	name: string;
}

interface Props {
	chordName: string;
	/** In a sheet the sheet's own title and close button stand in for the header. */
	variant: "aside" | "sheet";
	draft: Draft;
	onChange: (draft: Draft) => void;
	onSave: () => void;
	onHear: () => void;
	onCancel: () => void;
}

export function draftTitle(draft: Draft): string {
	return draft.editingId ? "Redraw my shape" : "My own shape";
}

/** "My own shape": drawn where the library was, saved beside the library's shapes. */
export default function ShapeDraft({ chordName, variant, draft, onChange, onSave, onHear, onCancel }: Props) {
	const valid = validateChordShape(draft.shape).ok;
	return (
		<div className="ch-draft">
			{variant === "aside" && (
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="xs" onClick={onCancel} aria-label="Back to the chord library">
						<ChevronLeft aria-hidden />
					</Button>
					<div className="min-w-0">
						<span className="ch-lab">{draftTitle(draft)}</span>
						<h3 className="m-0 text-lg font-extrabold">{chordName}</h3>
					</div>
				</div>
			)}
			<ChordShapeFields
				shape={draft.shape}
				onShapeChange={(shape) => onChange({ ...draft, shape })}
				name={draft.name}
				onNameChange={(name) => onChange({ ...draft, name })}
			/>
			<div className="ch-draft-foot">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<span className="flex-1" />
				<Button variant="secondary" size="sm" onClick={onHear}>
					Hear it
				</Button>
				<Button size="sm" disabled={!valid} onClick={onSave}>
					{draft.editingId ? "Save changes" : "Save shape"}
				</Button>
			</div>
		</div>
	);
}
