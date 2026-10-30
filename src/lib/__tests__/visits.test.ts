import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { chordVisitTarget, readChordVisitTarget, recordVisit } from "../visits";

const USER = { id: "u1" } as User;

function fakeClient(error: { message: string } | null = null) {
	const rpc = vi.fn().mockResolvedValue({ data: null, error });
	return { client: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => sessionStorage.clear());

describe("chord visit targets", () => {
	it("round-trips a chord, suffix and all", () => {
		expect(readChordVisitTarget(chordVisitTarget("F#", "m7b5"))).toEqual({ root: "F#", suffix: "m7b5" });
	});

	it("reads nothing from a target that is not a chord", () => {
		expect(readChordVisitTarget("C")).toBeNull();
		expect(readChordVisitTarget("|major")).toBeNull();
		expect(readChordVisitTarget("C|")).toBeNull();
	});
});

describe("recordVisit", () => {
	it("counts a thing once a tab session", async () => {
		const { client, rpc } = fakeClient();
		await recordVisit(client, USER, "strum", "folk");
		await recordVisit(client, USER, "strum", "folk");
		await recordVisit(client, USER, "tab", "folk");
		expect(rpc).toHaveBeenCalledTimes(2);
		expect(rpc).toHaveBeenNthCalledWith(1, "record_visit", { p_kind: "strum", p_target: "folk" });
	});

	it("records nothing signed out", async () => {
		const { client, rpc } = fakeClient();
		await recordVisit(client, null, "chord", chordVisitTarget("C", "major"));
		expect(rpc).not.toHaveBeenCalled();
	});

	it("lets a failed visit be counted again", async () => {
		const failing = fakeClient({ message: "offline" });
		await expect(recordVisit(failing.client, USER, "book", "b1")).rejects.toThrow("offline");
		const { client, rpc } = fakeClient();
		await recordVisit(client, USER, "book", "b1");
		expect(rpc).toHaveBeenCalledTimes(1);
	});
});
