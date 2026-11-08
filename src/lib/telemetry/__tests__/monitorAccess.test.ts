import { describe, expect, it } from "vitest";
import { canViewMonitor, monitorViewers } from "../monitorAccess";

describe("monitor access", () => {
	it("reads a comma-separated list, spaces and empties dropped", () => {
		expect([...monitorViewers(" a1, b2 ,,")]).toEqual(["a1", "b2"]);
	});

	it("lets in a listed account only", () => {
		expect(canViewMonitor("b2", "a1,b2")).toBe(true);
		expect(canViewMonitor("c3", "a1,b2")).toBe(false);
	});

	it("lets nobody in when unset, or when signed out", () => {
		expect(canViewMonitor("a1", undefined)).toBe(false);
		expect(canViewMonitor("a1", "")).toBe(false);
		expect(canViewMonitor(null, "a1")).toBe(false);
	});
});
