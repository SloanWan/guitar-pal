import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteAccount, wipeUserData } from "@/lib/account/userData";

export const dynamic = "force-dynamic";

function error(message: string, status: number): Response {
	return Response.json({ error: message }, { status });
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * A player who signs in with a password proves it again before anything is
 * deleted — the same reason the password change wants a code: a session left
 * open on a shared machine must not be enough. Checked on a throwaway client,
 * whose session is revoked straight after (`local` ends that one session, not
 * the player's others).
 */
async function passwordHolds(user: User, password: unknown): Promise<boolean> {
	if (typeof password !== "string" || password.length === 0 || !user.email) return false;
	const probe = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, NO_SESSION);
	const { error } = await probe.auth.signInWithPassword({ email: user.email, password });
	if (error) return false;
	await probe.auth.signOut({ scope: "local" });
	return true;
}

/**
 * `DELETE /api/account` deletes the signed-in player's account and everything
 * in it; `DELETE /api/account?scope=data` deletes everything but keeps the
 * account. Only ever acts on the user the session cookie names — there is no
 * id in the request to tamper with. Body: `{ password }` when the player has
 * a password sign-in.
 */
export async function DELETE(request: Request): Promise<Response> {
	const scope = new URL(request.url).searchParams.get("scope") ?? "account";
	if (scope !== "account" && scope !== "data") return error("scope must be account or data.", 400);

	const supabase = await createSupabaseServer();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return error("Sign in first.", 401);

	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!serviceKey) {
		console.error("[account] SUPABASE_SERVICE_ROLE_KEY is unset; accounts cannot be deleted");
		return error("Deleting is not available on this deployment.", 503);
	}

	const hasPassword = (user.identities ?? []).some((i) => i.provider === "email");
	if (hasPassword) {
		const body: unknown = await request.json().catch(() => null);
		const password = typeof body === "object" && body !== null && "password" in body ? body.password : undefined;
		if (!(await passwordHolds(user, password))) return error("That password isn't right.", 403);
	}

	const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, NO_SESSION);
	try {
		if (scope === "data") await wipeUserData(admin, user.id);
		else await deleteAccount(admin, user.id);
	} catch (e) {
		console.error(`[account] delete ${scope} failed for user=${user.id}:`, e);
		return error("Something went wrong part-way through. Try again — it picks up where it stopped.", 500);
	}
	return new Response(null, { status: 204 });
}
