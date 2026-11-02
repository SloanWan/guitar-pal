// `npm run balance` (#430): what is left on the accounts of the model vendors
// the evals use, in one table — before a paid eval run, and after it.
//
//   npm run balance            # the table
//   npm run balance -- --json  # the same rows as JSON, to bracket a run:
//                              # before.json, run, after.json, compare
//
// Reads the keys from .env.local (see docs/balance.md for the variables and how
// to get a read-only AccessKey). Keys are read, never printed: an error
// row has them cut out. One vendor failing never stops the others.

import { config } from "dotenv";
import { resolve } from "path";
import { checkAll, formatTable } from "../src/lib/balance/check";
import { VENDORS } from "../src/lib/balance/vendors";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

async function main(): Promise<void> {
	const json = process.argv.includes("--json");
	const rows = await checkAll(VENDORS, process.env, (url, init) => fetch(url, init));
	if (json) {
		console.log(JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2));
	} else {
		console.log(formatTable(rows));
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
