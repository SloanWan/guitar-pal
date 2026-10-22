"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TextTabPicker from "@/components/textTab/TextTabPicker";

/**
 * The text-tab picker (#228) as a dialog on the fingerpick page: paste,
 * listen, pick. The chosen reading lands through the handoff the page is
 * already listening for, so taking one closes this and opens the editor.
 */
export default function TextTabDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 rounded-none border border-line-strong p-0 shadow-none">
				<DialogHeader className="border-b border-line p-4 pb-3">
					<DialogTitle className="text-sm">Paste a text tab</DialogTitle>
					<DialogDescription className="text-[12px] text-ink-dim">
						Text tab carries frets and order, not rhythm. Listen to each reading and take the one that sounds
						like the recording.
					</DialogDescription>
				</DialogHeader>
				{open ? <TextTabPicker onTaken={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
