"use client";

import { useEffect, useState } from "react";
import { sameArea, visibleArea, type VisibleArea } from "@/lib/assistant/keyboardViewport";

export interface KeyboardViewport extends VisibleArea {
	/** The panel's top while no keyboard pans the page, in visible px. */
	restTop: number;
}

/**
 * Follows the visual viewport while the panel is mounted (`panel` not null), so
 * the panel can fit what the on-screen keyboard leaves (#528).
 *
 * iOS shows a field the keyboard would cover by panning the whole page up,
 * header and all. The shell never scrolls the document — `<main>` scrolls itself
 * — so the window scrolling while the panel is open is that pan, and it is
 * undone: the panel moves instead, never the page. Where it cannot be undone the
 * area's `top` says how far the page went, and the panel follows it.
 */
export function useKeyboardViewport(panel: HTMLElement | null): KeyboardViewport | null {
	const [area, setArea] = useState<KeyboardViewport | null>(null);

	useEffect(() => {
		const vv = window.visualViewport;
		if (!panel || !vv) return;
		const scrollAtOpen = window.scrollY;
		let restTop = panel.getBoundingClientRect().top;
		let frame = 0;
		const timers: number[] = [];

		const measure = () => {
			frame = 0;
			if (window.scrollY !== scrollAtOpen) window.scrollTo(0, scrollAtOpen);
			const next = visibleArea({
				vvHeight: vv.height,
				vvOffsetTop: vv.offsetTop,
				vvScale: vv.scale,
				layoutHeight: document.documentElement.clientHeight,
			});
			if (!next.keyboard && next.top === 0) restTop = panel.getBoundingClientRect().top;
			setArea((prev) => (prev && sameArea(prev, next) && prev.restTop === restTop ? prev : { ...next, restTop }));
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		const onChange = () => {
			schedule();
			// iOS reports the keyboard before its animation has ended, and 26.0 at
			// times not at all once it is gone: measured again once it has settled.
			timers.forEach(clearTimeout);
			timers.length = 0;
			timers.push(window.setTimeout(schedule, 300), window.setTimeout(schedule, 800));
		};

		// Measured again once the panel's entrance has finished moving it.
		onChange();
		vv.addEventListener("resize", onChange);
		vv.addEventListener("scroll", onChange);
		window.addEventListener("scroll", onChange);
		return () => {
			cancelAnimationFrame(frame);
			timers.forEach(clearTimeout);
			vv.removeEventListener("resize", onChange);
			vv.removeEventListener("scroll", onChange);
			window.removeEventListener("scroll", onChange);
		};
	}, [panel]);

	return panel ? area : null;
}
