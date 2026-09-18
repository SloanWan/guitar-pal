"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_INTERVAL_MS = 2000;

/**
 * A resource loaded once and then re-fetched every couple of seconds while
 * `shouldPoll` says something is in flight — and not at all while the tab
 * is hidden. A scan takes minutes on a long scan, and the poll is the only
 * thing the page does in the meantime, so it stays this small.
 *
 * `load` is called as given on every fetch; hold it in `useCallback`.
 */
export function usePolledResource<T>(
	load: () => Promise<T>,
	shouldPoll: (value: T) => boolean,
): { value: T | null; error: unknown; refresh: () => Promise<void>; set: (value: T) => void } {
	const [value, setValue] = useState<T | null>(null);
	const [error, setError] = useState<unknown>(null);
	// The latest request wins; an older, slower one never overwrites it.
	const generation = useRef(0);

	const refresh = useCallback(async () => {
		const mine = ++generation.current;
		try {
			const next = await load();
			if (mine === generation.current) {
				setValue(next);
				setError(null);
			}
		} catch (e) {
			if (mine === generation.current) setError(e);
		}
	}, [load]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const mine = ++generation.current;
			try {
				const next = await load();
				if (!cancelled && mine === generation.current) {
					setValue(next);
					setError(null);
				}
			} catch (e) {
				if (!cancelled && mine === generation.current) setError(e);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [load]);

	const active = value !== null && shouldPoll(value);
	useEffect(() => {
		if (!active) return;
		let timer: ReturnType<typeof setInterval> | null = null;
		const start = () => {
			if (timer === null) timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
		};
		const stop = () => {
			if (timer !== null) clearInterval(timer);
			timer = null;
		};
		const onVisibility = () => {
			if (document.visibilityState === "visible") {
				void refresh();
				start();
			} else {
				stop();
			}
		};
		if (document.visibilityState === "visible") start();
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [active, refresh]);

	const set = useCallback((next: T) => {
		++generation.current;
		setValue(next);
	}, []);

	return { value, error, refresh, set };
}
