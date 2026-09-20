"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Expand, Minus, Plus, Scan, Shrink, X } from "lucide-react";

/**
 * An image with a magnifier: a toolbar (a title, −/+, fit, an optional close)
 * over a scrolling box. At "fit" the image spans the box. The − and + buttons
 * arm a tool rather than zooming by themselves: with one armed, a click on the
 * image zooms in or out *about that spot*, which stays under the pointer, so
 * a bar of notation can be walked into and back out again. Fit disarms.
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 1.5;

export type ZoomTool = "in" | "out";

/** The next zoom level in a direction, held inside the range. */
export function stepZoom(scale: number, direction: 1 | -1): number {
	const next = direction === 1 ? scale * ZOOM_STEP : scale / ZOOM_STEP;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
}

/**
 * Where the box must scroll to after the content grows by `ratio` so the
 * point that was clicked (in viewport coordinates) stays where it was.
 */
export function anchoredScroll(args: {
	clientX: number;
	clientY: number;
	rect: { left: number; top: number };
	scrollLeft: number;
	scrollTop: number;
	ratio: number;
}): { left: number; top: number } {
	const x = args.clientX - args.rect.left;
	const y = args.clientY - args.rect.top;
	return {
		left: Math.max(0, (args.scrollLeft + x) * args.ratio - x),
		top: Math.max(0, (args.scrollTop + y) * args.ratio - y),
	};
}

const TOOL =
	"flex size-7 items-center justify-center text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent disabled:opacity-30 disabled:hover:text-ink-dim focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:-outline-offset-2 aria-pressed:bg-denim aria-pressed:text-on-denim aria-pressed:hover:text-on-denim";

export default function ZoomableImage({
	src,
	alt,
	title,
	onClose,
	className = "",
}: {
	src: string;
	alt: string;
	/** Over the image; the alt when not given. */
	title?: string;
	/** Adds a close button at the toolbar's end. */
	onClose?: () => void;
	/** The scrolling box, for its height. */
	className?: string;
}) {
	const [scale, setScale] = useState(1);
	const [tool, setTool] = useState<ZoomTool | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	// The scroll position to take once the image has been re-laid out at the
	// new scale — set by the click, consumed after the render it caused.
	const pendingScroll = useRef<{ left: number; top: number } | null>(null);
	useLayoutEffect(() => {
		const box = boxRef.current;
		const next = pendingScroll.current;
		if (!box || !next) return;
		pendingScroll.current = null;
		box.scrollLeft = next.left;
		box.scrollTop = next.top;
	}, [scale]);

	function zoomAt(e: React.MouseEvent<HTMLDivElement>) {
		const box = boxRef.current;
		if (!tool || !box) return;
		const next = stepZoom(scale, tool === "in" ? 1 : -1);
		if (next === scale) return;
		pendingScroll.current = anchoredScroll({
			clientX: e.clientX,
			clientY: e.clientY,
			rect: box.getBoundingClientRect(),
			scrollLeft: box.scrollLeft,
			scrollTop: box.scrollTop,
			ratio: next / scale,
		});
		setScale(next);
	}

	const arm = (next: ZoomTool) => setTool((current) => (current === next ? null : next));
	const cursor = tool === "in" ? "cursor-zoom-in" : tool === "out" ? "cursor-zoom-out" : "";
	const fitLabel = scale > 1 ? "Shrink to fit" : scale < 1 ? "Grow to fit" : "Fit to width";

	return (
		<div className="flex min-h-0 flex-col">
			<div className="flex h-9 flex-none items-center gap-1 border-b border-line px-2">
				<span className="min-w-0 flex-1 truncate px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					{title ?? alt}
				</span>
				<button
					type="button"
					aria-label="Zoom out"
					aria-pressed={tool === "out"}
					title="Zoom out — then click the spot to zoom out from"
					disabled={scale <= ZOOM_MIN}
					onClick={() => arm("out")}
					className={TOOL}
				>
					<Minus className="size-3.5" strokeWidth={1.5} />
				</button>
				<span className="w-10 text-center font-mono text-[11px] tabular-nums text-ink-dim">
					{Math.round(scale * 100)}%
				</span>
				<button
					type="button"
					aria-label="Zoom in"
					aria-pressed={tool === "in"}
					title="Zoom in — then click the spot to zoom into"
					disabled={scale >= ZOOM_MAX}
					onClick={() => arm("in")}
					className={TOOL}
				>
					<Plus className="size-3.5" strokeWidth={1.5} />
				</button>
				{/* Back to fit. The glyph says which way that is from here: shrink
				    when zoomed in, grow when zoomed out, a plain frame at fit. */}
				<button
					type="button"
					aria-label={fitLabel}
					title={fitLabel}
					disabled={scale === 1 && tool === null}
					onClick={() => {
						setScale(1);
						setTool(null);
					}}
					className={TOOL}
				>
					{scale > 1 ? (
						<Shrink className="size-3.5" strokeWidth={1.5} />
					) : scale < 1 ? (
						<Expand className="size-3.5" strokeWidth={1.5} />
					) : (
						<Scan className="size-3.5" strokeWidth={1.5} />
					)}
				</button>
				{onClose ? (
					<button type="button" aria-label="Close" onClick={onClose} className={`${TOOL} ml-1`}>
						<X className="size-4" strokeWidth={1.5} />
					</button>
				) : null}
			</div>
			<div ref={boxRef} onClick={zoomAt} className={`min-h-0 overflow-auto bg-white ${cursor} ${className}`}>
				{/* A signed, hour-long Storage URL: not a candidate for next/image's loader. */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={src}
					alt={alt}
					draggable={false}
					style={{ width: `${scale * 100}%`, maxWidth: "none" }}
					className="block h-auto"
				/>
			</div>
		</div>
	);
}
