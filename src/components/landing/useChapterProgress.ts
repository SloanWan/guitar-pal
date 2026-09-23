"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { chapterProgress, quantize } from "@/lib/landing/progress";
import { prefersReducedMotion } from "@/lib/motion";

/** Nearest ancestor that scrolls vertically; null when the window does. */
function scrollParent(el: HTMLElement): HTMLElement | null {
	for (let node = el.parentElement; node; node = node.parentElement) {
		const { overflowY } = getComputedStyle(node);
		if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight)
			return node;
	}
	return null;
}

export interface ChapterProgress {
	/** 0 at the chapter's start, 1 at its end, quantised so a tiny scroll re-renders nothing. */
	progress: number;
	/** The visitor asked for reduced motion: the chapter shows its end state, not a scroll-driven one. */
	reduced: boolean;
}

/**
 * How far the visitor has scrolled through a chapter section. The landing's
 * scroller is the `(main)` layout's `<main>`, not the window, so the scroll
 * listener goes on whichever ancestor actually scrolls and the geometry is
 * read from bounding rects, which are container-agnostic. Reading happens on
 * one animation frame per scroll event.
 */
export function useChapterProgress(ref: RefObject<HTMLElement | null>): ChapterProgress {
	const [progress, setProgress] = useState(0);
	const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);

	useEffect(() => {
		const el = ref.current;
		if (!el || reduced) return;
		const scroller = scrollParent(el);
		let frame = 0;
		const measure = () => {
			frame = 0;
			const rect = el.getBoundingClientRect();
			const viewportTop = scroller ? scroller.getBoundingClientRect().top : 0;
			const viewportHeight = scroller ? scroller.clientHeight : window.innerHeight;
			setProgress(
				quantize(
					chapterProgress({
						sectionTop: rect.top,
						sectionHeight: rect.height,
						viewportTop,
						viewportHeight,
					}),
				),
			);
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};
		const target: EventTarget = scroller ?? window;
		target.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		schedule();
		return () => {
			target.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame) cancelAnimationFrame(frame);
		};
	}, [ref, reduced]);

	return { progress: reduced ? 1 : progress, reduced };
}

function subscribeReducedMotion(onChange: () => void): () => void {
	const query = window.matchMedia("(prefers-reduced-motion: reduce)");
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}
