import { expect, test } from "../fixtures";

/** The monitor (#458) is not there for a visitor: signed out, it is the site's 404. */
test("a signed-out visitor gets a 404 at /monitor", async ({ page }) => {
	const response = await page.goto("/monitor");
	expect(response?.status()).toBe(404);
});
