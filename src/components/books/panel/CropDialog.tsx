"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";

/** The page's own notation, as the reader cropped it, at full size (#233). */

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
