"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the primary input is a finger — the reactive form of
 * `hasCoarsePointer` in `@/lib/pointer`, for what is rendered rather than
 * decided. The server's answer is "no": it draws for a pointer, and the
 * first client render corrects it from the real media query.
 */
function subscribe(notify: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const mq = window.matchMedia("(pointer: coarse)");
	mq.addEventListener("change", notify);
	return () => mq.removeEventListener("change", notify);
}
const snapshot = (): boolean =>
	typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const serverSnapshot = (): boolean => false;

export function useCoarsePointer(): boolean {
	return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
