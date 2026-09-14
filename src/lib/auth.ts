import type { UserIdentity } from "@supabase/supabase-js";
import { createClient } from "./supabase";
import { AVATAR_COLOR_KEY, AVATAR_ICON_KEY, NICKNAME_KEY } from "./profile";

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

export async function getUser() {
	const supabase = createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	return user;
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
