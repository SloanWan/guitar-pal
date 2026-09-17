import { useEffect, useRef, useState } from "react";

export interface AutoScrollArgs {
	/** The scrolling tab viewer. */
	viewerRef: React.RefObject<HTMLDivElement | null>;
	/** Creep speed in px/s (remembered by the preferences). */
	scrollSpeed: number;
	/** The creep stops itself whenever the pattern changes. */
	patternId: string;
}

export interface AutoScroll {
	/** The rows container inside the viewer, whose height is what can overflow. */
	contentRef: React.RefObject<HTMLDivElement | null>;
	autoScroll: boolean;
	setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
	/** Whether the tab is taller than its viewer at all. */
	tabOverflows: boolean;
	/** On, and with something left to scroll. */
	autoScrollActive: boolean;
}

/**
 * Auto-scroll: the tab creeps upward at a set speed for reading along without
 * a hand free. Off by default.
 */
export function useAutoScroll({ viewerRef, scrollSpeed, patternId }: AutoScrollArgs): AutoScroll {
	const [autoScroll, setAutoScroll] = useState(false);
	// Whether the tab is taller than its viewer at all — auto-scroll has nothing
	// to do otherwise. Re-measured whenever the viewer or the rows change size
	// (a window resize, a pattern switch, rows re-laid out), off the RAF-rendered
	// stave heights rather than any guess from the viewport.
	const [tabOverflows, setTabOverflows] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const viewer = viewerRef.current;
		const content = contentRef.current;
		if (!viewer || !content) return;
		const measure = () => {
			const overflows = viewer.scrollHeight > viewer.clientHeight + 1;
			setTabOverflows((prev) => (prev === overflows ? prev : overflows));
		};
		const observer = new ResizeObserver(measure);
		observer.observe(viewer);
		observer.observe(content);
		return () => observer.disconnect();
	}, [viewerRef]);
	// A tab that stops overflowing (smaller pattern, taller window) has nothing
	// left to scroll; the creep effect below reads this and stops.
	const autoScrollActive = autoScroll && tabOverflows;
	const scrollSpeedRef = useRef(scrollSpeed);
	useEffect(() => {
		scrollSpeedRef.current = scrollSpeed;
	}, [scrollSpeed]);
	// The creep itself: a RAF loop moving the tab viewer by speed × elapsed,
	// carrying sub-pixel remainders so slow speeds still move. Stops itself at
	// the bottom, and whenever it is switched off or the pattern changes.
	useEffect(() => {
		if (!autoScrollActive) return;
		const viewer = viewerRef.current;
		if (!viewer) return;
		let raf = 0;
		let last = performance.now();
		let carry = 0;
		const step = (now: number) => {
			carry += (scrollSpeedRef.current * (now - last)) / 1000;
			last = now;
			const px = Math.floor(carry);
			if (px >= 1) {
				viewer.scrollTop += px;
				carry -= px;
			}
			if (viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 1) {
				setAutoScroll(false);
				return;
			}
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [autoScrollActive, patternId, viewerRef]);

	return { contentRef, autoScroll, setAutoScroll, tabOverflows, autoScrollActive };
}
