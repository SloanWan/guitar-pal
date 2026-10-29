import { expect, test } from "../fixtures";

/**
 * The Candy token layer (#350): the page shell carries the route's module, and the
 * --gp-m-* aliases resolve to that module's ramp in both themes. The check reads the
 * resolved custom property on <main> against the chords ramp on the root, so it holds
 * whatever the palette's values (tokens.test.ts pins those).
 */
for (const theme of ["light", "dark"] as const) {
	test(`chords shell resolves the module colour in ${theme}`, async ({ page }) => {
		await page.addInitScript((t) => localStorage.setItem("gp-theme", t), theme);
		await page.goto("/chords");
		const main = page.getByRole("main");
		await expect(main).toHaveAttribute("data-m", "chords");
		const [alias, ramp] = await main.evaluate((el) => [
			getComputedStyle(el).getPropertyValue("--gp-m-500").trim().toUpperCase(),
			getComputedStyle(document.documentElement).getPropertyValue("--gp-chords-500").trim().toUpperCase(),
		]);
		expect(ramp).toMatch(/^#[0-9A-F]{6}$/);
		expect(alias).toBe(ramp);
	});
}

test("the two themes resolve the chords ramp to different colours", async ({ page }) => {
	const read = async (theme: "light" | "dark") => {
		await page.addInitScript((t) => localStorage.setItem("gp-theme", t), theme);
		await page.goto("/chords");
		return page.getByRole("main").evaluate((el) => getComputedStyle(el).getPropertyValue("--gp-m-500").trim());
	};
	expect(await read("light")).not.toBe(await read("dark"));
});
