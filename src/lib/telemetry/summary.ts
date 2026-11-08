import type { ErrorSource, VitalName, VitalRating, ViewportClass } from "./events";
import { isCrawler, type StoredEvent } from "./store";

/**
 * What the monitor dashboard shows (#458), computed from the rows of a range.
 * Pure, so the numbers are tested rather than eyeballed: P75s the way
 * `percentile_cont(0.75)` takes them, an error rate per page load, errors per
 * hour or day by group, the recent errors, and the traffic that was not a
 * visitor (crawlers, and requests malformed on purpose) kept apart.
 */

/** Google's thresholds: at or under the first is good, over the second is poor. */
export const VITAL_THRESHOLDS: Readonly<Record<VitalName, readonly [good: number, poor: number]>> = {
	LCP: [2500, 4000],
	INP: [200, 500],
	CLS: [0.1, 0.25],
	FCP: [1800, 3000],
	TTFB: [800, 1800],
};

/** Fewer samples than this and a P75 is shown, but greyed: it says little. */
export const MIN_SAMPLES = 5;

/** The error groups the chart stacks: four, so the colours stay tellable apart. */
export const ERROR_GROUPS = ["page", "audio", "supabase", "server"] as const;
export type ErrorGroup = (typeof ERROR_GROUPS)[number];

export function errorGroup(source: ErrorSource): ErrorGroup {
	if (source === "audio" || source === "supabase" || source === "server") return source;
	return "page";
}

/**
 * A server error from a request that was malformed on purpose: a scanner
 * probing the site, not a page that broke. Counted apart from server errors.
 */
const MALFORMED_REQUEST = /Failed to parse body as (?:FormData|JSON)|Unexpected end of (?:form|JSON input)|Invalid (?:multipart|form) /i;

export function isMalformedRequest(message: string | null): boolean {
	return message !== null && MALFORMED_REQUEST.test(message);
}

/** `percentile_cont`: linear between the two nearest ranks. Null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = p * (sorted.length - 1);
	const low = Math.floor(rank);
	const high = Math.ceil(rank);
	return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export function rateVital(name: VitalName, value: number): VitalRating {
	const [good, poor] = VITAL_THRESHOLDS[name];
	if (value <= good) return "good";
	return value > poor ? "poor" : "needs-improvement";
}

export interface VitalCell {
	p75: number | null;
	n: number;
	rating: VitalRating | null;
}

export interface RouteVitals {
	route: string;
	/** Page loads: the route's FCP reports, one a load. */
	loads: number;
	metrics: Record<VitalName, VitalCell>;
}

export interface ErrorBucket {
	/** `2026-11-08` for a day, `2026-11-08 14` for an hour, in the dashboard's time zone. */
	key: string;
	counts: Record<ErrorGroup, number>;
}

export interface RecentError {
	source: ErrorSource;
	route: string;
	message: string;
	count: number;
	lastAt: string;
	build: string | null;
}

export interface AutomatedTraffic {
	/** Reports from crawlers (rows from before #453, or a user agent it does not catch). */
	crawlerRows: number;
	crawlerAgents: string[];
	/** Server errors from requests malformed on purpose. */
	malformedRequests: { route: string; message: string; count: number; lastAt: string }[];
}

export interface Summary {
	loads: number;
	browserErrors: number;
	/** Browser errors per page load; null without a load to divide by. */
	errorRate: number | null;
	serverErrors: number;
	overall: Record<"LCP" | "INP" | "CLS", VitalCell>;
	routes: RouteVitals[];
	buckets: ErrorBucket[];
	recentErrors: RecentError[];
	automated: AutomatedTraffic;
}

export interface SummaryOptions {
	from: Date;
	to: Date;
	bucket: "hour" | "day";
	/** Browser rows of this screen class only; server errors have none and always count. */
	viewport: ViewportClass | null;
	timeZone: string;
	recentLimit?: number;
}

const VITALS: readonly VitalName[] = ["LCP", "INP", "CLS", "FCP", "TTFB"];
const RECENT_LIMIT = 20;
const HOUR_MS = 60 * 60 * 1000;

function cell(name: VitalName, values: readonly number[]): VitalCell {
	const p75 = percentile(values, 0.75);
	return { p75, n: values.length, rating: p75 === null ? null : rateVital(name, p75) };
}

function emptyCounts(): Record<ErrorGroup, number> {
	return { page: 0, audio: 0, supabase: 0, server: 0 };
}

/** The bucket a moment falls in, in `timeZone`. */
export function bucketKey(at: Date, bucket: "hour" | "day", timeZone: string): string {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
			.formatToParts(at)
			.map((p) => [p.type, p.value]),
	);
	const day = `${parts.year}-${parts.month}-${parts.day}`;
	return bucket === "day" ? day : `${day} ${parts.hour}`;
}

/** Every bucket from `from` to `to`, oldest first, so an empty hour or day still has its slot. */
export function bucketKeys(from: Date, to: Date, bucket: "hour" | "day", timeZone: string): string[] {
	const keys: string[] = [];
	for (let t = from.getTime(); t <= to.getTime(); t += HOUR_MS) {
		const key = bucketKey(new Date(t), bucket, timeZone);
		if (keys[keys.length - 1] !== key) keys.push(key);
	}
	const last = bucketKey(to, bucket, timeZone);
	if (keys[keys.length - 1] !== last) keys.push(last);
	return keys;
}

export function summarize(events: readonly StoredEvent[], options: SummaryOptions): Summary {
	const { from, to, bucket, viewport, timeZone } = options;
	const inRange = events.filter((e) => {
		const t = Date.parse(e.at);
		return t >= from.getTime() && t <= to.getTime();
	});

	const crawlerAgents = new Set<string>();
	let crawlerRows = 0;
	const malformed = new Map<string, { route: string; message: string; count: number; lastAt: string }>();
	const visitors: StoredEvent[] = [];
	for (const e of inRange) {
		if (isCrawler(e.user_agent)) {
			crawlerRows++;
			if (e.user_agent) crawlerAgents.add(e.user_agent);
		} else if (e.kind === "error" && e.source === "server" && isMalformedRequest(e.message)) {
			const key = `${e.route}|${e.message}`;
			const seen = malformed.get(key);
			if (seen) {
				seen.count++;
				if (e.at > seen.lastAt) seen.lastAt = e.at;
			} else malformed.set(key, { route: e.route, message: e.message ?? "", count: 1, lastAt: e.at });
		} else visitors.push(e);
	}

	// The screen filter scopes the browser's rows; a server error was never on a screen.
	const scoped = visitors.filter((e) => viewport === null || e.viewport === null || e.viewport === viewport);
	const vitals = scoped.filter((e) => e.kind === "vital" && e.name !== null && e.value !== null);
	const errors = scoped.filter((e) => e.kind === "error" && e.source !== null);

	const byRoute = new Map<string, Record<VitalName, number[]>>();
	for (const v of vitals) {
		const values = byRoute.get(v.route) ?? { LCP: [], INP: [], CLS: [], FCP: [], TTFB: [] };
		values[v.name as VitalName].push(v.value as number);
		byRoute.set(v.route, values);
	}
	const routes: RouteVitals[] = [...byRoute.entries()]
		.map(([route, values]) => ({
			route,
			loads: values.FCP.length,
			metrics: Object.fromEntries(VITALS.map((name) => [name, cell(name, values[name])])) as Record<VitalName, VitalCell>,
		}))
		.sort((a, b) => b.loads - a.loads || a.route.localeCompare(b.route));

	const all = (name: VitalName) => vitals.filter((v) => v.name === name).map((v) => v.value as number);
	const loads = all("FCP").length;
	const browserErrors = errors.filter((e) => e.source !== "server").length;
	const serverErrors = errors.length - browserErrors;

	const buckets = new Map(bucketKeys(from, to, bucket, timeZone).map((key) => [key, emptyCounts()]));
	for (const e of errors) {
		const counts = buckets.get(bucketKey(new Date(e.at), bucket, timeZone));
		if (counts) counts[errorGroup(e.source as ErrorSource)]++;
	}

	const recent = new Map<string, RecentError>();
	for (const e of errors) {
		const key = `${e.source}|${e.route}|${e.message}`;
		const seen = recent.get(key);
		if (seen) {
			seen.count++;
			if (e.at > seen.lastAt) {
				seen.lastAt = e.at;
				seen.build = e.build;
			}
		} else recent.set(key, { source: e.source as ErrorSource, route: e.route, message: e.message ?? "", count: 1, lastAt: e.at, build: e.build });
	}

	return {
		loads,
		browserErrors,
		errorRate: loads === 0 ? null : browserErrors / loads,
		serverErrors,
		overall: { LCP: cell("LCP", all("LCP")), INP: cell("INP", all("INP")), CLS: cell("CLS", all("CLS")) },
		routes,
		buckets: [...buckets.entries()].map(([key, counts]) => ({ key, counts })),
		recentErrors: [...recent.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, options.recentLimit ?? RECENT_LIMIT),
		automated: {
			crawlerRows,
			crawlerAgents: [...crawlerAgents],
			malformedRequests: [...malformed.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
		},
	};
}
