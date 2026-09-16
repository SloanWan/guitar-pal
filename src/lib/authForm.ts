/**
 * Pure helpers for the sign-in page: which tab is open, whether an email is
 * worth sending, and the two things the page remembers between visits.
 */

export type AuthMode = "signin" | "signup";

/** `?mode=signup` opens the sign-up tab; anything else is sign-in. */
export function parseAuthMode(raw: string | null | undefined): AuthMode {
	return raw === "signup" ? "signup" : "signin";
}

/**
 * Deliberately loose: one `@` with something on both sides and a dot in the
 * domain. The server validates for real; this only catches the typo before a
 * round trip, and must never reject an address Supabase would accept.
 */
export function isPlausibleEmail(email: string): boolean {
	const trimmed = email.trim();
	const at = trimmed.indexOf("@");
	if (at < 1 || at !== trimmed.lastIndexOf("@")) return false;
	const domain = trimmed.slice(at + 1);
	if (/\s/.test(trimmed)) return false;
	const dot = domain.lastIndexOf(".");
	return dot > 0 && dot < domain.length - 1;
}

export const REMEMBERED_EMAIL_KEY = "gp-auth-email";
export const LAST_METHOD_KEY = "gp-auth-method";

export type AuthMethod = "email" | "google";

function storage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.localStorage;
	} catch {
		// Storage access throws in some privacy modes; remembering is optional.
		return null;
	}
}

/** The email that last signed in successfully on this browser, if any. */
export function readRememberedEmail(): string | null {
	const value = storage()?.getItem(REMEMBERED_EMAIL_KEY);
	return value && value.length > 0 ? value : null;
}

export function rememberEmail(email: string): void {
	storage()?.setItem(REMEMBERED_EMAIL_KEY, email.trim());
}

export function readLastMethod(): AuthMethod | null {
	const value = storage()?.getItem(LAST_METHOD_KEY);
	return value === "email" || value === "google" ? value : null;
}

export function rememberMethod(method: AuthMethod): void {
	storage()?.setItem(LAST_METHOD_KEY, method);
}
