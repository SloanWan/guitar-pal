import { expect, test } from "../fixtures";

/**
 * The Candy shell (#356): the header from 720px, the phone app bar and tab bar under it,
 * and light as the default theme. Signed out, like the rest of smoke.
 */
test.describe("on a phone", () => {
	test.use({ viewport: { width: 400, height: 800 } });

	test("the tab bar navigates and marks the current tab", async ({ page }) => {
		await page.goto("/");
		const tabs = page.getByRole("navigation", { name: "Tabs" });
		await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
		await tabs.getByRole("link", { name: "Strum" }).click();
		await expect(page).toHaveURL(/\/strum$/);
		await expect(tabs.getByRole("link", { name: "Strum" })).toHaveAttribute("aria-current", "page");
	});

	test("More opens Books", async ({ page }) => {
		await page.goto("/strum");
		await page.getByRole("button", { name: "More" }).click();
		const more = page.getByRole("dialog", { name: "More" });
		await expect(more).toBeVisible();
		await more.getByRole("link", { name: /Books/ }).click();
		await expect(page).toHaveURL(/\/books$/);
		await expect(more).toBeHidden();
		// Books has no tab: none is current
		await expect(page.getByRole("navigation", { name: "Tabs" }).locator('[aria-current="page"]')).toHaveCount(0);
	});

	for (const path of ["/", "/strum", "/fingerpick", "/chords", "/fretboard", "/books", "/auth"]) {
		test(`${path} has no horizontal scroll at 400px`, async ({ page }) => {
			await page.goto(path);
			// polled: a page still loading its samples can be wider for a frame
			const overflow = () =>
				page.evaluate(() =>
					Math.max(
						...[document.documentElement, document.querySelector("main")]
							.filter((el): el is HTMLElement => !!el)
							.map((el) => el.scrollWidth - el.clientWidth),
					),
				);
			await expect.poll(overflow).toBeLessThanOrEqual(0);
		});
	}
});

test("the header nav marks the current page from 720px", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/chords");
	const nav = page.getByRole("navigation", { name: "Main" });
	await expect(nav.getByRole("link", { name: "Chords" })).toHaveAttribute("aria-current", "page");
	await expect(page.getByRole("navigation", { name: "Tabs" })).toBeHidden();
	await nav.getByRole("link", { name: "Fretboard" }).click();
	await expect(page).toHaveURL(/\/fretboard$/);
	await expect(nav.getByRole("link", { name: "Fretboard" })).toHaveAttribute("aria-current", "page");
});

test("a first visit is light, and a saved dark is applied before paint", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await page.addInitScript(() => localStorage.setItem("gp-theme", "dark"));
	await page.goto("/strum");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("dark");
});
