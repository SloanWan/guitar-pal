// @vitest-environment node
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

/** Which paths the session proxy runs on: everything but static files and the routes that need no session. */
const runs = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));

describe("proxy matcher", () => {
	it("runs on pages and on routes that read the session", () => {
		expect(runs("/chords")).toBe(true);
		expect(runs("/tab/edit/new")).toBe(true);
		expect(runs("/api/assistant")).toBe(true);
	});

	it("skips the report beacon and the shared chord shapes, which need no session (#447, #463)", () => {
		expect(runs("/api/telemetry")).toBe(false);
		expect(runs("/api/chords/voicings")).toBe(false);
		expect(runs("/_next/static/chunks/app.js")).toBe(false);
		expect(runs("/icon.svg")).toBe(false);
	});

	it("skips the service worker and the static files it stores (#468)", () => {
		expect(runs("/sw.js")).toBe(false);
		expect(runs("/offline.html")).toBe(false);
		expect(runs("/audio/webaudiofont/0250_LK_AcousticSteel_SF2_file.json")).toBe(false);
		// Only those names: a page that merely starts the same way still gets a session.
		expect(runs("/audiobooks")).toBe(true);
	});
});
