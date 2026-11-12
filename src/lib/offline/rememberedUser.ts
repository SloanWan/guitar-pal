import type { User } from "@supabase/supabase-js";

/**
 * The last user Supabase confirmed on this device (#469).
 *
 * Offline, once the access token has expired, Supabase cannot refresh it and
 * reports no session, which would make a signed-in player a guest with an
 * empty library. The remembered user lets their copy be read instead. It is
 * never used while Supabase answers, it opens nothing the database would refuse
 * (every read and write is still checked there), and it is forgotten on a
 * sign-out or whenever Supabase confirms nobody is signed in.
 */

export const REMEMBERED_USER_KEY = "gp-offline-user";

export function rememberUser(user: User, storage: Storage = localStorage): void {
	try {
		storage.setItem(REMEMBERED_USER_KEY, JSON.stringify(user));
	} catch {
		// No storage: offline past the token, the player reads as a guest.
	}
}

export function rememberedUser(storage: Storage = localStorage): User | null {
	try {
		const saved = storage.getItem(REMEMBERED_USER_KEY);
		if (!saved) return null;
		const parsed: unknown = JSON.parse(saved);
		return typeof parsed === "object" && parsed !== null && "id" in parsed && typeof parsed.id === "string"
			? (parsed as User)
			: null;
	} catch {
		return null;
	}
}

export function forgetRememberedUser(storage: Storage = localStorage): void {
	try {
		storage.removeItem(REMEMBERED_USER_KEY);
	} catch {
		// Nothing was kept either.
	}
}
