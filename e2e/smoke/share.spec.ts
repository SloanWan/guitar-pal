import { expect, test } from "../fixtures";

/**
 * A share link opens for anyone holding it, signed out, under the `anon`
 * policy. It needs a share that exists in the project, so the id is given
 * rather than made: creating one per run would need an account and would
 * leave rows behind.
 */
const SHARE_ID = process.env.E2E_SHARE_ID;

test("a share link opens the player signed out", async ({ page, context }) => {
	test.skip(!SHARE_ID, "set E2E_SHARE_ID to a public share in this project");
	await context.clearCookies();

	await page.goto(`/p/${SHARE_ID}`);
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});
