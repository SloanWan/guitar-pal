"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";

/**
 * The page's own notation at full size, two ways (#233). With nothing open
 * beside the book it is a dialog in the middle of the page. With a draft
 * open it sits in the book's column instead — no backdrop, nothing dimmed,
 * closed only by its own button — so the page can be read against the
 * editor on the other side while a pattern is corrected.
 */

export interface CropView {
	url: string;
	alt: string;
}

export function CropDialog({ crop, onClose }: { crop: CropView | null; onClose: () => void }) {
	return (
		<Dialog open={crop !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="w-[calc(100%-2rem)] max-w-5xl gap-0 rounded-none border border-line-strong p-0 shadow-none sm:max-w-5xl"
			>
				{crop ? (
					<>
						<DialogTitle className="sr-only">{crop.alt}</DialogTitle>
						<ZoomableImage src={crop.url} alt={crop.alt} onClose={onClose} className="max-h-[80vh]" />
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/** Over the book's column, centred in what is visible of it; the column scrolls beneath. */
export function CropInspector({ crop, onClose }: { crop: CropView; onClose: () => void }) {
	return (
		<div className="pointer-events-none absolute inset-0 hidden items-center justify-center p-6 lg:flex">
			<div
				role="region"
				aria-label={crop.alt}
				className="pointer-events-auto flex max-h-full w-full max-w-3xl flex-col border border-line-strong bg-surface [box-shadow:var(--elev-panel)]"
			>
				<ZoomableImage src={crop.url} alt={crop.alt} onClose={onClose} />
			</div>
		</div>
	);
}
