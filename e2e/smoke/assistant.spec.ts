import { expect, test } from "../fixtures";

/**
 * The assistant in Strum mode, which is rules only — `buildProposal` runs in
 * the browser, nothing is sent to a model. General mode is left alone on
 * purpose: a guest's turns are counted against a daily budget, and the offline
 * evals (`npm run evals`) already cover the model path.
 */
test("the strum assistant proposes a pattern and hands it over", async ({ page }) => {
	await page.goto("/strum");

	await page.getByRole("button", { name: /assistant/i }).first().click();

	const ask = page.getByRole("textbox", { name: "Ask the strum assistant" });
	await expect(ask).toBeVisible();
	await ask.fill("C G Am F, D DU UDU at 92 bpm");
	await ask.press("Enter");

	// The card is always a reader's; only its presence is asserted, never the
	// wording of the reply around it.
	const open = page.getByRole("button", { name: "Open in strum" });
	await expect(open).toBeVisible();
	await open.click();

	await expect(page).toHaveURL(/\/strum$/);
});
