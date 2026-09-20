"use client";

import { useSyncExternalStore } from "react";

/**
 * A CSS media query as a boolean, kept current without a setState-in-effect.
 * The server (and the first client paint) answers `fallback`; hydration
 * corrects it from the real query.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
	return useSyncExternalStore(
		(onChange) => {
			if (typeof window === "undefined" || !window.matchMedia) return () => {};
			const mq = window.matchMedia(query);
			mq.addEventListener("change", onChange);
			return () => mq.removeEventListener("change", onChange);
		},
		() => (typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia(query).matches : fallback),
		() => fallback,
	);
}
