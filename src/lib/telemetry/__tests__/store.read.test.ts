// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEvents, type StoredEvent } from "../store";

/** A client whose query chain records what was asked and answers `rows`. */
function fakeClient(rows: Partial<StoredEvent>[]) {
	const calls: Record<string, unknown[]> = {};
	const chain = {
		select: (...a: unknown[]) => ((calls.select = a), chain),
		gte: (...a: unknown[]) => ((calls.gte = a), chain),
		order: (...a: unknown[]) => ((calls.order = a), chain),
		limit: vi.fn(async (...a: unknown[]) => ((calls.limit = a), { data: rows, error: null })),
	};
	const client = { from: (table: string) => ((calls.from = [table]), chain) } as unknown as SupabaseClient;
	return { client, calls };
}

describe("readEvents", () => {
	it("reads the range newest first, one row past the limit to know whether there is more", async () => {
		const since = new Date("2026-11-01T00:00:00Z");
		const { client, calls } = fakeClient([{ at: "c" }, { at: "b" }, { at: "a" }]);
		const read = await readEvents(client, since, 2);
		expect(calls.from).toEqual(["telemetry_events"]);
		expect(calls.gte).toEqual(["at", since.toISOString()]);
		expect(calls.order).toEqual(["at", { ascending: false }]);
		expect(calls.limit).toEqual([3]);
		expect(read).toEqual({ events: [{ at: "c" }, { at: "b" }], truncated: true });
	});

	it("says nothing is cut when the range fits", async () => {
		const { client } = fakeClient([{ at: "a" }]);
		expect((await readEvents(client, new Date(), 2)).truncated).toBe(false);
	});
});
