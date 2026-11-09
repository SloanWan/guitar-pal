import type { ViewportClass } from "./events";

/**
 * The monitor's filters (#458), read from its query: a range of the last 24
 * hours (by hour), 7 or 30 days (by day), and a screen class or all of them.
 * Anything unknown falls back to the default rather than erroring.
 */

export const MONITOR_RANGES = ["24h", "7d", "30d"] as const;
export type MonitorRange = (typeof MONITOR_RANGES)[number];
export const MONITOR_VIEWPORTS = ["all", "phone", "desktop"] as const;
export type MonitorViewport = (typeof MONITOR_VIEWPORTS)[number];

/** The dashboard's clock: the site's owner reads it in China. */
export const MONITOR_TIME_ZONE = "Asia/Shanghai";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<MonitorRange, number> = { "24h": 24 * HOUR_MS, "7d": 7 * 24 * HOUR_MS, "30d": 30 * 24 * HOUR_MS };

export interface MonitorView {
	range: MonitorRange;
	viewport: MonitorViewport;
	from: Date;
	to: Date;
	bucket: "hour" | "day";
	/** The summary's screen filter: null for all. */
	screen: ViewportClass | null;
}

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
	const one = Array.isArray(value) ? value[0] : value;
	return (allowed as readonly string[]).includes(one ?? "") ? (one as T) : fallback;
}

export function monitorView(query: { range?: string | string[]; viewport?: string | string[] }, now: Date = new Date()): MonitorView {
	const range = pick(query.range, MONITOR_RANGES, "7d");
	const viewport = pick(query.viewport, MONITOR_VIEWPORTS, "all");
	return {
		range,
		viewport,
		from: new Date(now.getTime() - RANGE_MS[range]),
		to: now,
		bucket: range === "24h" ? "hour" : "day",
		screen: viewport === "all" ? null : viewport,
	};
}

/** The query for a view, leaving out what is the default. */
export function monitorHref(view: { range: MonitorRange; viewport: MonitorViewport }): string {
	const query = new URLSearchParams();
	if (view.range !== "7d") query.set("range", view.range);
	if (view.viewport !== "all") query.set("viewport", view.viewport);
	const search = query.toString();
	return search ? `/monitor?${search}` : "/monitor";
}
