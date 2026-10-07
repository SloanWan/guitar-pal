import { expect, playAndStop, test } from "../fixtures";

/**
 * The fingerpick studio. The stave is VexFlow drawing into SVG, which jsdom
 * cannot do (no Canvas for its text metrics), so that it renders at all is
 * only ever checked here.
 */
test("fingerpick renders a tab stave and plays", async ({ page }) => {
	await page.goto("/fingerpick");

	const stave = page.locator("svg .vf-stave").first();
	await expect(stave).toBeVisible();

	await playAndStop(page, "Pause");
});
