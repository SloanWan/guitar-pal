// @vitest-environment node
import { describe, it, expect } from "vitest";
import { admitGuestTurn, decodeGuest, encodeGuest, GUEST_TURN_LIMIT, GUEST_WINDOW_MS, newGuest } from "@/lib/assistant/general/guest";

const KEY = "test-key";
const T0 = 1_700_000_000_000;

describe("the guest cookie", () => {
	it("round-trips a record under its signature", () => {
		const record = { id: "g1", turns: [{ id: "t1", at: T0 }] };
		expect(decodeGuest(encodeGuest(record, KEY), KEY)).toEqual(record);
	});

	it("is nothing when missing, malformed, tampered or signed with another key", () => {
		const record = { id: "g1", turns: [{ id: "t1", at: T0 }, { id: "t2", at: T0 }, { id: "t3", at: T0 }] };
		const cookie = encodeGuest(record, KEY);
		expect(decodeGuest(undefined, KEY)).toBeNull();
		expect(decodeGuest("", KEY)).toBeNull();
		expect(decodeGuest("not.a.cookie", KEY)).toBeNull();
		expect(decodeGuest(cookie, "other-key")).toBeNull();
		// The payload of a fresh guest with the old signature: turns left, forged.
		const forged = `${encodeGuest({ id: "g1", turns: [] }, KEY).split(".")[0]}.${cookie.split(".")[1]}`;
		expect(decodeGuest(forged, KEY)).toBeNull();
	});

	it("drops turn entries that do not read as turns", () => {
		const loose = { id: "g1", turns: [{ id: "t1", at: T0 }, "x", { id: 2 }] } as unknown as Parameters<typeof encodeGuest>[0];
		expect(decodeGuest(encodeGuest(loose, KEY), KEY)).toEqual({ id: "g1", turns: [{ id: "t1", at: T0 }] });
	});
});

describe("admitGuestTurn", () => {
	it("gives a new guest the limit, one turn at a time", () => {
		let record = newGuest();
		for (let i = 1; i <= GUEST_TURN_LIMIT; i++) {
			const v = admitGuestTurn(record, `t${i}`, T0 + i);
			expect(v.allowed).toBe(true);
			if (v.allowed) {
				expect(v.quota).toEqual({ used: i, limit: GUEST_TURN_LIMIT });
				record = v.record;
			}
		}
		const refused = admitGuestTurn(record, "t4", T0 + 10);
		expect(refused.allowed).toBe(false);
		if (!refused.allowed) {
			expect(refused.quota.used).toBe(GUEST_TURN_LIMIT);
			expect(refused.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it("counts a turn once however many calls its loop makes", () => {
		const first = admitGuestTurn(newGuest(), "t1", T0);
		if (!first.allowed) throw new Error("expected allowed");
		const again = admitGuestTurn(first.record, "t1", T0 + 3000);
		expect(again.allowed).toBe(true);
		if (again.allowed) expect(again.quota.used).toBe(1);
	});

	it("frees a slot when its turn leaves the window", () => {
		const record = { id: "g", turns: [{ id: "a", at: T0 }, { id: "b", at: T0 + 1000 }, { id: "c", at: T0 + 2000 }] };
		expect(admitGuestTurn(record, "d", T0 + 3000).allowed).toBe(false);
		const later = admitGuestTurn(record, "d", T0 + GUEST_WINDOW_MS + 500);
		expect(later.allowed).toBe(true);
		if (later.allowed) expect(later.quota.used).toBe(3);
	});
});
