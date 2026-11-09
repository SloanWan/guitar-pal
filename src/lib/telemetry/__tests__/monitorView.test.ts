import { describe, expect, it } from "vitest";
import { monitorHref, monitorView } from "../monitorView";

const NOW = new Date("2026-11-09T12:00:00Z");

describe("monitorView", () => {
	it("defaults to the last 7 days by day, every screen", () => {
		const view = monitorView({}, NOW);
		expect(view).toMatchObject({ range: "7d", viewport: "all", bucket: "day", screen: null, to: NOW });
		expect(view.from.toISOString()).toBe("2026-11-02T12:00:00.000Z");
	});

	it("reads 24 hours by the hour, and one screen class", () => {
		const view = monitorView({ range: "24h", viewport: "phone" }, NOW);
		expect(view).toMatchObject({ bucket: "hour", screen: "phone" });
		expect(view.from.toISOString()).toBe("2026-11-08T12:00:00.000Z");
	});

	it("falls back on anything it does not know", () => {
		expect(monitorView({ range: "1y", viewport: ["tablet"] }, NOW)).toMatchObject({ range: "7d", viewport: "all" });
	});
});

describe("monitorHref", () => {
	it("writes only what differs from the default", () => {
		expect(monitorHref({ range: "7d", viewport: "all" })).toBe("/monitor");
		expect(monitorHref({ range: "30d", viewport: "desktop" })).toBe("/monitor?range=30d&viewport=desktop");
	});
});
