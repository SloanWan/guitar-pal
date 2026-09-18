import { useEffect, useRef, useState } from "react";

// Auto-scroll: how fast the tab creeps upward while reading along, in px/s.
// One device-local preference for every page that creeps — the fingerpick
// tab and the strum progression card read the same speed.
const SCROLL_SPEED_KEY = "fingerpickScrollSpeed";

export const SCROLL_SPEED_MIN = 4;
export const SCROLL_SPEED_MAX = 60;
export const SCROLL_SPEED_DEFAULT = 16;
export function clampScrollSpeed(raw: number): number {
	if (!Number.isFinite(raw)) return SCROLL_SPEED_DEFAULT;
	return Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, Math.round(raw)));
}

/** The stored speed, clamped, or the default when nothing is stored. */
export function readScrollSpeed(): number {
	try {
		const stored = localStorage.getItem(SCROLL_SPEED_KEY);
		return stored === null ? SCROLL_SPEED_DEFAULT : clampScrollSpeed(Number(stored));
	} catch {
		return SCROLL_SPEED_DEFAULT;
	}
}

export function writeScrollSpeed(speed: number): void {
	try {
		localStorage.setItem(SCROLL_SPEED_KEY, String(speed));
	} catch {
		// storage unavailable — the speed lives for the session
	}
}

/**
 * The remembered creep speed on its own, for a page that has no other
 * preferences to read alongside it. Restored after mount, as the fingerpick
 * preferences are: the server render has no storage to read.
 */
export function useScrollSpeedPref(): [number, (raw: number) => void] {
	const [scrollSpeed, setScrollSpeedState] = useState(SCROLL_SPEED_DEFAULT);
	useEffect(() => {
		const stored = readScrollSpeed();
		queueMicrotask(() => setScrollSpeedState(stored));
	}, []);
	function setScrollSpeed(raw: number) {
		const speed = clampScrollSpeed(raw);
		setScrollSpeedState(speed);
		writeScrollSpeed(speed);
	}
	return [scrollSpeed, setScrollSpeed];
}

export interface AutoScrollArgs {
	/** The scrolling viewer. */
	viewerRef: React.RefObject<HTMLDivElement | null>;
	/** Creep speed in px/s (remembered by the preferences). */
	scrollSpeed: number;
	/** The creep stops itself whenever the pattern changes. */
	patternId: string;
	/**
	 * Whether the viewer is on screen at all. A viewer that mounts after the
	 * hook — the strum progression body exists only while one is open — is
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
