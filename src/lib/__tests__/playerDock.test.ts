import { describe, it, expect } from "vitest";
import { dockFor, otherDock, readDock } from "@/lib/playerDock";

const area = { left: 100, top: 50, width: 1000, height: 600 };

describe("dockFor", () => {
	it("snaps to the left edge when let go near it", () => {
		expect(dockFor({ x: 140, y: 300 }, area)).toBe("left");
	});

	it("snaps to the bottom when let go near it", () => {
		expect(dockFor({ x: 600, y: 620 }, area)).toBe("bottom");
	});

	it("judges each edge by its own span", () => {
		// 20% of the width from the left, 25% of the height from the bottom: left wins.
		expect(dockFor({ x: 300, y: 500 }, area)).toBe("left");
		// 30% from the left, 10% from the bottom: bottom wins.
		expect(dockFor({ x: 400, y: 590 }, area)).toBe("bottom");
	});
});

describe("readDock / otherDock", () => {
	it("defaults to the bottom for anything it cannot read", () => {
		expect(readDock("left")).toBe("left");
		expect(readDock(null)).toBe("bottom");
		expect(readDock("top")).toBe("bottom");
	});

	it("flips between the two", () => {
		expect(otherDock("left")).toBe("bottom");
		expect(otherDock("bottom")).toBe("left");
	});
});
