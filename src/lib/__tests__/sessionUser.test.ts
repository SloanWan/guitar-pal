import { describe, expect, it, vi } from "vitest";
import { sessionUser, userFromClaims, type SessionAuth } from "../sessionUser";

const claims = { sub: "u-1", email: "a@b.c", user_metadata: { nickname: "Sloan" } };

type ClaimsResult = Awaited<ReturnType<SessionAuth["getClaims"]>>;
type UserResult = Awaited<ReturnType<SessionAuth["getUser"]>>;

function auth(claimsResult: ClaimsResult, user: UserResult = { data: { user: null }, error: null }) {
	return {
		getClaims: vi.fn(async () => claimsResult),
		getUser: vi.fn(async () => user),
	};
}

describe("sessionUser", () => {
	it("reads a verified token's claims without asking the Auth server", async () => {
		const a = auth({ data: { claims }, error: null });
		await expect(sessionUser(a)).resolves.toEqual({ id: "u-1", email: "a@b.c", user_metadata: { nickname: "Sloan" } });
		expect(a.getUser).not.toHaveBeenCalled();
	});

	it("is signed out without a session, and asks no one", async () => {
		const a = auth({ data: null, error: null });
		await expect(sessionUser(a)).resolves.toBeNull();
		expect(a.getUser).not.toHaveBeenCalled();
	});

	it("asks the Auth server when the claims cannot be had", async () => {
		const user = { id: "u-1", email: "a@b.c", user_metadata: {} };
		const a = auth({ data: null, error: new Error("could not fetch the signing keys") }, { data: { user }, error: null });
		await expect(sessionUser(a)).resolves.toBe(user);
		expect(a.getUser).toHaveBeenCalledOnce();
	});

	it("asks the Auth server when checking the claims throws", async () => {
		const user = { id: "u-1", email: "a@b.c", user_metadata: {} };
		const a = auth({ data: null, error: null }, { data: { user }, error: null });
		a.getClaims.mockRejectedValueOnce(new TypeError("fetch failed"));
		await expect(sessionUser(a)).resolves.toBe(user);
	});

	it("is signed out when the Auth server does not know the token either", async () => {
		const a = auth({ data: null, error: new Error("invalid JWT") }, { data: { user: null }, error: new Error("bad jwt") });
		await expect(sessionUser(a)).resolves.toBeNull();
	});
});

describe("userFromClaims", () => {
	it("leaves what the token does not carry empty", () => {
		expect(userFromClaims({ sub: "u-2" })).toEqual({ id: "u-2", email: null, user_metadata: null });
	});
});
