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

/**
 * The editor is a page of its own (#358). Signed out, a saved tab goes to the
 * browser, so nothing here is written anywhere but this test's storage.
 */
test("New opens the editor; a named tab saves and the reader opens on it", async ({ page }) => {
	await page.goto("/fingerpick");
	await page.getByRole("button", { name: "New", exact: true }).click();
	await expect(page).toHaveURL(/\/fingerpick\/edit\/new$/);
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();

	await page.getByRole("button", { name: "Tab settings" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Smoke tab");
	await page.keyboard.press("Escape");
	await page.getByRole("button", { name: "Save", exact: true }).click();

	await expect(page).toHaveURL(/\/fingerpick\?pattern=/);
	await expect(page.getByRole("heading", { name: "Smoke tab" })).toBeVisible();
});

test("leaving the editor with unsaved edits asks first", async ({ page }) => {
	await page.goto("/fingerpick/edit/new");
	await page.getByRole("button", { name: "Tab settings" }).click();
	await page.getByRole("textbox", { name: "Name" }).fill("Half done");
	await page.keyboard.press("Escape");

	// A link in the header is held…
	await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Chords" }).click();
	const confirm = page.getByRole("alertdialog", { name: "Discard changes?" });
	await expect(confirm).toBeVisible();
	await confirm.getByRole("button", { name: "Keep editing" }).click();
	await expect(page).toHaveURL(/\/fingerpick\/edit\/new$/);

	// …and so is Close, until the edits are discarded.
	await page.getByRole("button", { name: "Close", exact: true }).click();
	await confirm.getByRole("button", { name: "Discard" }).click();
	await expect(page).toHaveURL(/\/fingerpick$/);
});

test("the tab is the editing surface: click, type a fret, add a hammer-on, undo", async ({ page }) => {
	await page.goto("/fingerpick/edit/new");
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();

	await page.getByRole("button", { name: "Bar 1, slot 1, B string: empty" }).click();
	await page.keyboard.type("12");
	await expect(page.getByRole("button", { name: "Bar 1, slot 1, B string: fret 12" })).toBeAttached();

	// 2 then 4 on the next slot, and a hammer-on between them.
	await page.keyboard.press("Backspace");
	await page.keyboard.type("2");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.type("4");
	await page.keyboard.press("h");
	const hammer = page.locator("svg text").filter({ hasText: /^H$/ });
	await expect(hammer).toHaveCount(1);

	await page.keyboard.press("ControlOrMeta+z");
	await expect(hammer).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Bar 1, slot 2, B string: fret 4" })).toBeAttached();
});

test("the fretboard writes at the cursor, clears on a second click, and Shift gives an x", async ({ page }) => {
	await page.goto("/fingerpick/edit/new");
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();
	const dock = page.getByRole("region", { name: "Fretboard" });

	await dock.getByRole("button", { name: "String 5, fret 3", exact: true }).click();
	await expect(page.getByRole("button", { name: "Bar 1, slot 1, A string: fret 3" })).toBeAttached();
	// The tab keeps the keys: the arrow moves the cursor on.
	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("status", { name: "Cursor" })).toHaveText("Bar 1 · slot 2 · A string");
	await page.keyboard.press("ArrowLeft");

	await dock.getByRole("button", { name: "String 5, fret 3, written", exact: true }).click();
	await expect(page.getByRole("button", { name: "Bar 1, slot 1, A string: empty" })).toBeAttached();

	await dock.getByRole("button", { name: "String 6, fret 1", exact: true }).click({ modifiers: ["Shift"] });
	await expect(page.getByRole("button", { name: "Bar 1, slot 1, E string: x" })).toBeAttached();
});

test("the toolbar splits a note so the bar still adds up, and the bar menu copies a bar", async ({ page }) => {
	await page.goto("/fingerpick/edit/new");
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();
	await page.getByRole("button", { name: "Bar 1, slot 1, B string: empty" }).click();

	// Four quarters; the first split into eighths makes five slots.
	await page.getByRole("toolbar", { name: "Edit tools" }).getByRole("button", { name: "Eighth", exact: true }).click();
	await expect(page.getByRole("button", { name: "Bar 1, slot 5, B string: empty" })).toBeAttached();
	await page.keyboard.type("3");
	await expect(page.getByRole("button", { name: "Bar 1, slot 1, B string: fret 3" })).toBeAttached();

	await page.getByRole("button", { name: "Bar 1 actions" }).click();
	await page.getByRole("menuitem", { name: "Copy this bar" }).click();
	await expect(page.getByRole("status", { name: "Cursor" })).toHaveText("Bar 2 · slot 1 · B string");
	await expect(page.getByRole("button", { name: "Bar 2, slot 1, B string: fret 3" })).toBeAttached();
});

test("the inspector writes a link and says why the others cannot go on", async ({ page }) => {
	await page.goto("/fingerpick/edit/new");
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();
	await page.getByRole("button", { name: "Bar 1, slot 1, B string: empty" }).click();
	await page.keyboard.type("5");
	await page.keyboard.press("ArrowRight");
	await page.keyboard.type("7");

	const inspector = page.getByRole("complementary", { name: "Inspector" });
	await expect(inspector.getByText("Tied, Pull-off: Not valid for this fret movement.")).toBeVisible();
	await expect(inspector.getByRole("button", { name: /^Pull-off/ })).toBeDisabled();
	await inspector.getByRole("button", { name: /^Hammer-on/ }).click();
	await expect(page.locator("svg text").filter({ hasText: /^H$/ })).toHaveCount(1);
	await expect(inspector.getByRole("button", { name: /^Hammer-on/ })).toHaveAttribute("aria-pressed", "true");
});
