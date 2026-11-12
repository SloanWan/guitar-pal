/**
 * The page's side of the service worker (`public/sw.js`, #468): where it is,
 * and the cached pages it keeps.
 */

/** The worker's caches all start with this; the kept pages are `gp-pages-<build>`. */
export const PAGE_CACHE_PREFIX = "gp-pages-";

/** Which account the kept pages were fetched as: `""` signed out, else the user id; unset before the first event. */
export const CACHED_ACCOUNT_KEY = "gp-sw-account";

/** A new build is a new script URL, which is what makes the browser install the new worker. */
export function serviceWorkerUrl(version: string): string {
	return `/sw.js?v=${encodeURIComponent(version)}`;
}

/**
 * Whether an auth event means the kept pages belong to someone else. A kept
 * page carries the header of whoever was signed in when it was fetched, so they
 * go on a sign-out and when a different account (or the first one, after a
 * guest's pages) appears.
 *
 * A missing session is not a sign-out: offline, once the access token has
 * expired, Supabase cannot refresh it and reports no session at all — and
 * forgetting the pages then would take them away exactly when they are needed.
 * A real sign-out, here or in another tab, or a session the server revoked,
 * arrives as `SIGNED_OUT`.
 */
export function accountChanged(recorded: string | null, event: string, current: string | null): boolean {
	if (event === "SIGNED_OUT") return recorded !== "";
	return current !== null && current !== recorded;
}

/** What to record after an auth event: the new account, or nothing new when the event proves nothing. */
export function accountToRecord(recorded: string | null, event: string, current: string | null): string | null {
	if (event === "SIGNED_OUT") return "";
	return current ?? recorded;
}

/** Deletes every build's kept pages. The caches of sounds and build files are nobody's and stay. */
export async function forgetKeptPages(storage: CacheStorage): Promise<void> {
	const keys = await storage.keys();
	await Promise.all(keys.filter((key) => key.startsWith(PAGE_CACHE_PREFIX)).map((key) => storage.delete(key)));
}
