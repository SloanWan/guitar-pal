import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * The base test for every spec here.
 *
 * Each one fails if the page threw an uncaught exception, which is most of
 * what a smoke test is for: a component that throws on mount still renders a
 * shell, so an assertion on the markup alone can pass over a broken page.
 * `console.error` is deliberately not watched — React is noisy there, and a
 * warning is not a failure.
 *
 * One page error is not the page's: WebKit raises the router's link prefetches
 * (`?_rsc=`) that a full navigation cuts off as uncaught "access control"
 * failures, where Chromium drops them quietly (#457).
 */
const ABORTED_PREFETCH = /Fetch API cannot load .+[?&]_rsc=\S+ due to access control checks/;

export const test = base.extend<{ failOnPageError: void }>({
	failOnPageError: [
		async ({ page }, use) => {
			const errors: string[] = [];
			page.on("pageerror", (error) => {
				const text = String(error);
				if (!ABORTED_PREFETCH.test(text)) errors.push(text);
			});
			await use();
			expect(errors, "uncaught exceptions on the page").toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };

/**
 * Wait until React has taken this element over. Text typed into a server-rendered
 * field before then is wiped when the page hydrates (#461), which WebKit, slower
 * to hydrate, runs into now and then.
 */
export async function hydrated(field: Locator): Promise<void> {
	await expect
		.poll(() => field.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactFiber"))))
		.toBe(true);
}

/** The samples are downloaded and decoded on the first press, so "playing" can take a while. */
export const PLAYBACK_TIMEOUT = 30_000;

/**
 * Press the player's transport and wait for it to actually be playing, then
 * stop it again. Both workspaces label the same button by what it will do
 * next ("Play" → "Loading samples" → "Stop"/"Pause"), so the label is the
 * state and there is nothing to read out of the DOM by hand.
 */
export async function playAndStop(page: Page, playing: "Stop" | "Pause"): Promise<void> {
	await page.getByRole("button", { name: "Play", exact: true }).click();
	await expect(page.getByRole("button", { name: playing, exact: true })).toBeVisible({
		timeout: PLAYBACK_TIMEOUT,
	});
	await page.getByRole("button", { name: playing, exact: true }).click();
	await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
}

/** The throwaway account the signed-in specs use; unset means "skip me". */
export const CREDENTIALS = {
	email: process.env.E2E_EMAIL,
	password: process.env.E2E_PASSWORD,
};

/**
 * Sign in through the form, from whatever page is open. Deliberately not a
 * seeded cookie or a stored `storageState`: the form and the redirect around
 * it are part of what is being tested, and there is only one signed-in path
 * in the suite to pay for it.
 */
export async function signIn(page: Page): Promise<void> {
	const { email, password } = CREDENTIALS;
	if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD are required");
	await page.getByRole("textbox", { name: "Email" }).fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
