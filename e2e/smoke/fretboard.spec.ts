import { expect, test } from "../fixtures";

/**
 * The fretboard playground: pick a key and a scale, see the neck change. The
 * neck is one labelled image, and its label says what is drawn on it, so the
 * label is the assertion.
 */
test("fretboard lays a chosen scale over the neck", async ({ page }) => {
	await page.goto("/fretboard");
	await expect(page.getByRole("heading", { name: "Fretboard Playground" })).toBeVisible();

	await page
		.getByRole("radiogroup", { name: "Key" })
		.getByRole("radio", { name: "A", exact: true })
		.click();
	await page.getByRole("combobox", { name: "Scale" }).selectOption({ label: "Minor pentatonic" });

	await expect(page.getByRole("img", { name: "A Minor pentatonic on the fretboard" })).toBeVisible();
});
