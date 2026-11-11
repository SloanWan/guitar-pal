import { CREDENTIALS, expect, playAndStop, signIn, test } from "../fixtures";

/**
 * A signed-in library read offline (#469): this device's copy lists the
 * player's own pattern and plays it, and every write waits for the connection.
 *
 * It writes one pattern to the throwaway account and deletes it again, online,
 * whatever happened in between. Chromium only, as `smoke/pwa.spec.ts` explains.
 */
test.use({ serviceWorkers: "allow" });

test.describe("offline library", () => {
	test.skip(!CREDENTIALS.email || !CREDENTIALS.password, "set E2E_EMAIL and E2E_PASSWORD to run");
	test.skip(({ browserName }) => browserName !== "chromium", "offline emulation bypasses the worker in WebKit");

	test("the player's own pattern is listed and plays offline; writes are disabled", async ({ page, context }) => {
		const name = `offline check ${Date.now().toString(36)}`;
		await page.goto("/auth?redirect=%2Fstrum");
		await signIn(page);
		// Signing in is a round trip to Supabase and then a page load; a slow link takes longer than an assertion's default.
		await expect(page).toHaveURL(/\/strum$/, { timeout: 30_000 });
		await page.evaluate(() => navigator.serviceWorker.ready);

		try {
			await page.getByRole("button", { name: "New" }).first().click();
			const dialog = page.getByRole("dialog", { name: "New pattern" });
			await dialog.getByRole("textbox", { name: "Strokes" }).fill("D D DU D");
			await dialog.getByRole("textbox", { name: "Pattern name" }).fill(name);
			await dialog.getByRole("button", { name: "Create", exact: true }).click();
			// The save is written to the account and read back before the pattern opens.
			await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible({ timeout: 20_000 });

			// Online once more: the page is kept by the worker, the library by its copy.
			// On a slow link the sign-in check and the read can each take seconds.
			await page.reload();
			await expect(page.getByText(name).first()).toBeVisible({ timeout: 20_000 });

			await context.setOffline(true);
			await page.reload();
			await expect(page.getByText("Your library is read-only")).toBeVisible();
			await page.getByText(name).first().click();
			await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
			await playAndStop(page, "Stop");

			await expect(page.getByRole("button", { name: "New" }).first()).toBeDisabled();
			await expect(page.getByRole("button", { name: "Edit this pattern" })).toBeDisabled();
			await expect(page.getByRole("button", { name: "Delete this pattern" })).toBeDisabled();
			await expect(page.getByRole("button", { name: `Favourite ${name}` }).first()).toBeDisabled();
		} finally {
			// Every pattern this spec ever made goes, including one a failed run left
			// behind (a save that landed after its assertion gave up).
			await context.setOffline(false);
			await page.goto("/strum");
			await expect(page.getByRole("button", { name: "New" }).first()).toBeEnabled();
			const leftovers = page.getByText(/^offline check /);
			for (let i = 0; i < 5 && (await leftovers.count()) > 0; i++) {
				await leftovers.first().click();
				await page.getByRole("button", { name: "Delete this pattern" }).click();
				await page.getByRole("alertdialog", { name: "Delete pattern" }).getByRole("button", { name: "Delete", exact: true }).click();
				await expect(page.getByRole("alertdialog", { name: "Delete pattern" })).toBeHidden();
			}
			await expect(leftovers).toHaveCount(0);
		}
	});
});
