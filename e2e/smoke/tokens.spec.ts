import { expect, test } from "../fixtures";

/**
 * The Candy token layer (#350): the page shell carries the route's module, and the
 * --gp-m-* aliases resolve to that module's ramp in both themes. Nothing renders with
 * these tokens yet, so the check reads the resolved custom property on <main>.
 */
for (const [theme, expected] of [
	["light", "#C63C3C"],
	["dark", "#F17F79"],
] as const) {
	test(`chords shell resolves the module colour in ${theme}`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("gp-theme", t), theme);
		await page.goto("/chords");
		const main = page.getByRole("main");
		await expect(main).toHaveAttribute("data-m", "chords");
		const value = await main.evaluate((el) => getComputedStyle(el).getPropertyValue("--gp-m-500").trim().toUpperCase());
		expect(value).toBe(expected);
	});
}
