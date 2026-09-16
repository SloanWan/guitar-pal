/**
 * Supabase auth errors as sentences a person can act on. The raw `message`
 * is server prose ("Invalid login credentials", "Email rate limit exceeded")
 * that leaks implementation and reads badly next to the form; the `code` is
 * the stable contract, so that is what is matched.
 */

/** The subset of an `AuthError` this needs — keeps callers and tests free of the class. */
export interface AuthErrorLike {
	code?: string;
	message: string;
}

const MESSAGES: Record<string, string> = {
	invalid_credentials: "That email and password don't match.",
	email_not_confirmed: "Confirm your email first — check your inbox for the link.",
	user_already_exists: "An account with this email already exists. Sign in instead.",
	email_exists: "An account with this email already exists. Sign in instead.",
	weak_password: "That password is too weak. Make it longer or mix in more character types.",
	email_address_invalid: "That doesn't look like a valid email address.",
	signup_disabled: "Sign-ups are closed right now.",
	over_request_rate_limit: "Too many attempts. Wait a minute and try again.",
	over_email_send_rate_limit: "We've sent as many emails as we can for now. Try again in a few minutes.",
	same_password: "That's already your password. Pick a different one.",
	otp_expired: "That link has expired. Request a new one.",
	validation_failed: "Check the email and password and try again.",
	request_timeout: "The server took too long to answer. Try again.",
};

const FALLBACK = "Something went wrong. Try again.";

/**
 * A known code maps to its sentence. An unknown code (or a network error,
 * which has none) falls back to a generic line rather than surfacing the raw
 * message — the raw text is unpredictable and sometimes an HTML fragment.
 */
export function authErrorMessage(error: AuthErrorLike): string {
	if (error.code && error.code in MESSAGES) return MESSAGES[error.code];
	return FALLBACK;
}
