import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase", () => ({
	createClient: () => ({ auth: { getUser, getSession } }),
}));

const { getUser: currentUser } = await import("../auth");
const { REMEMBERED_USER_KEY } = await import("../offline/rememberedUser");

const offline = () => ({ data: { user: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) });

const stored = { id: "u1", email: "player@example.com" };

describe("getUser", () => {
	beforeEach(() => {
		localStorage.clear();
		getUser.mockReset();
		getSession.mockReset().mockResolvedValue({ data: { session: { user: stored } }, error: null });
	});

	it("returns the user Supabase confirms", async () => {
		getUser.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
		expect(await currentUser()).toEqual({ id: "u2" });
		expect(getSession).not.toHaveBeenCalled();
	});

	it("falls back to the stored session when Supabase cannot be reached (#468)", async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) });
		expect(await currentUser()).toEqual(stored);
	});

	it("is null offline with no stored session", async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("Failed to fetch", 0) });
		getSession.mockResolvedValue({ data: { session: null }, error: null });
		expect(await currentUser()).toBeNull();
	});

	it("past the token's life, falls back to the last user Supabase confirmed here (#469)", async () => {
		getUser.mockResolvedValueOnce({ data: { user: { id: "u3" } }, error: null });
		await currentUser();
		getUser.mockResolvedValue(offline());
		getSession.mockResolvedValue({ data: { session: null }, error: null });
		expect(await currentUser()).toEqual({ id: "u3" });
	});

	it("forgets the remembered user once Supabase says nobody is signed in", async () => {
		localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify({ id: "u3" }));
		getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("Auth session missing!", 400, "session_not_found") });
		expect(await currentUser()).toBeNull();
		expect(localStorage.getItem(REMEMBERED_USER_KEY)).toBeNull();
	});

	it("never trusts the stored session when Supabase answered no", async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("JWT expired", 401, "bad_jwt") });
		expect(await currentUser()).toBeNull();
		getUser.mockResolvedValue({ data: { user: null }, error: null });
		expect(await currentUser()).toBeNull();
		expect(getSession).not.toHaveBeenCalled();
	});
});
