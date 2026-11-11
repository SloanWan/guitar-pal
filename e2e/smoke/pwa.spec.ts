import { expect, playAndStop, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * Offline use (#468). Every other spec blocks service workers (playwright.config.ts),
 * so a worker's cache never answers a request a spec meant to send; this one
 * lets it run.
 */
test.use({ serviceWorkers: "allow" });

/** Waits until the worker runs and controls the page, so what the page fetches next goes through it. */
async function controlled(page: Page): Promise<void> {
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

test.describe("offline", () => {
	// WebKit runs the worker and hands it the page, but its offline emulation
	// fails a navigation before the worker sees it ("internal error"), so going
	// offline cannot be tested there. Chromium's applies to the worker's own
	// fetches too, which is what the offline page test relies on.
	test.skip(({ browserName }) => browserName !== "chromium", "offline emulation bypasses the worker in WebKit");

	test("a tool page reloads offline and its sounds load", async ({ page, context }) => {
		await page.goto("/strum");
		await controlled(page);
		// The first load came before the worker; this one is kept, with its build files.
		await page.reload();
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
		await expect(page.getByText("You're offline.")).toBeVisible();
		const preset = await page.evaluate(async () => {
			const response = await fetch("/audio/webaudiofont/0250_LK_AcousticSteel_SF2_file.json");
			return response.ok && Array.isArray((await response.json()).zones);
		});
		expect(preset).toBe(true);
	});

	test("a tool page never opened here opens offline and plays, from the background fetch", async ({ page, context }) => {
		await page.goto("/strum");
		await controlled(page);
		// The worker fetches the tool pages one at a time, each with the build files
		// its HTML names; once /fretboard is kept, /tab's files are in.
		await expect
			.poll(
				() =>
					page.evaluate(async () => {
						const name = (await caches.keys()).find((key) => key.startsWith("gp-pages-"));
						return Boolean(name && (await (await caches.open(name)).match("/fretboard")));
					}),
				{ timeout: 30_000 },
			)
			.toBe(true);

		await context.setOffline(true);
		await page.goto("/tab");
		await expect(page.locator("svg .vf-stave").first()).toBeVisible();
		await playAndStop(page, "Pause");
	});

	test("a page with no copy here shows the offline page", async ({ page, context }) => {
		await page.goto("/strum");
		await controlled(page);
		await context.setOffline(true);
		await page.goto("/settings");
		await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
		await expect(page.getByText("The pages below show only what's cached on this device.")).toBeVisible();
		// One button a tool page (#473).
		const pages = page.getByRole("navigation", { name: "Pages" });
		for (const [name, href] of [["Strum", "/strum"], ["Tab", "/tab"], ["Chords", "/chords"], ["Fretboard", "/fretboard"]]) {
			await expect(pages.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
		}
		await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
	});
});
