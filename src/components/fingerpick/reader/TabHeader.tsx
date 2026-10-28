"use client";

import { useState } from "react";
import { PanelRightOpen, Pencil, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "@/components/playback/icons.css";
import CapoStepper from "@/components/playback/CapoStepper";

interface Props {
	name: string;
	/** "My tab · ♩ = 100 · 4/4 · 8 bars". */
	meta: string;
	capo: number;
	/** A share page changes it too, for the visit. */
	onCapo: (fret: number) => void;
	/**
	 * Opens the library's sheet below 1200px, where it is not beside the stage: at the end
	 * of the meta line, so it never crowds the actions. Absent on a share page.
	 */
	onOpenLibrary?: () => void;
	/**
	 * Edit, share and delete. Edit and delete are shown, disabled, for a preset so the
	 * row keeps its shape; all three are left out on a share page.
	 */
	onEdit?: () => void;
	onShare?: () => void;
	sharing?: boolean;
	onDelete?: () => void;
	/** The player's own tab, which edit and delete act on. */
	owned?: boolean;
}

/**
 * The tab's name and what it is, the capo it is played behind (the tab is written
 * behind it; playback sounds that much higher), and what can be done to it — the
 * same icons, in the same order, as Strum's title row.
 */
export default function TabHeader({
	name,
	meta,
	capo,
	onCapo,
	onOpenLibrary,
	onEdit,
	onShare,
	sharing = false,
	onDelete,
	owned = false,
}: Props) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	return (
		<div className="tb-titlerow">
			<span className="pb-lab pb-num tb-meta">{meta}</span>
			{onOpenLibrary && (
				<button
					type="button"
					className="pb-icon tb-libopen"
					onClick={onOpenLibrary}
					aria-label="Open the tab list"
					title="Open the tab list"
				>
					<PanelRightOpen aria-hidden />
				</button>
			)}
			<h1>{name}</h1>
			<div className="tb-pact">
				<CapoStepper capo={capo} onCapo={onCapo} className="tb-capo" />
				{onEdit && (
					<button
						type="button"
						className="pb-icon"
						data-anim="edit"
						onClick={onEdit}
						disabled={!owned}
						aria-label="Edit this tab"
						title={owned ? "Edit this tab" : "Presets can't be edited"}
					>
						<Pencil aria-hidden />
					</button>
				)}
				{onShare && (
					<button
						type="button"
						className="pb-icon"
						data-anim="share"
						onClick={onShare}
						disabled={sharing}
						aria-label="Share this tab"
						title="Copy a link to this tab"
					>
						<Share2 aria-hidden />
					</button>
				)}
				{onDelete && (
					<Popover open={confirmDelete} onOpenChange={setConfirmDelete}>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="pb-icon"
								data-anim="delete"
								disabled={!owned}
								aria-label="Delete this tab"
								title={owned ? "Delete this tab" : "Presets can't be deleted"}
							>
								<Trash2 aria-hidden />
							</button>
						</PopoverTrigger>
						<PopoverContent role="alertdialog" aria-label="Delete tab" className="w-auto max-w-75" data-m="tab">
							<div className="tb-confirm">
								<span>
									Delete <b>{name}</b>? This can&apos;t be undone.
								</span>
								<div className="tb-confirm-actions">
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
			</div>
		</div>
	);
}
