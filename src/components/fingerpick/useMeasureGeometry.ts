import { useEffect, useState } from "react";

/** Where a rendered measure sits inside the tab viewer, in its scroll coordinates. */
export interface MeasureRect {
	measureIndex: number;
	left: number;
	width: number;
	top: number;
	height: number;
	rowIndex: number;
}

/**
 * Read every measure's box from the stave rows. Each row is one SVG carrying
 * `data-stave-<measure>-x` / `-w` (note-area start and width inside the SVG),
 * written by TabStaveRow once it has drawn; SVGs without them (chord shapes,
 * icons) are not rows. Coordinates are relative to the viewer's content, so
 * they stay valid as it scrolls.
 */
export function readMeasureGeometry(viewer: HTMLElement, content: HTMLElement): MeasureRect[] {
	const viewerRect = viewer.getBoundingClientRect();
	const rects: MeasureRect[] = [];
	let rowIndex = 0;
	for (const svg of content.querySelectorAll("svg")) {
		const staves: { measureIndex: number; x: number; w: number }[] = [];
		for (const attr of Array.from(svg.attributes)) {
			const m = /^data-stave-(\d+)-x$/.exec(attr.name);
			if (!m) continue;
			const measureIndex = Number(m[1]);
			const w = parseFloat(svg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
			staves.push({ measureIndex, x: parseFloat(attr.value), w });
		}
		if (staves.length === 0) continue;
		const svgRect = svg.getBoundingClientRect();
		const top = svgRect.top - viewerRect.top + viewer.scrollTop;
		for (const { measureIndex, x, w } of staves) {
			rects.push({
				measureIndex,
				left: svgRect.left - viewerRect.left + viewer.scrollLeft + x,
				width: w,
				top,
				height: svgRect.height,
				rowIndex,
			});
		}
		rowIndex++;
	}
	rects.sort((a, b) => a.measureIndex - b.measureIndex);
	return rects;
}

function sameGeometry(a: MeasureRect[], b: MeasureRect[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const p = a[i];
		const q = b[i];
		if (
			p.measureIndex !== q.measureIndex ||
			p.left !== q.left ||
			p.width !== q.width ||
			p.top !== q.top ||
			p.height !== q.height ||
			p.rowIndex !== q.rowIndex
		)
			return false;
	}
	return true;
}

/**
 * The measure the point (viewer content coordinates) lands on: the row whose
 * band contains y — or the nearest row when the point is between rows — then
 * the measure whose span contains x, or the nearest one in that row. Null only
 * when there are no measures.
 */
export function measureAtPoint(geometry: readonly MeasureRect[], x: number, y: number): number | null {
	if (geometry.length === 0) return null;
	let rowIndex = -1;
	let best = Infinity;
	for (const r of geometry) {
		const d = y < r.top ? r.top - y : y > r.top + r.height ? y - (r.top + r.height) : 0;
		if (d < best) {
			best = d;
			rowIndex = r.rowIndex;
		}
	}
	let nearest: MeasureRect | null = null;
	let bestX = Infinity;
	for (const r of geometry) {
		if (r.rowIndex !== rowIndex) continue;
		const d = x < r.left ? r.left - x : x > r.left + r.width ? x - (r.left + r.width) : 0;
		if (d < bestX) {
			bestX = d;
			nearest = r;
		}
	}
	return nearest?.measureIndex ?? null;
}

export interface MeasureGeometryArgs {
	viewerRef: React.RefObject<HTMLDivElement | null>;
	/** The rows container inside the viewer; watched for the staves (re)drawing. */
	contentRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The measure boxes, re-read whenever the staves redraw (a pattern change, a
 * resize, the chord line appearing) and on window resize. Redraws are caught
 * by a MutationObserver on the rows container — TabStaveRow renders on its own
 * schedule (ResizeObserver + rAF) — and coalesced to one read per frame.
 */
export function useMeasureGeometry({ viewerRef, contentRef }: MeasureGeometryArgs): MeasureRect[] {
	const [geometry, setGeometry] = useState<MeasureRect[]>([]);

	useEffect(() => {
		const viewer = viewerRef.current;
		const content = contentRef.current;
		if (!viewer || !content) return;
		let raf = 0;
		const read = () => {
			raf = 0;
			const next = readMeasureGeometry(viewer, content);
			setGeometry((prev) => (sameGeometry(prev, next) ? prev : next));
		};
		const schedule = () => {
			if (raf === 0) raf = requestAnimationFrame(read);
		};
		const observer = new MutationObserver(schedule);
		observer.observe(content, { subtree: true, childList: true, attributes: true });
		window.addEventListener("resize", schedule);
		schedule();
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", schedule);
			if (raf !== 0) cancelAnimationFrame(raf);
		};
	}, [viewerRef, contentRef]);

	return geometry;
}
