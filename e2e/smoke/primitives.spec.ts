import { expect, test } from "../fixtures";

/**
 * The Candy primitives (#353) on /dev/primitives. The page lives behind
 * NEXT_PUBLIC_ENABLE_DEV_ROUTES, so a build without the flag 404s it and these skip.
 */
test.beforeEach(async ({ page }) => {
	const response = await page.goto("/dev/primitives");
	test.skip(response?.status() === 404, "dev routes are off in this build");
});

/** The element's translation, from its computed transform matrix. */
const offset = (el: Element) => {
	const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
	return [m.m41, m.m42];
};

test("a press sinks the button into its shadow and springs back", async ({ page }) => {
	const save = page.getByRole("group", { name: "Rest" }).getByRole("button", { name: "Save" });
	const box = (await save.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await expect(save).toHaveClass(/is-down/);
	await expect.poll(() => save.evaluate(offset)).toEqual([3, 3]);
	await page.mouse.up();
	await expect(save).not.toHaveClass(/is-down/);
	// back to rest — or the 1px hover lift, since the pointer is still over it
	await expect.poll(() => save.evaluate(offset)).toEqual([-1, -1]);
});

test("Enter on a focused button shows the sink too", async ({ page }) => {
	const duplicate = page.getByRole("group", { name: "Rest" }).getByRole("button", { name: "Duplicate" });
	await duplicate.focus();
	await page.keyboard.down("Enter");
	await expect(duplicate).toHaveClass(/is-down/);
	await page.keyboard.up("Enter");
	await expect(duplicate).not.toHaveClass(/is-down/);
});

test("a switch toggles by keyboard", async ({ page }) => {
	const metronome = page.getByRole("switch", { name: "Metronome" });
	await expect(metronome).toHaveAttribute("aria-checked", "false");
	await metronome.focus();
	await page.keyboard.press("Space");
	await expect(metronome).toHaveAttribute("aria-checked", "true");
	await page.keyboard.press("Enter");
	await expect(metronome).toHaveAttribute("aria-checked", "false");
});

test("a segmented control is a radio group the arrow keys move", async ({ page }) => {
	const group = page.getByRole("radiogroup", { name: "Subdivision" });
	await group.getByRole("radio", { name: "1/8" }).focus();
	await page.keyboard.press("ArrowRight");
	await expect(group.getByRole("radio", { name: "1/16" })).toHaveAttribute("aria-checked", "true");
	await expect(group.getByRole("radio", { name: "1/16" })).toBeFocused();
});

test("a stepper steps, and a toggle chip turns on", async ({ page }) => {
	const tempo = page.getByRole("group", { name: "tempo" });
	await tempo.getByRole("button", { name: "Increase tempo" }).click();
	await expect(tempo.locator("output")).toHaveText("97BPM");
	const up = page.getByRole("button", { name: "Up", exact: true });
	await expect(up).toHaveAttribute("aria-pressed", "false");
	await up.click();
	await expect(up).toHaveAttribute("aria-pressed", "true");
});
