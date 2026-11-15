/**
 * The assistant and the on-screen keyboard (#528). A phone's or tablet's keyboard
 * shrinks only the *visual* viewport: `dvh`, the layout viewport and every fixed
 * box stay their full height, so a panel sized from them is covered, and iOS pans
 * the whole page up to show the focused field. The panel reads the visual viewport
 * instead and fits itself into what is left above the keyboard.
 */

/** What `window.visualViewport` and the layout viewport report, in CSS px. */
export interface ViewportSample {
	/** `visualViewport.height`: the visible area, keyboard excluded. */
	vvHeight: number;
	/** `visualViewport.offsetTop`: how far the visible area is panned down the layout viewport. */
	vvOffsetTop: number;
	/** `visualViewport.scale`: pinch zoom. */
	vvScale: number;
	/** `document.documentElement.clientHeight`: the layout viewport, which no keyboard shrinks. */
	layoutHeight: number;
}

export interface VisibleArea {
	/** Where the visible area starts, from the layout viewport's top. */
	top: number;
	/** How tall it is. */
	height: number;
	/** Whether a keyboard is taking the rest. */
	keyboard: boolean;
}

/**
 * Less than this missing from the bottom is browser chrome (a toolbar showing
 * again), not a keyboard — the smallest keyboard, a phone's on its side, takes
 * more than twice it.
 */
export const KEYBOARD_MIN_PX = 120;

/** The visible area a sample describes, and whether a keyboard is up. */
export function visibleArea(sample: ViewportSample): VisibleArea {
	// Pinch zoom shrinks the visual viewport's height by its scale as well; only
	// what is still missing at full scale is taken by a keyboard.
	const missing = sample.layoutHeight - sample.vvHeight * sample.vvScale;
	return { top: sample.vvOffsetTop, height: sample.vvHeight, keyboard: missing > KEYBOARD_MIN_PX };
}

/** Two areas the panel would lay out the same for. */
export function sameArea(a: VisibleArea | null, b: VisibleArea): boolean {
	return a !== null && a.keyboard === b.keyboard && Math.abs(a.top - b.top) < 1 && Math.abs(a.height - b.height) < 1;
}

export interface PanelFit {
	/** The height the player dragged the conversation to. */
	wanted: number;
	/** Where the conversation starts while nothing pans the page, in visible px. */
	top: number;
	/** The visible area's height. */
	visibleHeight: number;
	/** What must stay visible under the conversation: the grip and a margin. */
	below: number;
	/** Never shorter than this, whatever the keyboard leaves. */
	min: number;
}

/**
 * The conversation's height with a keyboard up: what the player chose while it
 * fits, else exactly what is left between its top and the keyboard, so the
 * composer — its last row — sits on the keyboard. The chosen height is not
 * changed, only worn shorter, and comes back with the keyboard down.
 */
export function fitPanelHeight({ wanted, top, visibleHeight, below, min }: PanelFit): number {
	return Math.round(Math.max(min, Math.min(wanted, visibleHeight - top - below)));
}
