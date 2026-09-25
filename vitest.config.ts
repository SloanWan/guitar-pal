import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			// See the stub for why: the real module is a build-time transform and
			// throws when a test imports it.
			"next/font/local": path.resolve(__dirname, "./src/test/nextFontLocalStub.ts"),
		},
	},
	test: {
		environment: "jsdom",
		// Vitest would otherwise claim `e2e/**/*.spec.ts` as its own; those run
		// under Playwright, against a real browser (`npm run test:e2e`).
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		globals: true,
		setupFiles: ["src/test/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["src/**/__tests__/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
		},
	},
});
