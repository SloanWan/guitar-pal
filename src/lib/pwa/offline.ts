/**
 * The page's side of the service worker (`public/sw.js`, #468): where it is,
 * and the cached pages it keeps.
 */

/** The worker's caches all start with this; the kept pages are `gp-pages-<build>`. */
export const PAGE_CACHE_PREFIX = "gp-pages-";

/** Which account the kept pages were fetched as: `""` signed out, else the user id. */
export const CACHED_ACCOUNT_KEY = "gp-sw-account";

/** A new build is a new script URL, which is what makes the browser install the new worker. */
export function serviceWorkerUrl(version: string): string {
	return `/sw.js?v=${encodeURIComponent(version)}`;
}

/**
 * Whether the kept pages belong to someone else. A kept page carries the
 * header of whoever was signed in when it was fetched, so they go whenever the
 * account changes — including to and from signed out, and when nothing was
 * recorded yet.
 */
export function accountChanged(recorded: string | null, current: string | null): boolean {
	return recorded !== (current ?? "");
}

/** Deletes every build's kept pages. The caches of sounds and build files are nobody's and stay. */
export async function forgetKeptPages(storage: CacheStorage): Promise<void> {
	const keys = await storage.keys();
	await Promise.all(keys.filter((key) => key.startsWith(PAGE_CACHE_PREFIX)).map((key) => storage.delete(key)));
}
