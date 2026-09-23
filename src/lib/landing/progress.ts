/**
 * Scroll progress for the landing page's chapters.
 *
 * A chapter is a tall section with a sticky stage inside it; "progress" is
 * how far the stage has travelled through the section, 0 when the section's
 * top reaches the top of the scrollport and 1 when its bottom reaches the
 * bottom. Everything a chapter animates is a pure function of that number,
 * so a demo can be rendered at any point of its story without scrolling.
 */

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Progress through the sub-range `[from, to]` of a chapter, clamped to 0..1. */
export function seg(p: number, from: number, to: number): number {
	return clamp01((p - from) / (to - from));
}

/** Which of `count` captions is showing at progress `p`: equal shares, last one holds to the end. */
export function captionIndex(p: number, count: number): number {
	if (count <= 0) return 0;
	return Math.min(count - 1, Math.max(0, Math.floor(p * count)));
}

export interface ChapterGeometry {
	/** Section top relative to the viewport. */
	sectionTop: number;
	sectionHeight: number;
	/** Top of the scrollport relative to the viewport (0 when the window scrolls). */
	viewportTop: number;
	viewportHeight: number;
}

export function chapterProgress(g: ChapterGeometry): number {
	const track = g.sectionHeight - g.viewportHeight;
	if (track <= 0) return g.sectionTop <= g.viewportTop ? 1 : 0;
	return clamp01((g.viewportTop - g.sectionTop) / track);
}

/** Steps a chapter's progress is quantised to, so a scroll frame that moves less than one step re-renders nothing. */
export const PROGRESS_STEPS = 200;

export function quantize(p: number): number {
	return Math.round(clamp01(p) * PROGRESS_STEPS) / PROGRESS_STEPS;
}
