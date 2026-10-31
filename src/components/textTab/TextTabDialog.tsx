"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TextTabPicker from "@/components/textTab/TextTabPicker";

/**
 * The text-tab picker (#228) as a dialog on the Tab page: paste,
 * listen, pick. The chosen reading lands through the handoff the page is
 * already listening for, so taking one closes this and opens the editor.
 */
export default function TextTabDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent data-m="tab" className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="gap-1.5 px-5 pt-5 pb-4 pr-12 text-left">
					<DialogTitle className="text-(length:--gp-t-h) font-semibold">Paste a text tab</DialogTitle>
					<DialogDescription className="text-(length:--gp-t-cap) text-gp-ink-2">
						Text tab carries frets and order, not rhythm. Listen to each reading and take the one that sounds
						like the recording.
					</DialogDescription>
				</DialogHeader>
				{open ? <TextTabPicker onTaken={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
