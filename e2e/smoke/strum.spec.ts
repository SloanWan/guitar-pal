import { expect, playAndStop, test } from "../fixtures";

/**
 * The strum machine, signed out. Progressions live in localStorage for a
 * visitor without an account (`useChordProgressions`), so this writes no rows
 * and has nothing to clean up.
 */
test.describe("strum machine", () => {
	test("plays a pattern and stops again", async ({ page }) => {
		await page.goto("/strum");
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
		await playAndStop(page, "Stop");
	});

	test("reads a typed chord line", async ({ page }) => {
		await page.goto("/strum");
		// The workspace opens on the Pattern tab; chord lines are the other one.
		await page.getByRole("button", { name: "Progressions", exact: true }).click();
		await page.getByRole("button", { name: "Add progression" }).click();

		const line = page.getByRole("textbox", { name: "Chord sequence" });
		await line.fill("C G Am F");
		// The read-out under the input is the parser's answer, chord by chord.
		const readout = page.getByRole("status", { name: "What the chord line resolves to" });
		await expect(readout).toHaveText("CGAmF");

		await line.press("Enter");
		// The composer closes only when the line was accepted.
		await expect(line).toBeHidden();
	});
});
