import { expect, test } from "../fixtures";

/**
 * The chords hub and a chord's page. The diagrams are drawn from the shared
 * `chords` / `chord_voicings` tables, so an empty page here means the reference
 * data did not load rather than a layout change.
 */
test("the hub opens a chord, and the chord page moves to the next", async ({ page }) => {
	await page.goto("/chords");
	await expect(page.getByRole("textbox", { name: "Look up chords" })).toBeVisible();
	await expect(page.getByRole("button", { name: "C chords" })).toHaveAttribute("aria-pressed", "true");

	await page.getByRole("region", { name: "Library" }).getByRole("link", { name: /^C\s+Major triad/ }).click();
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

test("several chords typed go on the board, and the board is in the address", async ({ page }) => {
	await page.goto("/chords");
	await page.getByRole("textbox", { name: "Look up chords" }).fill("C Am F G");
	await page.getByRole("button", { name: "Put 4 on the board" }).click();

	const board = page.getByRole("region", { name: "Board" });
	await expect(board.getByRole("link", { name: "Am" })).toBeVisible();
	await expect(page).toHaveURL(/board=C(\+|%20)Am(\+|%20)F(\+|%20)G/);

	await board.getByRole("button", { name: "Take Am off the board" }).click();
	await expect(board.getByRole("link", { name: "Am" })).toHaveCount(0);
});

test("an old side-by-side link lands on a board of the same chords", async ({ page }) => {
	await page.goto("/chords/grid?q=Em,C");
	await expect(page).toHaveURL(/\/chords\?board=/);
	await expect(page.getByRole("region", { name: "Board" }).getByRole("link", { name: "Em" })).toBeVisible();
});
