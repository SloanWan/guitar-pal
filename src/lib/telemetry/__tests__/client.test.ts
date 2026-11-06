import { describe, expect, it, vi } from "vitest";
import { createReporter, ERROR_FLUSH_MS, PAGE_CAP, telemetryEnabled, type ReporterDeps } from "../client";
import type { TelemetryEvent } from "../events";

function harness(over: Partial<ReporterDeps> = {}) {
	const batches: TelemetryEvent[][] = [];
	const timers: (() => void)[] = [];
	const reporter = createReporter({
		send: (events) => batches.push(events),
		path: () => "/chords/c/major?x=1",
		width: () => 375,
		build: "abc123",
		setTimer: (fn, ms) => {
			expect(ms).toBe(ERROR_FLUSH_MS);
			timers.push(fn);
		},
		...over,
	});
	const tick = () => timers.splice(0).forEach((fn) => fn());
	return { reporter, batches, tick };
}

describe("telemetryEnabled", () => {
	const on = { production: true, setting: undefined, webdriver: false, hostname: "guitarpal.sloanwan.com" };

	it("reports from a production build on the real site", () => {
		expect(telemetryEnabled(on)).toBe(true);
	});

	it("is silent in development, under automation, when turned off, and on localhost", () => {
		expect(telemetryEnabled({ ...on, production: false })).toBe(false);
		expect(telemetryEnabled({ ...on, webdriver: true })).toBe(false);
		expect(telemetryEnabled({ ...on, setting: "off" })).toBe(false);
		expect(telemetryEnabled({ ...on, hostname: "localhost" })).toBe(false);
		expect(telemetryEnabled({ ...on, hostname: "127.0.0.1" })).toBe(false);
	});

	it("can be turned on for localhost, but never in development", () => {
		expect(telemetryEnabled({ ...on, hostname: "localhost", setting: "on" })).toBe(true);
		expect(telemetryEnabled({ ...on, production: false, setting: "on" })).toBe(false);
	});
});

describe("createReporter: errors", () => {
	it("sends an error a few seconds later, with the route's pattern and the screen class", () => {
		const { reporter, batches, tick } = harness();
		reporter.error(new Error("boom"), "window");
		expect(batches).toEqual([]);
		tick();
		expect(batches).toHaveLength(1);
		expect(batches[0][0]).toMatchObject({
			kind: "error",
			source: "window",
			message: "Error: boom",
			route: "/chords/[rootSlug]/[suffixSlug]",
			viewport: "phone",
			build: "abc123",
		});
	});

	it("sends a cascade as one batch and the same error once", () => {
		const { reporter, batches, tick } = harness();
		reporter.error(new Error("a"), "window");
		reporter.error(new Error("a"), "window");
		reporter.error(new Error("b"), "rejection");
		tick();
		expect(batches).toHaveLength(1);
		expect(batches[0].map((e) => e.kind === "error" && e.message)).toEqual(["Error: a", "Error: b"]);
		reporter.error(new Error("a"), "window");
		tick();
		expect(batches).toHaveLength(1);
	});

	it("carries a boundary's digest", () => {
		const { reporter, batches, tick } = harness();
		reporter.error(new Error("render"), "boundary", { digest: "1234567890" });
		tick();
		expect(batches[0][0]).toMatchObject({ source: "boundary", digest: "1234567890" });
	});

	it("never sends more than the page's cap, however many distinct errors there are", () => {
		const { reporter, batches, tick } = harness();
		for (let i = 0; i < PAGE_CAP * 3; i++) {
			reporter.error(new Error(`e${i}`), "window");
			tick();
		}
		const total = batches.reduce((n, b) => n + b.length, 0);
		expect(total).toBe(PAGE_CAP);
		expect(batches.every((b) => b.length <= 20)).toBe(true);
	});

	it("leaves out the build when there is none", () => {
		const { reporter, batches, tick } = harness({ build: undefined });
		reporter.error("x", "window");
		tick();
		expect(batches[0][0]).not.toHaveProperty("build");
	});
});

describe("createReporter: vitals", () => {
	it("holds vitals until the page is hidden, keeping each metric's latest value", () => {
		const { reporter, batches } = harness({ width: () => 1280 });
		reporter.vital({ id: "v1-cls", name: "CLS", value: 0.02, rating: "good" });
		reporter.vital({ id: "v1-cls", name: "CLS", value: 0.15, rating: "needs-improvement" });
		reporter.vital({ id: "v1-lcp", name: "LCP", value: 1800, rating: "good" });
		expect(batches).toEqual([]);
		reporter.flush();
		expect(batches).toHaveLength(1);
		expect(batches[0]).toEqual([
			expect.objectContaining({ kind: "vital", name: "CLS", value: 0.15, rating: "needs-improvement", viewport: "desktop" }),
			expect.objectContaining({ kind: "vital", name: "LCP", value: 1800 }),
		]);
		reporter.flush();
		expect(batches).toHaveLength(1);
	});

	it("ignores what is not one of the five vitals", () => {
		const { reporter, batches } = harness();
		reporter.vital({ id: "h", name: "Next.js-hydration", value: 10, rating: "good" });
		reporter.vital({ id: "x", name: "LCP", value: Number.NaN, rating: "good" });
		reporter.vital({ id: "y", name: "LCP", value: 10, rating: "great" });
		reporter.flush();
		expect(batches).toEqual([]);
	});

	it("sends waiting errors with the vitals when the page goes", () => {
		const setTimer = vi.fn();
		const { reporter, batches } = harness({ setTimer });
		reporter.error(new Error("late"), "rejection");
		reporter.vital({ id: "i", name: "INP", value: 120, rating: "good" });
		reporter.flush();
		expect(batches[0].map((e) => e.kind)).toEqual(["error", "vital"]);
	});
});
