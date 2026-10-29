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

test("the chord page arpeggiates and shows the chord on the neck", async ({ page }) => {
	await page.goto("/chords/c/major");
	await expect(page.getByRole("button", { name: "Arpeggio" })).toBeVisible();
	const neck = page.getByRole("region", { name: "On the neck" });
	await expect(neck.getByRole("img", { name: /shape 1 boxed/ })).toBeVisible();

	// A marker under the neck moves the stage to that shape.
	await neck.getByRole("group", { name: "Jump to a shape on the neck" }).getByRole("button").nth(1).click();
	await expect(page.getByText("Shape 2 of")).toBeVisible();
	await expect(neck.getByRole("img", { name: /shape 2 boxed/ })).toBeVisible();
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

test("the board transposes, and goes to Strum as a progression", async ({ page }) => {
	await page.goto("/chords?board=C%20Am");
	const board = page.getByRole("region", { name: "Board" });
	await expect(board.getByRole("link", { name: "Am" })).toBeVisible();

	await board.getByRole("button", { name: "Increase Transpose" }).click();
	await board.getByRole("button", { name: "Increase Transpose" }).click();
	await expect(board.getByRole("link", { name: "Bm" })).toBeVisible();
	await expect(page).toHaveURL(/transpose=2/);

	// A capo leaves the cards as held and says what they sound.
	await board.getByRole("button", { name: "Increase Capo" }).click();
	await board.getByRole("button", { name: "Increase Capo" }).click();
	await expect(board.getByRole("link", { name: "Bm" })).toBeVisible();
	await expect(board.getByText("sounds C♯m")).toBeVisible();

	// Strum asks which pattern the chords go on, and saves nothing until they are added.
	await board.getByRole("button", { name: "Open in Strum as a progression" }).click();
	await expect(page).toHaveURL(/\/strum/);
	const waiting = page.getByRole("region", { name: "New progression" });
	await expect(waiting.getByRole("heading", { name: "Choose a pattern" })).toBeVisible();
	await expect(waiting.getByRole("list", { name: "Chords" })).toHaveText(/D\s*Bm/);
	const add = waiting.getByRole("button", { name: "Add the progression" });
	await expect(add).toBeDisabled();

	await page.getByRole("complementary", { name: "Pattern library" }).getByRole("button", { name: /old faithful/i }).first().click();
	await expect(waiting.getByRole("heading", { name: "old faithful" })).toBeVisible();
	await add.click();
	await expect(page.getByText("D|Bm").first()).toBeVisible();
});

test("an old side-by-side link lands on a board of the same chords", async ({ page }) => {
	await page.goto("/chords/grid?q=Em,C");
	await expect(page).toHaveURL(/\/chords\?board=/);
	await expect(page.getByRole("region", { name: "Board" }).getByRole("link", { name: "Em" })).toBeVisible();
});

test("a chord is read under either spelling of its root, and an old address moves", async ({ page }) => {
	await page.goto("/chords/g-sharp/major");
	await expect(page.getByRole("heading", { level: 1, name: "A♭" })).toBeVisible();
	await page.goto("/chords/ab/major");
	await expect(page).toHaveURL(/\/chords\/a-flat\/major$/);
	await expect(page.getByRole("heading", { level: 1, name: "A♭" })).toBeVisible();
});

test("a shape the library lacks can be written down", async ({ page }) => {
	await page.goto("/chords/create?frets=00770x");
	await expect(page.getByRole("heading", { name: "Write a chord", level: 1 })).toBeVisible();
	const create = page.getByRole("button", { name: "Create chord" });
	await expect(create).toBeDisabled();
	// The library names the notes; taking its first answer is enough to file the chord.
	await page.getByRole("region", { name: "What the notes say" }).getByRole("button").first().click();
	await expect(create).toBeEnabled();
});
