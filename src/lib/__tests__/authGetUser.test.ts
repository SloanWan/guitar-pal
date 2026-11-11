import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase", () => ({
	createClient: () => ({ auth: { getUser, getSession } }),
}));

const { getUser: currentUser } = await import("../auth");

const stored = { id: "u1", email: "player@example.com" };

describe("getUser", () => {
	beforeEach(() => {
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

	it("never trusts the stored session when Supabase answered no", async () => {
		getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("JWT expired", 401, "bad_jwt") });
		expect(await currentUser()).toBeNull();
		getUser.mockResolvedValue({ data: { user: null }, error: null });
		expect(await currentUser()).toBeNull();
		expect(getSession).not.toHaveBeenCalled();
	});
});
