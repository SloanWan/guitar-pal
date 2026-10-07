import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// The same `.env.local` the dev server reads, so `E2E_EMAIL` and friends can
// live beside the Supabase keys instead of being exported by hand. Anything
// already in the environment wins, which is how CI passes its secrets.
loadEnv({ path: ".env.local", quiet: true });

/**
 * End-to-end tests (#259). Two tiers, kept apart by what they need:
 *
 * - `smoke` — one short path per page, signed out. This is what CI runs.
 * - `account` — the sign-in flow. Needs `E2E_EMAIL` / `E2E_PASSWORD` for a
 *   throwaway user in the Supabase project; the specs skip themselves without
 *   them, so a fresh checkout still passes.
 * - `books` — textbook import, local and by hand only (`npm run test:e2e:books`).
 *   It needs the Python service, Tesseract data and a PDF, so it exists as a
 *   project only when `E2E_BOOKS` is set and is never on the CI path.
 *
 * By default the suite builds and serves the app itself on `E2E_PORT` (3100,
 * clear of `npm run dev`). Point `E2E_BASE_URL` at a server you already have
 * running — a dev server, say — and nothing is started for you.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://127.0.0.1:${PORT}`;

const chromium = {
	...devices["Desktop Chrome"],
	launchOptions: {
		// The strum and fingerpick players build their AudioContext on a click,
		// but Chrome still wants a gesture it counts; without this the context
		// stays suspended and playback never starts.
		args: ["--autoplay-policy=no-user-gesture-required"],
	},
};

export default defineConfig({
	testDir: "e2e",
	// Shared helpers, not tests.
	testMatch: "**/*.spec.ts",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "smoke", testDir: "e2e/smoke", use: chromium },
		{ name: "account", testDir: "e2e/account", use: chromium },
		...(process.env.E2E_BOOKS ? [{ name: "books", testDir: "e2e/books", use: chromium }] : []),
	],
	webServer: external
		? undefined
		: {
				command: `npm run start -- --port ${PORT}`,
				url: baseURL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
			},
});
