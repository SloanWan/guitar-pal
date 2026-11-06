/**
 * What the site reports about itself (#447): errors, and the Web Vitals of a
 * real visit. The shapes here are what the browser sends; `schema.ts` is the
 * route's check of them (kept apart so the client never ships the validator).
 *
 * Nothing here identifies a player: no user id, no query string, no tab or
 * book content — a message, a trimmed stack, the route's pattern, the build,
 * and whether the screen was a phone's.
 */

export const MAX_EVENTS_PER_BATCH = 20;
/**
 * Twenty errors with full-length stacks come to ~46 KB; a body past this was
 * not sent by our client. Also what `sendBeacon` will carry at once.
 */
export const MAX_BATCH_BYTES = 64 * 1024;
export const MAX_MESSAGE_CHARS = 300;
export const MAX_STACK_CHARS = 2000;
export const MAX_ROUTE_CHARS = 120;

export const ERROR_SOURCES = ["window", "rejection", "boundary", "component", "server"] as const;
export type ErrorSource = (typeof ERROR_SOURCES)[number];

export const VITAL_NAMES = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITAL_NAMES)[number];

export const VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;
export type VitalRating = (typeof VITAL_RATINGS)[number];

export type ViewportClass = "phone" | "desktop";

interface EventBase {
	route: string;
	viewport: ViewportClass;
	build?: string;
}

export interface ErrorEvent extends EventBase {
	kind: "error";
	source: ErrorSource;
	message: string;
	stack?: string;
	digest?: string;
}

export interface VitalEvent extends EventBase {
	kind: "vital";
	name: VitalName;
	value: number;
	rating: VitalRating;
}

export type TelemetryEvent = ErrorEvent | VitalEvent;

export interface TelemetryBatch {
	events: TelemetryEvent[];
}

/** The app's dynamic segments, so `/chords/c/major` and `/chords/a/minor` count as one page. */
const DYNAMIC_ROUTES: readonly { pattern: RegExp; name: string | null }[] = [
	{ pattern: /^\/chords\/(?:all|grid|my|create)$/, name: null },
	{ pattern: /^\/chords\/[^/]+\/[^/]+$/, name: "/chords/[rootSlug]/[suffixSlug]" },
	{ pattern: /^\/chords\/[^/]+$/, name: "/chords/[rootSlug]" },
	{ pattern: /^\/books\/[^/]+$/, name: "/books/[id]" },
	{ pattern: /^\/p\/[^/]+$/, name: "/p/[id]" },
	{ pattern: /^\/tab\/edit\/[^/]+$/, name: "/tab/edit/[id]" },
];

/**
 * A path as the route it belongs to: the query and hash dropped, a trailing
 * slash dropped, and a dynamic segment named rather than spelled out — a share
 * id or a book id is not something a report should carry.
 */
export function routePattern(path: string): string {
	let p = path.split(/[?#]/, 1)[0] || "/";
	if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
	for (const { pattern, name } of DYNAMIC_ROUTES) {
		if (pattern.test(p)) return name ?? p;
	}
	return p.slice(0, MAX_ROUTE_CHARS);
}

/** Below the shell's 720px breakpoint is a phone, the way the layout itself decides. */
export function viewportClass(width: number): ViewportClass {
	return width < 720 ? "phone" : "desktop";
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Whatever was thrown, as a message and a stack that fit a row. */
export function describeError(thrown: unknown): { message: string; stack?: string } {
	if (thrown instanceof Error) {
		const message = clip(`${thrown.name}: ${thrown.message}`, MAX_MESSAGE_CHARS);
		return thrown.stack ? { message, stack: clip(thrown.stack, MAX_STACK_CHARS) } : { message };
	}
	if (typeof thrown === "string") return { message: clip(thrown, MAX_MESSAGE_CHARS) };
	let text: string;
	try {
		text = JSON.stringify(thrown) ?? String(thrown);
	} catch {
		text = String(thrown);
	}
	return { message: clip(text, MAX_MESSAGE_CHARS) };
}
