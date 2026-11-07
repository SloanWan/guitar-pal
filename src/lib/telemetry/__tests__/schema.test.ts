import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_SOURCES, VITAL_NAMES, VITAL_RATINGS } from "../events";
import { telemetryBatch } from "../schema";

const error = { kind: "error", source: "window", message: "Error: x", route: "/tab", viewport: "phone" };
const vital = { kind: "vital", name: "LCP", value: 1234, rating: "good", route: "/", viewport: "desktop", build: "abc" };

describe("telemetryBatch", () => {
	it("accepts what the client sends", () => {
		expect(telemetryBatch.safeParse({ events: [error, vital] }).success).toBe(true);
	});

	it("refuses an empty or oversized batch", () => {
		expect(telemetryBatch.safeParse({ events: [] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: Array.from({ length: 21 }, () => error) }).success).toBe(false);
	});

	it("refuses unknown kinds, sources, names and extra fields", () => {
		expect(telemetryBatch.safeParse({ events: [{ ...error, kind: "log" }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...error, source: "console" }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...vital, name: "FID" }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...error, userId: "u1" }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [error], extra: 1 }).success).toBe(false);
	});

	it("refuses values out of bounds", () => {
		expect(telemetryBatch.safeParse({ events: [{ ...error, message: "m".repeat(301) }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...error, route: "" }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...vital, value: -1 }] }).success).toBe(false);
		expect(telemetryBatch.safeParse({ events: [{ ...vital, value: 4_000_000 }] }).success).toBe(false);
	});
});

describe("the table's checks", () => {
	const sql = readFileSync(path.resolve(__dirname, "../../../../scripts/create-telemetry-events.sql"), "utf8");
	/** Every `<column> in (...)` list the SQL writes for a column, read as values. */
	const listsFor = (column: string) =>
		[...sql.matchAll(new RegExp(`\\b${column} in \\(([^)]*)\\)`, "g"))].map((m) =>
			[...m[1].matchAll(/'([^']+)'/g)].map((v) => v[1]),
		);

	it.each([
		["source", ERROR_SOURCES],
		["name", VITAL_NAMES],
		["rating", VITAL_RATINGS],
	] as const)("lists the same %s values as the client", (column, values) => {
		const lists = listsFor(column);
		expect(lists.length).toBeGreaterThan(0);
		for (const list of lists) expect(list).toEqual([...values]);
	});
});
