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

	test("reads a typed chord line into a progression", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "Add progression" }).click();
		await page.getByRole("menuitem", { name: "Type chords" }).click();

		const line = page.getByRole("textbox", { name: "Chord sequence" });
		await line.fill("C G Am F");
		// The read-out under the input is the parser's answer, chord by chord.
		const readout = page.getByRole("status", { name: "What the chord line resolves to" });
		await expect(readout).toHaveText("CGAmF");

		await line.press("Enter");
		// The composer closes only when the line was accepted, and the new one opens.
		await expect(line).toBeHidden();
		await expect(page.getByRole("button", { name: /^Bar 3: Am\b/ })).toBeVisible();
	});

	test("changes a bar's chord in the sheet, then saves it", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "Add progression" }).click();
		await page.getByRole("menuitem", { name: "Type chords" }).click();
		await page.getByRole("textbox", { name: "Chord sequence" }).fill("C G");
		await page.getByRole("textbox", { name: "Chord sequence" }).press("Enter");

		await page.getByRole("button", { name: /^Bar 2: G\b/ }).click();
		const sheet = page.getByRole("dialog", { name: "Bar 2" });
		await sheet.getByRole("searchbox", { name: "Search chords" }).fill("Em");
		await sheet.getByRole("button", { name: "E minor", exact: true }).click();
		await sheet.getByRole("button", { name: "Apply", exact: true }).click();

		await expect(page.getByRole("button", { name: /^Bar 2: Em\b/ })).toBeVisible();
		const note = page.getByRole("status").filter({ hasText: "You changed this progression" });
		await expect(note).toBeVisible();
		await note.getByRole("button", { name: "Save", exact: true }).click();
		await expect(note).toBeHidden();
	});

	test("makes a two-bar pattern from typed strokes", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "New" }).first().click();
		const dialog = page.getByRole("dialog", { name: "New pattern" });
		await dialog.getByRole("textbox", { name: "Strokes" }).fill("D DU UDU | D D D D");
		// The grid follows the strokes: a second bar appears.
		await expect(dialog.getByText("Bar 2", { exact: true })).toBeVisible();
		await dialog.getByRole("textbox", { name: "Pattern name" }).fill("Smoke two-bar");
		await dialog.getByRole("button", { name: "Create", exact: true }).click();
		// A guest is offered the browser or an account.
		await dialog.getByRole("button", { name: "Save in this browser" }).click();
		await expect(page.getByRole("heading", { level: 1, name: "Smoke two-bar" })).toBeVisible();
		await expect(page.getByText("My pattern · 4/4 · 2 bars")).toBeVisible();
	});

	test("starts a progression from a preset", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "Add progression" }).click();
		await page.getByRole("menuitem", { name: "Start from a preset" }).click();
		const sheet = page.getByRole("dialog", { name: "Start from a preset" });
		await sheet.getByRole("button", { name: /^Four Chords/ }).click();
		await expect(page.getByRole("option", { name: /Four Chords/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /^Bar 4: F\b/ })).toBeVisible();
	});

	test("moves the player to the left and back", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "Move the player to the left" }).click();
		const back = page.getByRole("button", { name: "Move the player to the bottom" });
		await expect(back).toBeVisible();
		// Still the player: it plays from its new place.
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
		await back.click();
		await expect(page.getByRole("button", { name: "Move the player to the left" })).toBeVisible();
	});
});
