"use client";

import { useState } from "react";
import { ListMusic, Pencil, RotateCcw, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
	name: string;
	/** "My pattern · 4/4 · 2 bars". */
	meta: string;
	/** The rhythm on screen differs from the saved one. */
	dirty?: boolean;
	onRevert?: () => void;
	/** Given only for the player's own pattern: a preset is never overwritten. */
	onSave?: () => void;
	onSaveAsNew?: () => void;
	/**
	 * Edit and delete. Shown, disabled, for a preset so the row keeps its shape;
	 * left out altogether on a shared snapshot.
	 */
	onEdit?: () => void;
	onDelete?: () => void;
	/** The player's own pattern, which edit and delete act on. */
	owned?: boolean;
	onShare?: () => void;
	sharing?: boolean;
	/** Opens the library below 960px, where it is not beside the stage. */
	onOpenLibrary?: () => void;
}

/**
 * The pattern's name and what it is, and what can be done to it. An edited rhythm
 * says so here, in the title row, rather than pushing the card down.
 */
export default function PatternHeader({
	name,
	meta,
	dirty = false,
	onRevert,
	onSave,
	onSaveAsNew,
	onEdit,
	onDelete,
	owned = false,
	onShare,
	sharing = false,
	onOpenLibrary,
}: Props) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const hasActions = onEdit || onDelete || onShare || onOpenLibrary;

	return (
		<div className="st-titlerow" data-dirty={dirty ? "" : undefined}>
			<div className="st-title">
				<span className="st-lab">{meta}</span>
				<h1>{name}</h1>
			</div>
			{dirty && (
				<div className="st-dirty" role="status" aria-label="Unsaved rhythm">
					<span className="st-dirty-text">Unsaved</span>
					<button type="button" className="st-icon" onClick={onRevert} aria-label="Revert the rhythm" title="Revert">
						<RotateCcw aria-hidden />
					</button>
					{onSaveAsNew && (
						<Button variant="secondary" size="xs" onClick={onSaveAsNew}>
							Save as new
						</Button>
					)}
					{onSave && (
						<Button size="xs" onClick={onSave}>
							Save
						</Button>
					)}
				</div>
			)}
			{hasActions && (
				<div className="st-pact">
					{onEdit && (
						<button
							type="button"
							className="st-icon"
							onClick={onEdit}
							disabled={!owned}
							aria-label="Edit this pattern"
							title={owned ? "Edit this pattern" : "Presets can't be edited — change the rhythm and save a copy"}
						>
							<Pencil aria-hidden />
						</button>
					)}
					{onShare && (
						<button
							type="button"
							className="st-icon"
							onClick={onShare}
							disabled={sharing}
							aria-label="Share this pattern"
							title="Copy a link to this pattern"
						>
							<Share2 aria-hidden />
						</button>
					)}
					{onDelete && (
						<Popover open={confirmDelete} onOpenChange={setConfirmDelete}>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="st-icon"
									data-tone="bad"
									disabled={!owned}
									aria-label="Delete this pattern"
									title={owned ? "Delete this pattern" : "Presets can't be deleted"}
								>
									<Trash2 aria-hidden />
								</button>
							</PopoverTrigger>
							<PopoverContent role="alertdialog" aria-label="Delete pattern" className="w-auto max-w-75">
								<div className="st-confirm">
									<span>
										Delete <b className="capitalize">{name}</b>? Its progressions go with it.
									</span>
									<div className="st-confirm-actions">
										<Button variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>
											Cancel
										</Button>
										<Button
											variant="danger"
											size="xs"
											onClick={() => {
												setConfirmDelete(false);
												onDelete();
											}}
										>
											Delete
										</Button>
									</div>
								</div>
							</PopoverContent>
						</Popover>
					)}
					{onOpenLibrary && (
						<Button variant="secondary" size="sm" className="st-libbtn" onClick={onOpenLibrary}>
							<ListMusic aria-hidden />
							Patterns
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
