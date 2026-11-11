import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { OFFLINE_WRITE_REASON, refuseOfflineWrite, writesBlocked } = await import("../writes");

const player = { id: "u1" } as User;

describe("writesBlocked", () => {
	it("blocks only a signed-in player's writes, and only offline", () => {
		expect(writesBlocked(player, false)).toBe(true);
		expect(writesBlocked(player, true)).toBe(false);
		// A guest's library is this browser's, and stays writable offline.
		expect(writesBlocked(null, false)).toBe(false);
	});
});

describe("refuseOfflineWrite", () => {
	beforeEach(() => toast.mockReset());

	it("refuses with the reason when blocked", () => {
		expect(refuseOfflineWrite(player, false)).toBe(true);
		expect(toast).toHaveBeenCalledWith(OFFLINE_WRITE_REASON, { id: "offline-write" });
	});

	it("lets the write through otherwise, silently", () => {
		expect(refuseOfflineWrite(player, true)).toBe(false);
		expect(refuseOfflineWrite(null, false)).toBe(false);
		expect(toast).not.toHaveBeenCalled();
	});
});
