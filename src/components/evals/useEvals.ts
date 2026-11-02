"use client";

import { useEffect, useRef, useState } from "react";

import type { EvalRun, EvalSuiteListing } from "@/lib/evals/types";

/** While a run is writing: often enough that rows appear as they land. */
export const LIVE_POLL_MS = 2000;
/** Otherwise: slow, just to notice a run that has started. */
export const IDLE_POLL_MS = 10_000;

/**
 * Every suite's run headers, polled. Fast while any run is `running`, slow
 * otherwise, paused while the tab is hidden and refreshed when it returns.
 */
export function useEvalSuites(): { suites: EvalSuiteListing[] | null; error: string | null } {
	const [suites, setSuites] = useState<EvalSuiteListing[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const live = suites?.some((s) => s.runs.some((r) => r.status === "running")) ?? false;

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const load = async () => {
			try {
				const res = await fetch("/api/dev/evals", { cache: "no-store" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = (await res.json()) as { suites: EvalSuiteListing[] };
				if (!cancelled) {
					setSuites(body.suites);
					setError(null);
				}
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the eval runs.");
			}
		};
		const schedule = () => {
			clearTimeout(timer);
			if (document.visibilityState !== "visible") return;
			timer = setTimeout(async () => {
				await load();
				schedule();
			}, live ? LIVE_POLL_MS : IDLE_POLL_MS);
		};
		const onVisible = () => {
			if (document.visibilityState === "visible") void load().then(schedule);
			else clearTimeout(timer);
		};
		void load().then(schedule);
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			cancelled = true;
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [live]);

	return { suites, error };
}

/** One run with its cases, refetched whenever its file changes (`updatedAt`). */
export function useEvalRun(suite: string | null, runId: string | null, updatedAt: string | null): EvalRun | null {
	const [run, setRun] = useState<EvalRun | null>(null);
	const latest = useRef(0);

	useEffect(() => {
		if (!suite || !runId) return;
		const generation = ++latest.current;
		const params = new URLSearchParams({ suite, run: runId });
		void fetch(`/api/dev/evals?${params}`, { cache: "no-store" })
			.then((res) => (res.ok ? (res.json() as Promise<EvalRun>) : null))
			.then((body) => {
				if (generation === latest.current) setRun(body);
			})
			.catch(() => {
				if (generation === latest.current) setRun(null);
			});
	}, [suite, runId, updatedAt]);

	return suite && runId ? run : null;
}
