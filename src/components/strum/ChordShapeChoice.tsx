"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Library, PenLine } from "lucide-react";

/**
 * Two ways to change the shape a bar plays, put as a question.
 *
 * A chord the library carries usually has other voicings on file, and picking
 * one is quicker and safer than drawing; but a shape nobody stored can only be
 * drawn. So the pencil asks — for a library chord — and goes straight to the
 * editor for a bar kept under a name the library has nothing for, where there
 * is nothing to pick from.
 */
export default function ChordShapeChoice({
	open,
	chordLabel,
	onClose,
	onPickFromLibrary,
	onCreateOwn,
}: {
	open: boolean;
	chordLabel: string;
	onClose: () => void;
	onPickFromLibrary: () => void;
	onCreateOwn: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="w-[calc(100%-2rem)] max-w-80 gap-0 rounded-none border border-line-strong p-0 shadow-none">
				<DialogHeader className="p-4 pb-2">
					<DialogTitle className="text-sm">Change the shape for {chordLabel}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2 p-4 pt-2">
					<button
						type="button"
						onClick={onPickFromLibrary}
						className="flex items-center gap-3 border border-line-strong px-3 py-2.5 text-left transition-colors hover:border-denim hover:bg-denim-tint focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						<Library className="size-4 shrink-0 text-denim-accent" strokeWidth={1.5} aria-hidden="true" />
						<span className="flex flex-col">
							<span className="text-sm text-ink">Pick from the library</span>
							<span className="text-[11px] text-ink-dim">Another voicing of {chordLabel} already on file</span>
						</span>
					</button>
					<button
						type="button"
						onClick={onCreateOwn}
						className="flex items-center gap-3 border border-line-strong px-3 py-2.5 text-left transition-colors hover:border-denim hover:bg-denim-tint focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
					>
						<PenLine className="size-4 shrink-0 text-denim-accent" strokeWidth={1.5} aria-hidden="true" />
						<span className="flex flex-col">
							<span className="text-sm text-ink">Create your own voicing</span>
							<span className="text-[11px] text-ink-dim">Draw the shape on a fretboard</span>
						</span>
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
