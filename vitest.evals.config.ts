import { defineConfig } from "vitest/config";
import path from "path";

/**
 * The strum assistant's model evals — `npm run evals`. A separate config so
 * the `.eval.ts` files never run under `npm test`: they call the API and cost
 * money every time.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "node",
		globals: true,
		include: ["src/**/*.eval.ts"],
		// One case at a time: the rate limit is per key, and a parallel burst
		// would measure the limiter rather than the model.
		fileParallelism: false,
		sequence: { concurrent: false },
	},
});
