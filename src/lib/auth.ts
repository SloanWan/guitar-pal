import { isAuthRetryableFetchError, type UserIdentity } from "@supabase/supabase-js";
import { createClient } from "./supabase";
import { AVATAR_COLOR_KEY, AVATAR_ICON_KEY, NICKNAME_KEY } from "./profile";
import { forgetRememberedUser, rememberedUser, rememberUser } from "./offline/rememberedUser";

export async function signUp(email: string, password: string) {
	const supabase = createClient();
	const { data, error } = await supabase.auth.signUp({ email, password });
	return { data, error };
}

export async function signIn(email: string, password: string) {
	const supabase = createClient();
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	return { data, error };
}

export async function signOut() {
	const supabase = createClient();
	const { error } = await supabase.auth.signOut();
	return { error };
}

/**
 * How long each step of the sign-in check may take before Supabase is treated
 * as unreachable (#475). A connection that is up but carries nothing never
 * fails a request, it only leaves it waiting — and the page waits on this.
 */
export const SIGN_IN_CHECK_TIMEOUT_MS = 5000;

const TIMED_OUT = Symbol("timed out");

/** The answer, or `TIMED_OUT` once `ms` have passed; the timer goes either way. */
function within<T>(answer: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), ms);
	});
	return Promise.race([answer, late]).finally(() => clearTimeout(timer));
}

/**
 * The signed-in user, checked with Supabase. When Supabase cannot be reached
 * (offline, #468) — or does not answer in time (#475) — the session stored in
 * this browser answers instead, so a player is not taken for a guest; past the
 * access token's life there is no usable session (reading it would try to
 * refresh it, which can hang just the same), and the last user Supabase
 * confirmed here answers (#469). Both are unchecked, which is fine for what the
 * page shows, since every read and write is still checked by the database.
 */
export async function getUser() {
	const supabase = createClient();
	const checked = await within(supabase.auth.getUser(), SIGN_IN_CHECK_TIMEOUT_MS);
	if (checked !== TIMED_OUT) {
		const {
			data: { user },
			error,
		} = checked;
		if (user) {
			rememberUser(user);
			return user;
		}
		if (!isAuthRetryableFetchError(error)) {
			forgetRememberedUser();
			return null;
		}
	}
	const stored = await within(supabase.auth.getSession(), SIGN_IN_CHECK_TIMEOUT_MS);
	return (stored === TIMED_OUT ? null : stored.data.session?.user) ?? rememberedUser();
}

/**
 * The editable identity fields, written to `user_metadata` (see profile.ts for
 * why that and not a table). Pass `null` to clear a field; omit to leave it.
 */
export async function updateProfileMetadata(fields: {
	nickname?: string | null;
	avatarColor?: string | null;
	avatarIcon?: string | null;
}) {
	const supabase = createClient();
	const data: Record<string, string | null> = {};
	if (fields.nickname !== undefined) data[NICKNAME_KEY] = fields.nickname;
	if (fields.avatarColor !== undefined) data[AVATAR_COLOR_KEY] = fields.avatarColor;
	if (fields.avatarIcon !== undefined) data[AVATAR_ICON_KEY] = fields.avatarIcon;
	const { data: result, error } = await supabase.auth.updateUser({ data });
	return { data: result, error };
}

/**
 * Starts an email change. With Supabase's default "secure email change" the
 * new address is not live until links in both the old and new inboxes are
 * clicked; the caller's copy of the user keeps the old email until then.
 */
export async function updateEmail(email: string) {
	const supabase = createClient();
	const { data, error } = await supabase.auth.updateUser({ email });
	return { data, error };
}

/**
 * Emails the account a one-time code. Changing the password then needs that
 * code as the `nonce` — Supabase enforces it when "Secure password change" is
 * on in the dashboard; the form requires it regardless, so a stolen session
 * alone is never enough to change the password.
 */
export async function sendReauthenticationCode() {
	const supabase = createClient();
	const { error } = await supabase.auth.reauthenticate();
	return { error };
}

export async function updatePassword(password: string, nonce: string) {
	const supabase = createClient();
	const { data, error } = await supabase.auth.updateUser({ password, nonce });
	return { data, error };
}

/**
 * Detach one sign-in method. Supabase refuses to unlink the last identity,
 * and the dashboard's "manual linking" switch must be on for this call to
 * work at all — the caller should also gate on `identities.length > 1`.
 */
export async function unlinkIdentity(identity: UserIdentity) {
	const supabase = createClient();
	const { error } = await supabase.auth.unlinkIdentity(identity);
	return { error };
}

/** Re-pulls the user so `useUser` sees changes made outside `updateUser`. */
export async function refreshSession() {
	const supabase = createClient();
	const { error } = await supabase.auth.refreshSession();
	return { error };
}

/** Re-sends the sign-up confirmation email; rate-limited server-side. */
export async function resendSignUpConfirmation(email: string) {
	const supabase = createClient();
	const { error } = await supabase.auth.resend({ type: "signup", email });
	return { error };
}

/**
 * Emails a password-recovery link. It brings the user back to `/auth/reset`
 * with a PKCE code; the browser client exchanges it on load and raises
 * `PASSWORD_RECOVERY`, after which `setRecoveredPassword` can run. The
 * return address must be in the dashboard's redirect allowlist, or Supabase
 * silently falls back to the site URL.
 */
export async function requestPasswordReset(email: string) {
	const supabase = createClient();
	const { error } = await supabase.auth.resetPasswordForEmail(email, {
		redirectTo: `${window.location.origin}/auth/reset`,
	});
	return { error };
}

/**
 * The password change that follows a recovery link. No nonce: the recovery
 * session is minutes old, which is what "secure password change" asks for.
 */
export async function setRecoveredPassword(password: string) {
	const supabase = createClient();
	const { data, error } = await supabase.auth.updateUser({ password });
	return { data, error };
}

/**
 * Deletes the signed-in player's data (`"data"`, keeping the account) or the
 * whole account (`"account"`). Runs on the server, which has the admin key;
 * after `"account"` the local session is cleared too, since its tokens now
 * name a user that no longer exists. `password` is required (by the server)
 * when the account has a password sign-in.
 */
export async function deleteAccountData(
	scope: "data" | "account",
	password: string | null,
): Promise<{ error: Error | null }> {
	let res: Response;
	try {
		res = await fetch(`/api/account${scope === "data" ? "?scope=data" : ""}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(password === null ? {} : { password }),
		});
	} catch {
		return { error: new Error("Couldn't reach the server. Check your connection and try again.") };
	}
	if (!res.ok) {
		const body: unknown = await res.json().catch(() => null);
		const message =
			typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
				? body.error
				: "Something went wrong. Try again.";
		return { error: new Error(message) };
	}
	if (scope === "account") await createClient().auth.signOut({ scope: "local" });
	return { error: null };
}
