/*
 * Guitar Pal's service worker (#468): the tools keep working without a network.
 *
 * Hand-written rather than generated — the PWA plugins are built around
 * webpack, the build is Turbopack, and what this has to do is short:
 *
 * - the sound presets and the offline page are stored on install;
 * - content-hashed build files are served from the cache once fetched;
 * - the tool pages are fetched from the network first and kept, so a reload
 *   without one shows the last copy (any other page falls back to the offline
 *   page);
 * - the shared chord shapes are answered from the cache while a fresh copy is
 *   fetched behind them.
 *
 * Everything else — the assistant, reports, sign-in, Supabase, any write —
 * goes straight to the network, untouched.
 *
 * The page registers this file as `/sw.js?v=<build>`. A new build is a new
 * script URL, so the browser installs it, and the caches are named after the
 * build so the old ones can be dropped on activate. `strategyFor` and
 * `assetsIn` are plain functions so the unit tests can run them
 * (src/lib/pwa/__tests__/sw.test.ts).
 */

"use strict";

const VERSION = new URL(self.location.href).searchParams.get("v") || "local";
const STATIC_CACHE = `gp-static-${VERSION}`;
const PAGES_CACHE = `gp-pages-${VERSION}`;
const DATA_CACHE = `gp-data-${VERSION}`;

const OFFLINE_URL = "/offline.html";

/** Stored on install. A test checks every preset in public/audio/webaudiofont is listed. */
const PRECACHE = [
	OFFLINE_URL,
	"/icon-192.png",
	"/audio/webaudiofont/0000_Chaos_sf2_file.json",
	"/audio/webaudiofont/0250_LK_AcousticSteel_SF2_file.json",
	"/audio/webaudiofont/0280_Chaos_sf2_file.json",
];

/** Pages that work offline once their copy is kept: the tools, which need nothing from a server to play. */
const OFFLINE_PAGES = ["/", "/strum", "/tab", "/fretboard", "/docs/assistant-grammar"];
/** The same, for a page and everything under it. */
const OFFLINE_SECTIONS = ["/chords", "/tab/edit"];
/** Fetched in the background once the worker runs, so they open offline before they were ever visited. */
const WARM_PAGES = ["/strum", "/tab", "/fretboard", "/chords"];

/** Past this, the oldest kept pages and chord answers are dropped. */
const PAGE_LIMIT = 40;
const DATA_LIMIT = 200;
/**
 * How long a page may take before the kept copy is shown instead. A connection
 * that is up but carries nothing would otherwise leave a blank screen; the
 * fetch carries on and refreshes the copy if it ever answers.
 */
const PAGE_TIMEOUT_MS = 4000;

function pageWorksOffline(path) {
	return OFFLINE_PAGES.includes(path) || OFFLINE_SECTIONS.some((s) => path === s || path.startsWith(`${s}/`));
}

/**
 * What to do with a request:
 * `static` cache first, `page` network first and kept, `data` stale while
 * revalidating, `navigate` network with the offline page as the fallback,
 * `network` left alone.
 */
function strategyFor(method, href, mode) {
	if (method !== "GET") return "network";
	const url = new URL(href);
	if (url.origin !== self.location.origin) return "network";
	const path = url.pathname;
	if (path.startsWith("/_next/static/") || PRECACHE.includes(path)) return "static";
	if (path === "/api/chords/voicings") return "data";
	if (mode === "navigate") return pageWorksOffline(path) ? "page" : "navigate";
	return "network";
}

/**
 * The build files a page's HTML names: its scripts, styles and fonts, and the
 * client chunks its flight data lists (written there without `/_next/`).
 * A chunk loaded only on demand later is not named, and is kept when it loads.
 */
function assetsIn(html) {
	const found = new Set();
	for (const [match] of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>?#]+/g)) {
		found.add(match.startsWith("/_next/") ? match : `/_next/${match}`);
	}
	return [...found];
}

/** A page worth keeping: a real answer for this site, not a redirect (a signed-in visitor's `/` is one) or an error. */
function keepablePage(response) {
	return (
		response.ok &&
		!response.redirected &&
		response.type === "basic" &&
		(response.headers.get("content-type") || "").includes("text/html")
	);
}

async function trim(cache, limit) {
	const keys = await cache.keys();
	for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}

function timeout(ms) {
	return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function offlinePage() {
	return (await caches.match(OFFLINE_URL)) || Response.error();
}

async function cacheFirst(request) {
	const cache = await caches.open(STATIC_CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	if (response.ok && response.type === "basic") await cache.put(request, response.clone());
	return response;
}

async function pageNetworkFirst(event) {
	const { request } = event;
	const cache = await caches.open(PAGES_CACHE);
	const network = fetch(request).then(async (response) => {
		if (keepablePage(response)) {
			await cache.put(request.url, response.clone());
			await trim(cache, PAGE_LIMIT);
		}
		return response;
	});
	// It may lose the race below and fail later, with nobody listening.
	network.catch(() => undefined);
	try {
		return await Promise.race([network, timeout(PAGE_TIMEOUT_MS)]);
	} catch {
		// `/chords` renders from its query, so the exact page is preferred; any
		// copy of the page beats the offline page.
		const kept = (await cache.match(request.url)) || (await cache.match(request.url, { ignoreSearch: true }));
		if (kept) {
			event.waitUntil(network.catch(() => undefined));
			return kept;
		}
		try {
			return await network;
		} catch {
			return offlinePage();
		}
	}
}

async function networkOrOfflinePage(request) {
	try {
		return await fetch(request);
	} catch {
		return offlinePage();
	}
}

async function staleWhileRevalidate(event) {
	const { request } = event;
	const cache = await caches.open(DATA_CACHE);
	const kept = await cache.match(request);
	const network = fetch(request).then(async (response) => {
		if (response.ok) {
			await cache.put(request, response.clone());
			await trim(cache, DATA_LIMIT);
		}
		return response;
	});
	if (kept) {
		event.waitUntil(network.catch(() => undefined));
		return kept;
	}
	return network;
}

/** Fetches the tool pages not kept yet, with the build files each names. Asked for by the page once the worker runs. */
async function warmPages() {
	const pages = await caches.open(PAGES_CACHE);
	const statics = await caches.open(STATIC_CACHE);
	for (const path of WARM_PAGES) {
		const url = new URL(path, self.location.origin).href;
		if (await pages.match(url)) continue;
		try {
			const response = await fetch(url, { credentials: "same-origin" });
			if (!keepablePage(response)) continue;
			const html = await response.clone().text();
			await pages.put(url, response);
			await Promise.all(
				assetsIn(html).map(async (asset) => {
					if (await statics.match(asset)) return;
					const file = await fetch(asset);
					if (file.ok) await statics.put(asset, file);
				}),
			);
		} catch {
			// Offline, or the server failed: the next page load asks again.
		}
	}
}

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(STATIC_CACHE);
			// Past the HTTP cache, so a new build never stores an old preset.
			await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const current = [STATIC_CACHE, PAGES_CACHE, DATA_CACHE];
			for (const key of await caches.keys()) {
				if (key.startsWith("gp-") && !current.includes(key)) await caches.delete(key);
			}
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("message", (event) => {
	if (event.data === "warm") event.waitUntil(warmPages());
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const strategy = strategyFor(request.method, request.url, request.mode);
	if (strategy === "static") event.respondWith(cacheFirst(request));
	else if (strategy === "page") event.respondWith(pageNetworkFirst(event));
	else if (strategy === "data") event.respondWith(staleWhileRevalidate(event));
	else if (strategy === "navigate") event.respondWith(networkOrOfflinePage(request));
});
