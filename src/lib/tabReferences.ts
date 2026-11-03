/**
 * A tab's reference links (#434): where it came from — a video, a track, a page.
 * Links only: nothing is embedded and nothing is fetched from the linked page, so
 * the site is told from the host alone.
 */

export interface TabReference {
	id: string;
	/** Always an absolute http(s) URL (`readReferenceUrl`). */
	url: string;
	/** The player's own name for it; absent, the host stands in. */
	label?: string;
}

export const MAX_REFERENCES = 10;
export const MAX_REFERENCE_URL = 2000;
export const MAX_REFERENCE_LABEL = 80;

export type ReferenceSite = "youtube" | "bilibili" | "spotify" | "netease" | "web";

/** How each site is named on screen. */
export const SITE_NAMES: Record<ReferenceSite, string> = {
	youtube: "YouTube",
	bilibili: "bilibili",
	spotify: "Spotify",
	netease: "NetEase Music",
	web: "Web",
};

/** The hosts each site answers on, short links included; a subdomain counts. */
const SITE_HOSTS: [ReferenceSite, string[]][] = [
	["youtube", ["youtube.com", "youtu.be", "youtube-nocookie.com"]],
	["bilibili", ["bilibili.com", "b23.tv"]],
	["spotify", ["spotify.com", "spotify.link"]],
	["netease", ["music.163.com", "163cn.tv"]],
];

export type ReferenceUrlResult = { url: string } | { error: string };

/**
 * What the player typed, as a link that may be stored: trimmed, given `https://`
 * when it has no scheme (`youtu.be/…`), and refused unless it is http(s) with a
 * host — `javascript:`, `data:` and the like never get through.
 */
export function readReferenceUrl(input: string): ReferenceUrlResult {
	const text = input.trim();
	if (!text) return { error: "Paste a link." };
	if (text.length > MAX_REFERENCE_URL) return { error: "That link is too long." };
	const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/:]+:\d+(\/|$)/.test(text);
	let url: URL;
	try {
		url = new URL(hasScheme ? text : `https://${text}`);
	} catch {
		return { error: "That doesn't look like a link." };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only web links (http or https) can be kept." };
	if (!url.hostname.includes(".") || url.username || url.password) return { error: "That doesn't look like a link." };
	return { url: url.href };
}

/** The host as a reader would say it: no `www.`. */
export function referenceHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

/** Which site a link is on, from its host. */
export function referenceSite(url: string): ReferenceSite {
	const host = referenceHost(url).toLowerCase();
	for (const [site, hosts] of SITE_HOSTS) {
		if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) return site;
	}
	return "web";
}

/** What a link's row is called: the player's name for it, else the site's, else its host. */
export function referenceTitle(ref: TabReference): string {
	if (ref.label) return ref.label;
	const site = referenceSite(ref.url);
	return site === "web" ? referenceHost(ref.url) : SITE_NAMES[site];
}

/**
 * The link as its row's second line: host first, so where it goes is always in
 * view (on a share page the links are someone else's), then the path, no scheme.
 */
export function referenceShortUrl(url: string): string {
	try {
		const u = new URL(url);
		const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
		return `${referenceHost(url)}${rest}`;
	} catch {
		return url;
	}
}

/** A name as stored: trimmed and capped, or absent. */
export function cleanReferenceLabel(label: string | undefined): string | undefined {
	const text = label?.trim().slice(0, MAX_REFERENCE_LABEL);
	return text || undefined;
}

/**
 * Stored references read back: each must hold an id and a link that passes
 * `readReferenceUrl` (as stored, unchanged), and a name if any is kept trimmed and
 * capped; bad entries and duplicate ids are dropped, and the list stops at
 * `MAX_REFERENCES`. Undefined when nothing is left, so a tab without links carries
 * no field.
 */
export function readReferences(raw: unknown): TabReference[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const out: TabReference[] = [];
	const ids = new Set<string>();
	for (const entry of raw) {
		if (out.length === MAX_REFERENCES) break;
		if (typeof entry !== "object" || entry === null) continue;
		const { id, url, label } = entry as Record<string, unknown>;
		if (typeof id !== "string" || !id || ids.has(id) || typeof url !== "string") continue;
		const read = readReferenceUrl(url);
		if ("error" in read || read.url !== url) continue;
		const name = typeof label === "string" ? cleanReferenceLabel(label) : undefined;
		ids.add(id);
		out.push(name ? { id, url, label: name } : { id, url });
	}
	return out.length > 0 ? out : undefined;
}
