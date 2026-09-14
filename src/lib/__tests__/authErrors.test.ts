import { describe, it, expect } from "vitest";
import { authErrorMessage } from "../authErrors";

describe("authErrorMessage", () => {
	it("maps the codes the sign-in and sign-up forms can hit", () => {
		expect(authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
			"That email and password don't match.",
		);
		expect(authErrorMessage({ code: "email_not_confirmed", message: "x" })).toMatch(/confirm your email/i);
		expect(authErrorMessage({ code: "user_already_exists", message: "x" })).toMatch(/already exists/i);
		expect(authErrorMessage({ code: "weak_password", message: "x" })).toMatch(/too weak/i);
		expect(authErrorMessage({ code: "over_request_rate_limit", message: "x" })).toMatch(/too many attempts/i);
	});

	it("treats email_exists like user_already_exists", () => {
		expect(authErrorMessage({ code: "email_exists", message: "x" })).toBe(
			authErrorMessage({ code: "user_already_exists", message: "x" }),
		);
	});

	it("never surfaces the raw message for an unknown code", () => {
		const raw = "<html>502 Bad Gateway</html>";
		expect(authErrorMessage({ code: "bad_jwt", message: raw })).not.toContain("502");
		expect(authErrorMessage({ message: raw })).not.toContain("502");
	});

	it("gives a generic line when there is no code (network failure)", () => {
		expect(authErrorMessage({ message: "Failed to fetch" })).toBe("Something went wrong. Try again.");
	});
});
