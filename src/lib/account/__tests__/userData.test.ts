import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USER_TABLES, deleteAccount, removeUserFiles, wipeUserData } from "../userData";

const SCHEMA = path.resolve(__dirname, "../../../../scripts/schema.sql");

/** Every `table.column → auth.users` key in the snapshot, with its delete rule. */
function authUserKeys(): Map<string, string> {
	const sql = readFileSync(SCHEMA, "utf8");
	const keys = new Map<string, string>();
	const re =
		/ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT \w+ FOREIGN KEY \((\w+)\) REFERENCES auth\.users\(id\)(?: ON DELETE (CASCADE|SET NULL|RESTRICT))?/g;
	for (const m of sql.matchAll(re)) keys.set(`${m[1]}.${m[2]}`, m[3] ?? "NO ACTION");
	return keys;
}

type Call = { kind: string; args: unknown[] };

/** Just enough of a Supabase client to record what the wipe asks of it. */
function fakeClient(opts: { files?: Record<string, { name: string; id: string | null }[]>; failOn?: string } = {}) {
	const calls: Call[] = [];
	const result = (kind: string) => ({ error: opts.failOn === kind ? { message: "nope" } : null });
	const client = {
		from(table: string) {
			const chain = (op: string, payload?: unknown) => ({
				eq(column: string, value: string) {
					calls.push({ kind: `${op}:${table}`, args: [column, value, payload] });
					return Promise.resolve(result(`${op}:${table}`));
				},
			});
			return { delete: () => chain("delete"), update: (p: unknown) => chain("update", p) };
		},
		storage: {
			from(bucket: string) {
				return {
					list(prefix: string) {
						calls.push({ kind: "list", args: [bucket, prefix] });
						return Promise.resolve({ data: opts.files?.[prefix] ?? [], error: null });
					},
					remove(paths: string[]) {
						calls.push({ kind: "remove", args: [bucket, paths] });
						return Promise.resolve(result("remove"));
					},
				};
			},
		},
		auth: {
			admin: {
				deleteUser(id: string) {
					calls.push({ kind: "deleteUser", args: [id] });
					return Promise.resolve(result("deleteUser"));
				},
			},
		},
	};
	return { client: client as unknown as SupabaseClient, calls };
}

describe("USER_TABLES", () => {
	it("covers every foreign key to auth.users in the schema snapshot, and nothing else", () => {
		const listed = USER_TABLES.map((t) => `${t.table}.${t.column}`).sort();
		expect(listed).toEqual([...authUserKeys().keys()].sort());
	});

	it("anonymises exactly where the account deletion would set null", () => {
		const rules = authUserKeys();
		for (const t of USER_TABLES) {
			const rule = rules.get(`${t.table}.${t.column}`);
			expect(t.action, `${t.table}`).toBe(rule === "SET NULL" ? "anonymise" : "delete");
		}
	});

	it("clears routines before exercises — routine_exercises holds a RESTRICT key to exercises", () => {
		const order = USER_TABLES.map((t) => t.table);
		expect(order.indexOf("routines")).toBeLessThan(order.indexOf("exercises"));
	});
});

describe("wipeUserData", () => {
	it("deletes or anonymises every table for that user, then removes their files", async () => {
		const { client, calls } = fakeClient({
			files: {
				u1: [
					{ name: "book-a", id: null },
					{ name: "loose.pdf", id: "f0" },
				],
				"u1/book-a": [
					{ name: "book.pdf", id: "f1" },
					{ name: "crops", id: null },
				],
				"u1/book-a/crops": [{ name: "p1.png", id: "f2" }],
			},
		});
		await wipeUserData(client, "u1");

		const rowCalls = calls.filter((c) => c.kind.startsWith("delete:") || c.kind.startsWith("update:"));
		expect(rowCalls).toHaveLength(USER_TABLES.length);
		expect(rowCalls.every((c) => c.args[1] === "u1")).toBe(true);
		expect(calls.find((c) => c.kind === "update:chord_requests")?.args).toEqual(["user_id", "u1", { user_id: null }]);
		expect(calls.find((c) => c.kind === "delete:shared_items")?.args[0]).toBe("owner_id");

		const removed = calls.filter((c) => c.kind === "remove").flatMap((c) => c.args[1] as string[]);
		expect(removed.sort()).toEqual(["u1/book-a/book.pdf", "u1/book-a/crops/p1.png", "u1/loose.pdf"]);
		// Rows first, files last: a failed row delete leaves the files a retry can still find.
		expect(calls.findIndex((c) => c.kind === "list")).toBeGreaterThan(calls.indexOf(rowCalls.at(-1)!));
	});

	it("makes no remove call when the player stored nothing", async () => {
		const { client, calls } = fakeClient();
		expect(await removeUserFiles(client, "u1")).toBe(0);
		expect(calls.some((c) => c.kind === "remove")).toBe(false);
	});

	it("stops at the first failure and says which table", async () => {
		const { client, calls } = fakeClient({ failOn: "delete:routines" });
		await expect(wipeUserData(client, "u1")).rejects.toThrow(/routines/);
		expect(calls.some((c) => c.kind === "delete:exercises")).toBe(false);
	});

	it("refuses an empty user id rather than matching nothing — or everything", async () => {
		const { client, calls } = fakeClient();
		await expect(wipeUserData(client, "")).rejects.toThrow();
		expect(calls).toHaveLength(0);
	});
});

describe("deleteAccount", () => {
	it("wipes, then deletes the auth user", async () => {
		const { client, calls } = fakeClient();
		await deleteAccount(client, "u1");
		expect(calls.at(-1)).toEqual({ kind: "deleteUser", args: ["u1"] });
	});

	it("keeps the account when the wipe fails", async () => {
		const { client, calls } = fakeClient({ failOn: "delete:user_books" });
		await expect(deleteAccount(client, "u1")).rejects.toThrow(/user_books/);
		expect(calls.some((c) => c.kind === "deleteUser")).toBe(false);
	});
});
