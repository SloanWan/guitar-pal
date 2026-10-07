import { CREDENTIALS, expect, signIn, test } from "../fixtures";

/**
 * The one flow that needs an account: sign in, and the two redirects `proxy.ts`
 * makes around it. `/home` and `/settings` are the only guarded pages — the
 * players themselves are open to everyone.
 *
 * Set `E2E_EMAIL` / `E2E_PASSWORD` to a throwaway user in the Supabase project
 * (already confirmed, since this cannot read a mailbox). Nothing is written
 * beyond the session itself.
 */
test.describe("account", () => {
	test.skip(!CREDENTIALS.email || !CREDENTIALS.password, "set E2E_EMAIL and E2E_PASSWORD to run");

	test("a guarded page bounces to auth and comes back after signing in", async ({ page }) => {
		await page.goto("/home");
		await expect(page).toHaveURL(/\/auth\?redirect=%2Fhome$/);

		await signIn(page);

		// The return path is honoured, not the default home.
		await expect(page).toHaveURL(/\/home$/);

		// And signing in is remembered: /auth sends a signed-in visitor away.
		await page.goto("/auth");
		await expect(page).not.toHaveURL(/\/auth/);
	});
});
