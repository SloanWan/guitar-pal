"use client";

import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";

/**
 * The page's own notation, as the reader cropped it, at full size (#233),
 * two ways. From 960px it floats over the book's column (`CropInspector`) —
 * no backdrop, nothing dimmed, the panel beside it still live — so the page
 * can be read against the draft being played. Below that the panel is a
 * sheet over the page, and the crop is a dialog over the sheet.
 */

export interface CropView {
	url: string;
	alt: string;
}

export default function CropDialog({ crop, onClose }: { crop: CropView | null; onClose: () => void }) {
	return (
		<Dialog open={crop !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				data-m="books"
				showCloseButton={false}
				className="w-[calc(100%-2rem)] max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl"
			>
				{crop ? (
					<>
						<DialogTitle className="sr-only">{crop.alt}</DialogTitle>
						{/* min-w-0: a grid item otherwise takes the crop's own width and
						    carries the dialog past a phone's edge (#261). */}
						<div className="min-w-0 bg-white">
							<ZoomableImage src={crop.url} alt={crop.alt} onClose={onClose} className="max-h-[80vh] w-full" />
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

/** Over the book's column, beside the open panel; closed by its own button or Escape. */
export function CropInspector({ crop, onClose }: { crop: CropView; onClose: () => void }) {
	// Escape closes this before the panel under it: heard first, in the capture
	// phase, and marked handled so the panel's own listener lets it be.
	const close = useRef(onClose);
	useEffect(() => {
		close.current = onClose;
	});
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key !== "Escape") return;
			e.preventDefault();
			close.current();
		}
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, []);
	return (
		<div className="bk-inspector">
			<div role="region" aria-label={crop.alt} className="bk-inspector-card">
				<ZoomableImage src={crop.url} alt={crop.alt} onClose={onClose} className="bk-inspector-img" />
			</div>
		</div>
	);
}
