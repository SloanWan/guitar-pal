// Snapshot the database structure into scripts/schema.sql (#264).
//
// Not a one-time script: run it after every change to the schema — a table,
// column, index, policy or grant, whether from scripts/*.sql, an Alembic
// revision or the Supabase dashboard — and commit schema.sql with that change.
// src/lib/__tests__/schemaBaseline.test.ts fails when a table the code or a
// migration names is missing from the snapshot.
//
// Usage: npm run db:schema
// Reads SCHEMA_DATABASE_URL, else BOOK_SERVICE_MIGRATION_DATABASE_URL, from the
// environment or .env.local: an admin role on the session pooler (port 5432),
// as book-service/README.md describes. pg_dump must be at least the server's
// major version (brew install postgresql@17 if it says otherwise).

import { spawnSync } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, "../.env.local"), quiet: true });

const url = process.env.SCHEMA_DATABASE_URL ?? process.env.BOOK_SERVICE_MIGRATION_DATABASE_URL;
if (!url) {
	console.error("Set SCHEMA_DATABASE_URL (or BOOK_SERVICE_MIGRATION_DATABASE_URL) in the environment or .env.local.");
	process.exit(1);
}

// Structure of the public schema only: Supabase owns auth, storage and the rest.
// A fixed restrict key keeps the \restrict lines from changing on every dump.
const dump = spawnSync(
	"pg_dump",
	["--schema-only", "--no-owner", "--schema=public", "--restrict-key=guitarpal", url],
	{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (dump.error) throw dump.error;
if (dump.status !== 0) {
	console.error(dump.stderr);
	process.exit(dump.status ?? 1);
}

const header = [
	"-- Structure of the public schema: tables, indexes, RLS policies, grants. No rows.",
	"-- A snapshot, not a migration. Regenerate with `npm run db:schema` after every",
	"-- schema change and commit it with that change (scripts/dump-schema.mjs).",
	"",
].join("\n");

const out = path.resolve(import.meta.dirname, "schema.sql");
writeFileSync(`${out}.tmp`, header + dump.stdout);
renameSync(`${out}.tmp`, out);
const tables = dump.stdout.match(/^CREATE TABLE public\.\w+/gm) ?? [];
console.log(`scripts/schema.sql: ${tables.length} tables`);
