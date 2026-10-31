"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
			<DialogContent data-m="books" showCloseButton={false} className="gap-3">
				<DialogTitle className="pr-6 text-(length:--gp-t-h) font-semibold">Delete “{title}”?</DialogTitle>
				<DialogDescription className="text-ink-2">
					The PDF and everything read from it are removed. This cannot be undone.
				</DialogDescription>
				<div className="mt-2 flex justify-end gap-2">
					<Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
						Keep it
					</Button>
					<Button variant="danger" size="sm" onClick={onConfirm} loading={busy}>
						Delete book
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
