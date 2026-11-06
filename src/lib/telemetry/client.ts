import {
	describeError,
	MAX_EVENTS_PER_BATCH,
	routePattern,
	VITAL_NAMES,
	viewportClass,
	type ErrorSource,
	type TelemetryEvent,
	type VitalEvent,
	type VitalName,
	type VitalRating,
} from "./events";

/**
 * The browser's half of the reports (#447): the one place the site's errors
 * and Web Vitals leave the page. Call sites say what happened —
 * `reportError(e, "boundary")`, `reportVital(metric)` — and never how it is
 * sent, so the backend behind `/api/telemetry` can change without them.
 *
 * Errors go out a few seconds after the first one (a cascade is one batch);
 * vitals wait for the page to be hidden, when CLS and INP have their final
 * values. Each error is sent once a page load, and a page load sends at most
 * `PAGE_CAP` events, so a render loop cannot flood the table.
 */

export const TELEMETRY_ENDPOINT = "/api/telemetry";
export const PAGE_CAP = 40;
export const ERROR_FLUSH_MS = 3000;

export interface TelemetryEnv {
	production: boolean;
	/** `NEXT_PUBLIC_TELEMETRY`: "off" silences it, "on" sends from localhost too. */
	setting: string | undefined;
	/** An automated browser (Playwright, the e2e suite) reports nothing. */
	webdriver: boolean;
	hostname: string;
}

export function telemetryEnabled(env: TelemetryEnv): boolean {
	if (!env.production || env.setting === "off" || env.webdriver) return false;
	if (env.setting === "on") return true;
	return env.hostname !== "localhost" && env.hostname !== "127.0.0.1" && env.hostname !== "[::1]";
}

/** What `useReportWebVitals` hands over, as far as a report needs it. */
export interface VitalMetric {
	id: string;
	name: string;
	value: number;
	rating: string;
}

export interface ReporterDeps {
	send: (events: TelemetryEvent[]) => void;
	/** Where the page is, for the event's route. */
	path: () => string;
	width: () => number;
	build?: string;
	setTimer: (fn: () => void, ms: number) => unknown;
}

export interface Reporter {
	error: (thrown: unknown, source: ErrorSource, extra?: { digest?: string }) => void;
	vital: (metric: VitalMetric) => void;
	/** Everything waiting, now: the page is going away. */
	flush: () => void;
}

function isVitalName(name: string): name is VitalName {
	return (VITAL_NAMES as readonly string[]).includes(name);
}

function isRating(rating: string): rating is VitalRating {
	return rating === "good" || rating === "needs-improvement" || rating === "poor";
}

export function createReporter(deps: ReporterDeps): Reporter {
	const errors: TelemetryEvent[] = [];
	/** By metric id: a vital reported twice (CLS growing) keeps its latest value. */
	const vitals = new Map<string, VitalEvent>();
	const seen = new Set<string>();
	let sent = 0;
	let timer = false;

	function base() {
		return {
			route: routePattern(deps.path()),
			viewport: viewportClass(deps.width()),
			...(deps.build ? { build: deps.build } : {}),
		};
	}

	function send(events: TelemetryEvent[]) {
		const room = PAGE_CAP - sent;
		const batch = events.slice(0, Math.max(0, room));
		for (let i = 0; i < batch.length; i += MAX_EVENTS_PER_BATCH) {
			deps.send(batch.slice(i, i + MAX_EVENTS_PER_BATCH));
		}
		sent += batch.length;
	}

	function flushErrors() {
		timer = false;
		if (errors.length) send(errors.splice(0));
	}

	return {
		error(thrown, source, extra) {
			if (sent + errors.length >= PAGE_CAP) return;
			const { message, stack } = describeError(thrown);
			const event: TelemetryEvent = {
				kind: "error",
				source,
				message,
				...(stack ? { stack } : {}),
				...(extra?.digest ? { digest: extra.digest.slice(0, 64) } : {}),
				...base(),
			};
			const key = `${source}|${event.route}|${message}`;
			if (seen.has(key)) return;
			seen.add(key);
			errors.push(event);
			if (errors.length >= MAX_EVENTS_PER_BATCH) flushErrors();
			else if (!timer) {
				timer = true;
				deps.setTimer(flushErrors, ERROR_FLUSH_MS);
			}
		},
		vital(metric) {
			if (!isVitalName(metric.name) || !isRating(metric.rating) || !(metric.value >= 0)) return;
			vitals.set(metric.id, { kind: "vital", name: metric.name, value: metric.value, rating: metric.rating, ...base() });
		},
		flush() {
			const waiting = [...errors.splice(0), ...vitals.values()];
			vitals.clear();
			if (waiting.length) send(waiting);
		},
	};
}

function beacon(events: TelemetryEvent[]) {
	const body = JSON.stringify({ events });
	try {
		const blob = new Blob([body], { type: "application/json" });
		if (navigator.sendBeacon?.(TELEMETRY_ENDPOINT, blob)) return;
	} catch {
		// fall through to fetch
	}
	void fetch(TELEMETRY_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		keepalive: true,
	}).catch(() => undefined);
}

let shared: Reporter | null | undefined;

/** The page's reporter, made on first use; null where reports are off (dev, tests, automation, localhost). */
function reporter(): Reporter | null {
	if (shared !== undefined) return shared;
	if (typeof window === "undefined") return null;
	const enabled = telemetryEnabled({
		production: process.env.NODE_ENV === "production",
		setting: process.env.NEXT_PUBLIC_TELEMETRY,
		webdriver: navigator.webdriver === true,
		hostname: location.hostname,
	});
	if (!enabled) {
		shared = null;
		return shared;
	}
	const made = createReporter({
		send: beacon,
		path: () => location.pathname,
		width: () => window.innerWidth,
		build: process.env.NEXT_PUBLIC_BUILD_SHA || undefined,
		setTimer: (fn, ms) => window.setTimeout(fn, ms),
	});
	// Lives as long as the page does, so the listeners are never removed.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") made.flush();
	});
	window.addEventListener("pagehide", () => made.flush());
	shared = made;
	return shared;
}

export function reportError(thrown: unknown, source: ErrorSource, extra?: { digest?: string }): void {
	try {
		reporter()?.error(thrown, source, extra);
	} catch {
		// Reporting must never be the thing that breaks the page.
	}
}

export function reportVital(metric: VitalMetric): void {
	try {
		reporter()?.vital(metric);
	} catch {
		// as above
	}
}
