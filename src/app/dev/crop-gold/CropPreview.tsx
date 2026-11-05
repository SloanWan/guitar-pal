import type { Box } from "@/lib/cropGold";

/**
 * The crop a box makes, drawn from the page image the canvas shows: the image
 * is the reading resolution, so this is what the reader will be given.
 */
export default function CropPreview({
	src,
	box,
	size,
}: {
	src: string;
	box: Box;
	size: { width: number; height: number } | null;
}) {
	const [x0, y0, x1, y1] = box;
	const w = x1 - x0;
	const h = y1 - y0;
	if (!size || w <= 0 || h <= 0) return <div className="cg-preview cg-preview-empty" />;
	return (
		<div className="cg-preview" style={{ aspectRatio: `${size.width * w} / ${size.height * h}` }}>
			{/* eslint-disable-next-line @next/next/no-img-element -- a window onto the page image, not an asset */}
			<img
				src={src}
				alt=""
				draggable={false}
				style={{ width: `${100 / w}%`, left: `${(-x0 / w) * 100}%`, top: `${(-y0 / h) * 100}%` }}
			/>
		</div>
	);
}
