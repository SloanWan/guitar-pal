import { describe, expect, it } from "vitest";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import {
	isShareId,
	newShareId,
	readSharedItem,
	sharePath,
	shareUrl,
	SHARE_ID_LENGTH,
	toSharePayload,
} from "@/lib/sharedItems";

const preset: FingerpickPattern = PRESET_FINGERPICK_PATTERNS[0];

describe("newShareId", () => {
	it("mints ids of the fixed length from the base62 alphabet", () => {
		for (let i = 0; i < 200; i++) {
			const id = newShareId();
			expect(id).toHaveLength(SHARE_ID_LENGTH);
			expect(isShareId(id)).toBe(true);
		}
	});

	it("does not repeat itself", () => {
		const ids = new Set(Array.from({ length: 500 }, () => newShareId()));
		expect(ids.size).toBe(500);
	});
});

describe("isShareId", () => {
	it("accepts the minted shape only", () => {
		expect(isShareId("abcDEF0123")).toBe(true);
		expect(isShareId("abcDEF012")).toBe(false);
		expect(isShareId("abcDEF01234")).toBe(false);
		expect(isShareId("abcDEF-123")).toBe(false);
		expect(isShareId("")).toBe(false);
	});
});

describe("sharePath / shareUrl", () => {
	it("is the public route, absolute when given an origin", () => {
		expect(sharePath("abcDEF0123")).toBe("/p/abcDEF0123");
		expect(shareUrl("https://guitar.example", "abcDEF0123")).toBe("https://guitar.example/p/abcDEF0123");
	});
});

describe("toSharePayload / readSharedItem", () => {
	it("round-trips a fingerpick pattern, with the row id as the pattern id", () => {
		const pattern: FingerpickPattern = {
			...preset,
			id: "owner-local-id",
			createdAt: "2026-01-01T00:00:00.000Z",
			capo: 2,
			measures: [
				{ ...preset.measures[0], repeatStart: true },
				{ ...preset.measures[0], id: "m2", repeatEnd: true, repeatTimes: 3 },
			],
		};
		const payload = toSharePayload({ kind: "fingerpick", pattern });
		expect(payload).not.toHaveProperty("id");
		expect(payload).not.toHaveProperty("createdAt");

		// Through JSON, the way the database hands it back.
		const stored = JSON.parse(JSON.stringify(payload)) as unknown;
		const item = readSharedItem({ id: "abcDEF0123", kind: "fingerpick", payload: stored });
		expect(item).not.toBeNull();
		expect(item?.kind).toBe("fingerpick");
		const read = item!.pattern;
		expect(read.id).toBe("abcDEF0123");
		expect(read.createdAt).toBeUndefined();
		expect(read.name).toBe(pattern.name);
		expect(read.bpm).toBe(pattern.bpm);
		expect(read.timeSignature).toEqual(pattern.timeSignature);
		expect(read.capo).toBe(2);
		expect(read.measures).toHaveLength(2);
		expect(read.measures[0].repeatStart).toBe(true);
		expect(read.measures[1]).toMatchObject({ repeatEnd: true, repeatTimes: 3 });
		expect(read.measures[0].slots).toEqual(pattern.measures[0].slots);
	});

	it("rejects a payload that is not a pattern", () => {
		expect(readSharedItem({ id: "abcDEF0123", kind: "fingerpick", payload: null })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "fingerpick", payload: "tab" })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "fingerpick", payload: { measures: [] } })).toBeNull();
	});

	it("rejects a kind it cannot read", () => {
		const payload = toSharePayload({ kind: "fingerpick", pattern: preset });
		expect(readSharedItem({ id: "abcDEF0123", kind: "strum", payload })).toBeNull();
		expect(readSharedItem({ id: "abcDEF0123", kind: "nonsense", payload })).toBeNull();
	});
});
