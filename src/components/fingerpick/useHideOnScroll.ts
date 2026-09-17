import { useCallback, useEffect, useRef, useState } from "react";

export interface HideOnScrollArgs {
	/** The tab viewer: the scroll source on desktop (mobile scrolls `main`). */
	viewerRef: React.RefObject<HTMLDivElement | null>;
	/** True while the playhead's own scrollIntoView is in flight; never hides. */
	isAutoScrollingRef: React.RefObject<boolean>;
}

export interface HideOnScroll {
	controlsVisible: boolean;
	/** Show the controls again on any tab interaction. */
	restoreControls: () => void;
}

/**
 * Hide the mobile controls bar (and the NavBar, via a window event) when the
 * user scrolls down; restore after 40 px of upward scroll.
 */
export function useHideOnScroll({ viewerRef, isAutoScrollingRef }: HideOnScrollArgs): HideOnScroll {
	const [controlsVisible, setControlsVisible] = useState(true);
	const controlsVisibleRef = useRef(true);
	const lastScrollYRef = useRef(0);
	const scrollUpDistanceRef = useRef(0);

	useEffect(() => {
		const isDesktop = window.innerWidth >= 768;
		// Desktop: scroll source is the tab viewer; mobile: the main scroll container.
		const target: Element | null = isDesktop ? viewerRef.current : document.querySelector("main");
		if (!target) return;

		function handleScroll() {
			if (isAutoScrollingRef.current) return;
			const currentY = (target as HTMLElement).scrollTop;
			const delta = currentY - lastScrollYRef.current;
			lastScrollYRef.current = currentY;

			if (delta > 0) {
				scrollUpDistanceRef.current = 0;
				if (controlsVisibleRef.current) {
					controlsVisibleRef.current = false;
					setControlsVisible(false);
				}
			} else {
				scrollUpDistanceRef.current += Math.abs(delta);
				if (scrollUpDistanceRef.current >= 40 && !controlsVisibleRef.current) {
					controlsVisibleRef.current = true;
					setControlsVisible(true);
				}
			}
		}

		target.addEventListener("scroll", handleScroll, { passive: true });
		return () => target.removeEventListener("scroll", handleScroll);
	}, [viewerRef, isAutoScrollingRef]);

	const restoreControls = useCallback(() => {
		setControlsVisible(true);
		controlsVisibleRef.current = true;
		scrollUpDistanceRef.current = 0;
		window.dispatchEvent(new CustomEvent("fingerpick-controls-restore"));
	}, []);

	return { controlsVisible, restoreControls };
}
