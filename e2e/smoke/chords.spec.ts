import { expect, test } from "../fixtures";

/**
 * The chord library, from the root list down to one chord's page, and on to the
 * next chord from the library beside it. The diagrams are drawn from the shared
 * `chords` / `chord_voicings` tables, so an empty page here means the reference
 * data did not load rather than a layout change.
 */
test("chord library opens a root, a chord and its shapes", async ({ page }) => {
	await page.goto("/chords");
	await expect(page.getByRole("heading", { name: "Guitar Chords" })).toBeVisible();

	await page.getByRole("link", { name: "C", exact: true }).click();
	await expect(page.getByRole("heading", { name: "C Chords", level: 1 })).toBeVisible();

	await page.getByRole("link", { name: /^C major —/ }).click();
	await expect(page).toHaveURL(/\/chords\/c\/major$/);

	await expect(page.getByRole("heading", { name: "C", level: 1 })).toBeVisible();
	await expect(page.getByRole("list", { name: "Chord tones" })).toContainText("E");
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
	// The standard shape plus its variations; one alone would mean the voicings
	// table came back short.
	await expect(page.getByRole("button", { name: /^Shape \d+:/ })).not.toHaveCount(1);
	await page.getByRole("button", { name: "Next shape" }).click();
	await expect(page.getByText("Shape 2 of", { exact: false })).toBeVisible();

	const library = page.getByRole("complementary", { name: "Chord library" });
	await library.getByRole("link", { name: /^Cm\b/ }).first().click();
	await expect(page).toHaveURL(/\/chords\/c\/minor$/);
	await expect(page.getByRole("heading", { name: "Cm", level: 1 })).toBeVisible();
});
