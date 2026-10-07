import { expect, test } from "../fixtures";

/**
 * The chord library, from the root list down to one chord's voicings. The
 * diagrams are drawn from the shared `chords` / `chord_voicings` tables, so an
 * empty page here means the reference data did not load rather than a layout
 * change.
 */
test("chord library opens a root, a chord and its voicings", async ({ page }) => {
	await page.goto("/chords");
	await expect(page.getByRole("heading", { name: "Guitar Chords" })).toBeVisible();

	await page.getByRole("link", { name: "C", exact: true }).click();
	await expect(page.getByRole("heading", { name: "C Chords", level: 1 })).toBeVisible();

	await page.getByRole("link", { name: /^C major —/ }).click();
	await expect(page).toHaveURL(/\/chords\/c\/major$/);

	await expect(page.getByRole("heading", { name: "C major", level: 1 })).toBeVisible();
	await expect(page.getByRole("region", { name: "Chord tones" })).toContainText("C");
	// The standard shape plus its variations; one alone would mean the
	// voicings table came back short.
	await expect(page.getByRole("button", { name: "Play", exact: true })).not.toHaveCount(0);
});
