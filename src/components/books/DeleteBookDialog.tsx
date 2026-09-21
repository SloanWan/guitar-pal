"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DangerButton, GhostButton } from "@/components/books/bookUi";

/** Deleting takes the PDF with it; one confirmation, no undo. */
export default function DeleteBookDialog({
	open,
	title,
	busy,
	onConfirm,
	onClose,
}: {
	open: boolean;
	title: string;
	busy: boolean;
	onConfirm: () => void;
	onClose: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && !busy && onClose()}>
			<DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0 rounded-none border border-line-strong p-0 shadow-none">
				<DialogHeader className="p-4 pb-2">
					<DialogTitle className="text-sm">Delete “{title}”?</DialogTitle>
				</DialogHeader>
				<p className="px-4 pb-4 text-[13px] text-ink-dim">
					The PDF and everything read from it are removed. This cannot be undone.
				</p>
				<div className="flex justify-end gap-2 border-t border-line p-3">
					<GhostButton onClick={onClose} disabled={busy}>
						Keep it
					</GhostButton>
					<DangerButton onClick={onConfirm} disabled={busy} className="border-destructive text-destructive">
						{busy ? "Deleting…" : "Delete book"}
					</DangerButton>
				</div>
			</DialogContent>
		</Dialog>
	);
}
