/**
 * Whether the primary input is a finger rather than a mouse or trackpad —
 * the device that raises a software keyboard when a field is focused.
 *
 * Read at call time rather than cached, so it is safe on the server and
 * follows a tablet that gains a keyboard, mirroring `prefersReducedMotion`.
 */
export const hasCoarsePointer = (): boolean =>
	typeof window !== "undefined" &&
	!!window.matchMedia &&
	window.matchMedia("(pointer: coarse)").matches;
