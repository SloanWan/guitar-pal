import { useEffect, useRef, useState } from "react";

export interface AutoScrollArgs {
	/** The scrolling viewer. */
	viewerRef: React.RefObject<HTMLElement | null>;
	/** Creep speed in px/s (remembered by the fingerpick preferences). */
	scrollSpeed: number;
	/** The creep stops itself whenever the pattern changes. */
	patternId: string;
	/**
	 * Whether the viewer is on screen at all. A viewer that mounts after the
	 * hook — the tab, once the pattern to open is known — is
	 * measured once this turns true, and the creep is switched off when it
	 * turns false. Defaults to true for a viewer that is always there.
	 */
	ready?: boolean;
}

export interface AutoScroll {
	/** The rows container inside the viewer, whose height is what can overflow. */
	contentRef: React.RefObject<HTMLDivElement | null>;
	autoScroll: boolean;
	setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
	/** Whether the content is taller than its viewer at all. */
	tabOverflows: boolean;
	/** On, and with something left to scroll. */
	autoScrollActive: boolean;
}

/**
 * Auto-scroll: the content creeps upward at a set speed for reading along
 * without a hand free. Off by default.
 */
export function useAutoScroll({ viewerRef, scrollSpeed, patternId, ready = true }: AutoScrollArgs): AutoScroll {
	const [autoScroll, setAutoScroll] = useState(false);
	// Whether the content is taller than its viewer at all — auto-scroll has
	// nothing to do otherwise. Re-measured whenever the viewer or the rows
	// change size (a window resize, a pattern switch, rows re-laid out), off
	// the rendered heights rather than any guess from the viewport.
	const [measuredOverflow, setMeasuredOverflow] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const viewer = viewerRef.current;
		const content = contentRef.current;
		if (!ready || !viewer || !content) return;
		const measure = () => {
			const overflows = viewer.scrollHeight > viewer.clientHeight + 1;
			setMeasuredOverflow((prev) => (prev === overflows ? prev : overflows));
		};
		const observer = new ResizeObserver(measure);
		observer.observe(viewer);
		observer.observe(content);
		return () => observer.disconnect();
	}, [viewerRef, ready]);
	// A measurement outlives the viewer it was taken on; it counts only while
	// the viewer is there to be scrolled.
	const tabOverflows = ready && measuredOverflow;
	// Leaving the viewer — another tab, nothing open — is a stop, not a pause:
	// the creep does not resume by itself when the viewer comes back. Settled
	// during render, the way a state that follows a prop is.
	const [wasReady, setWasReady] = useState(ready);
	if (wasReady !== ready) {
		setWasReady(ready);
		if (!ready) setAutoScroll(false);
	}
	// Content that stops overflowing (a smaller pattern, a taller window) has
	// nothing left to scroll; the creep effect below reads this and stops.
	const autoScrollActive = autoScroll && tabOverflows;
	const scrollSpeedRef = useRef(scrollSpeed);
	useEffect(() => {
		scrollSpeedRef.current = scrollSpeed;
	}, [scrollSpeed]);
	// The creep itself: a RAF loop moving the viewer by speed × elapsed,
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
