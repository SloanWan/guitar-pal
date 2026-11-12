import { expect, test } from "../fixtures";

/**
 * The Candy shell (#356): the header from 720px, the phone app bar and tab bar under it,
 * and light as the default theme. Signed out, like the rest of smoke.
 */
test.describe("on a phone", { tag: "@phone" }, () => {
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

	for (const path of ["/", "/strum", "/tab", "/chords", "/fretboard", "/books", "/auth"]) {
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

/**
 * Installed on an iPad, the page reaches the top edge and the system's blurred bar lies
 * over it (#478). Standalone can't be emulated, so the inset is injected through the one
 * property the shell reads it from.
 */
test("the header grows by the top safe area and keeps its content below it", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/strum");
	const header = page.locator("header.gp-header");
	const before = await header.boundingBox();
	await page.addStyleTag({ content: ":root { --gp-safe-top: 24px; }" });

	const after = await header.boundingBox();
	expect(after?.height).toBeCloseTo((before?.height ?? 0) + 24, 0);
	// The brand sits wholly below the inset, where nothing covers it.
	const brand = await page.getByRole("link", { name: /Guitar Pal/ }).first().boundingBox();
	expect(brand?.y ?? 0).toBeGreaterThanOrEqual(24);
	// What follows the header moves down with it: nothing slides underneath.
	const main = await page.locator("main").first().boundingBox();
	expect(main?.y ?? 0).toBeGreaterThanOrEqual((after?.y ?? 0) + (after?.height ?? 0) - 1);
});

/**
 * A header link moves to its section through a view transition typed `section` (#489);
 * the browser's back button does not animate.
 */
test("a header link animates the move to its section; back does not", async ({ page }) => {
	await page.goto("/strum");
	await page.evaluate(() => {
		const w = window as unknown as { __vt: string[][] };
		w.__vt = [];
		const start = document.startViewTransition?.bind(document);
		if (!start) return;
		document.startViewTransition = ((arg: StartViewTransitionOptions) => {
			w.__vt.push(arg && "types" in arg && arg.types ? [...arg.types] : []);
			return start(arg);
		}) as typeof document.startViewTransition;
	});
	const supported = await page.evaluate(() => "startViewTransition" in document);
	test.skip(!supported, "no view transitions in this browser");

	const nav = page.getByRole("navigation", { name: "Main" });
	await nav.getByRole("link", { name: "Chords" }).click();
	await expect(page).toHaveURL(/\/chords$/);
	await expect(nav.getByRole("link", { name: "Chords" })).toHaveAttribute("aria-current", "page");
	expect(await page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt)).toEqual([["section"]]);

	await page.goBack();
	await expect(page).toHaveURL(/\/strum$/);
	expect(await page.evaluate(() => (window as unknown as { __vt: string[][] }).__vt)).toEqual([["section"]]);
});
