"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
	window.addEventListener("online", onChange);
	window.addEventListener("offline", onChange);
	return () => {
		window.removeEventListener("online", onChange);
		window.removeEventListener("offline", onChange);
	};
}

/**
 * Whether the browser believes it is online (#469). It can be wrong one way —
 * a connection that is up but reaches nothing reads as online — so it gates
 * only what cannot work offline, and the reads still fall back on a failure.
 */
export function useOnline(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => navigator.onLine,
		// The server renders the online page; an offline client corrects it on hydration.
		() => true,
	);
}
