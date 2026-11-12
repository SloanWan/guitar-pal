import { expect, test } from "@playwright/test";

/**
 * The installed app's launch (#490): a launch image per iOS screen instead of black, then
 * the launch curtain until the page is ready. Standalone can't be emulated, so the curtain's
 * check is answered through matchMedia.
 */

test("every launch image the page names is there, at the size its media asks for", async ({ page, request }) => {
	await page.goto("/");
	const links = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((els) =>
		els.map((el) => ({ href: el.getAttribute("href") ?? "", media: el.getAttribute("media") ?? "" })),
	);
	expect(links.length).toBeGreaterThan(30);
	for (const { href, media } of links) {
		const response = await request.get(href);
		expect(response.status(), href).toBe(200);
		expect(response.headers()["content-type"]).toBe("image/png");
		const png = await response.body();
		const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
		const device = /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (\w+)\)/.exec(media);
		expect(device, media).not.toBeNull();
		const [, w, h, ratio, orientation] = device ?? [];
		const portrait = [Number(w) * Number(ratio), Number(h) * Number(ratio)];
		expect([width, height], href).toEqual(orientation === "portrait" ? portrait : [portrait[1], portrait[0]]);
	}
});

test("the curtain shows on a cold start only, and lifts once the page is ready", async ({ page }) => {
	await page.addInitScript(() => {
		const real = window.matchMedia.bind(window);
		window.matchMedia = (query: string) =>
			query.includes("display-mode: standalone") ? ({ ...real(query), matches: true } as MediaQueryList) : real(query);
		const seen: (string | null)[] = [];
		(window as unknown as { __launch: (string | null)[] }).__launch = seen;
		// The document itself: <html> may not be there yet when this runs.
		new MutationObserver(() => {
			const now = document.documentElement.getAttribute("data-launch");
			if (seen[seen.length - 1] !== now) seen.push(now);
		}).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-launch"] });
	});
	const seen = () => page.evaluate(() => (window as unknown as { __launch: (string | null)[] }).__launch);

	await page.goto("/strum");
	await expect.poll(seen).toEqual(["", "lifting", null]);
	await expect(page.locator(".gp-launch")).toBeHidden();

	// The same session: no curtain again.
	await page.goto("/tab");
	await expect(page.locator("svg .vf-stave").first()).toBeVisible();
	expect(await seen()).toEqual([]);
});
