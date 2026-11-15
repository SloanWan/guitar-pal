import type { ProfileSource } from "@/lib/profile";

/** What the server reads a session through: the slice of a Supabase client's `auth` used here. */
export interface SessionAuth {
	getClaims(): Promise<{
		data: { claims: { sub: string; email?: string; user_metadata?: Record<string, unknown> } } | null;
		error: unknown;
	}>;
	getUser(): Promise<{ data: { user: ProfileSource | null }; error: unknown }>;
}

/**
 * The signed-in player as the session cookie proves it, or null (#536).
 *
 * The project signs sessions with an asymmetric key (ES256), so `getClaims()`
 * checks the token against the cached public key without asking Supabase — no
 * round trip while the token is fresh, one refresh once it has expired. A
 * session revoked elsewhere still reads as signed in until its token expires
 * (≤ 1 h); data is not exposed by it, since RLS checks the same token the same
 * way. When the claims cannot be had — the keys could not be fetched, a token
 * that fails — the Auth server is asked instead, as before.
 */
export async function sessionUser(auth: SessionAuth): Promise<ProfileSource | null> {
	try {
		const { data, error } = await auth.getClaims();
		if (!error) return data ? userFromClaims(data.claims) : null;
	} catch {
		// Not an auth error (the keys' fetch itself failed): asked below all the same.
	}
	const {
		data: { user },
	} = await auth.getUser();
	return user;
}

/** The profile's slice of a user, from a verified token's claims. */
export function userFromClaims(claims: {
	sub: string;
	email?: string;
	user_metadata?: Record<string, unknown>;
}): ProfileSource {
	return { id: claims.sub, email: claims.email ?? null, user_metadata: claims.user_metadata ?? null };
}
