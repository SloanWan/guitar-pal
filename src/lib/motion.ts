/**
 * Shared motion primitives.
 *
 * Extracted from the fingerpick editor once the strum editors wanted the same
 * spring and the same reduced-motion check — a third copy is where a constant
 * stops being a local detail.
 */

/** Overshoot-and-settle. Used for entrances and for "this just changed". */
export const SPRING_POP_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * Read at call time rather than cached, so a change to the OS setting takes
 * effect without a reload, and so it is safe on the server.
 */
export const prefersReducedMotion = (): boolean =>
	typeof window !== "undefined" &&
	!!window.matchMedia &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;
