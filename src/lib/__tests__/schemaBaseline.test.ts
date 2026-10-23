import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

// scripts/schema.sql is the only written record of the database structure
// (#264). It is a snapshot, so nothing regenerates it on its own: these tests
// fail when the code or a migration names a table the snapshot does not have,
// which is what happens when a table is added and `npm run db:schema` is not run.

const ROOT = path.resolve(__dirname, "../../..");
const SCHEMA = path.join(ROOT, "scripts/schema.sql");
const HINT = "run `npm run db:schema` and commit scripts/schema.sql";

function filesUnder(dir: string, keep: (file: string) => boolean): string[] {
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name))
		.filter(keep);
}

function matches(text: string, pattern: RegExp): string[] {
	return [...text.matchAll(pattern)].map((m) => m[1].toLowerCase());
}

function schemaTables(): Set<string> {
	return new Set(matches(readFileSync(SCHEMA, "utf8"), /^CREATE TABLE public\.(\w+)/gm));
}

/** Tables the app queries: `.from("name")`, but not `storage.from(...)`, which names a bucket. */
function queriedTables(): Set<string> {
	const sources = filesUnder(
		path.join(ROOT, "src"),
		(f) => /\.tsx?$/.test(f) && !f.includes(`${path.sep}__tests__${path.sep}`) && !/\.test\.tsx?$/.test(f),
	);
	const tables = new Set<string>();
	for (const file of sources) {
		const text = readFileSync(file, "utf8");
		for (const m of text.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
			if (/storage\s*$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
			tables.add(m[1]);
		}
	}
	return tables;
}

/** Tables a migration creates: the hand-run scripts/*.sql and the book service's Alembic revisions. */
function migratedTables(): Set<string> {
	const files = [
		...filesUnder(path.join(ROOT, "scripts"), (f) => f.endsWith(".sql") && !f.endsWith("schema.sql")),
		...filesUnder(path.join(ROOT, "book-service/alembic/versions"), (f) => f.endsWith(".py")),
	];
	const create = /create table (?:if not exists )?(?:public\.)?(\w+)/gi;
	return new Set(files.flatMap((f) => matches(readFileSync(f, "utf8"), create)));
}

describe("scripts/schema.sql", () => {
	it("exists", () => {
		expect(existsSync(SCHEMA), HINT).toBe(true);
	});

	it("has every table the app queries", () => {
		const schema = schemaTables();
		const missing = [...queriedTables()].filter((t) => !schema.has(t));
		expect(missing, `queried but not in the snapshot — ${HINT}`).toEqual([]);
	});

	it("has every table a migration creates", () => {
		const schema = schemaTables();
		const missing = [...migratedTables()].filter((t) => !schema.has(t));
		expect(missing, `created by a migration but not in the snapshot — ${HINT}`).toEqual([]);
	});

	it("finds the tables it checks", () => {
		// Guards the patterns above: a regex that silently matched nothing would pass.
		expect(queriedTables()).toContain("user_strum_patterns");
		expect(migratedTables()).toContain("user_books");
	});
});
