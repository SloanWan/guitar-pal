// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * The service worker (`public/sw.js`, #468) is a plain script the browser
 * loads as it is, so it is run here the same way: in a sandbox with a stand-in
 * `self`, its top-level functions read back off the sandbox.
 */

const ORIGIN = "https://guitarpal.example";
const source = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");

type Strategy = "static" | "page" | "data" | "navigate" | "network";
interface Worker {
	strategyFor(method: string, href: string, mode: string): Strategy;
	assetsIn(html: string): string[];
	PRECACHE: string[];
	CACHE_NAMES: string[];
	listeners: string[];
}

function loadWorker(scriptUrl = `${ORIGIN}/sw.js?v=abc123`): Worker {
	const listeners: string[] = [];
	const self = { location: new URL(scriptUrl), addEventListener: (type: string) => listeners.push(type) };
	const sandbox = vm.createContext({ self, URL, Set, Promise, setTimeout });
	// `const`s stay in the script's own scope; this reads them back out.
	vm.runInContext(`${source}\n;this.__read = { PRECACHE, CACHE_NAMES: [STATIC_CACHE, PAGES_CACHE, DATA_CACHE] };`, sandbox);
	const read = sandbox.__read as { PRECACHE: string[]; CACHE_NAMES: string[] };
	return {
		strategyFor: sandbox.strategyFor as Worker["strategyFor"],
		assetsIn: sandbox.assetsIn as Worker["assetsIn"],
		PRECACHE: [...read.PRECACHE],
		CACHE_NAMES: [...read.CACHE_NAMES],
		listeners,
	};
}

const worker = loadWorker();
const strategy = (pathAndQuery: string, mode = "cors", method = "GET") =>
	worker.strategyFor(method, `${ORIGIN}${pathAndQuery}`, mode);

describe("strategyFor", () => {
	it("serves build files and the stored presets from the cache", () => {
		expect(strategy("/_next/static/chunks/0a1b2c.js", "no-cors")).toBe("static");
		expect(strategy("/_next/static/media/figtree.woff2")).toBe("static");
		expect(strategy("/audio/webaudiofont/0250_LK_AcousticSteel_SF2_file.json")).toBe("static");
		expect(strategy("/offline.html")).toBe("static");
	});

	it("keeps the tool pages, and the chord pages under /chords", () => {
		for (const page of ["/", "/strum", "/tab", "/fretboard", "/chords", "/chords/c/major", "/tab/edit/new", "/docs/assistant-grammar"]) {
			expect(strategy(page, "navigate"), page).toBe("page");
		}
		expect(strategy("/strum?pattern=p1", "navigate")).toBe("page");
	});

	it("never keeps a personal or private page, but still shows the offline page for it", () => {
		for (const page of ["/home", "/settings", "/auth", "/monitor", "/p/abc", "/books", "/dev/evals", "/chordsx", "/tab/editor"]) {
			expect(strategy(page, "navigate"), page).toBe("navigate");
		}
	});

	it("answers the shared chord shapes from the cache while refreshing them", () => {
		expect(strategy("/api/chords/voicings?c=C:major&c=G:major")).toBe("data");
	});

	it("leaves everything else to the network", () => {
		expect(strategy("/api/assistant", "cors", "POST")).toBe("network");
		expect(strategy("/api/telemetry", "cors", "POST")).toBe("network");
		expect(strategy("/api/chords/voicings", "cors", "POST")).toBe("network");
		// A soft navigation's RSC request: the router falls back to a full load offline, which is kept.
		expect(strategy("/strum?_rsc=1x2y")).toBe("network");
		expect(strategy("/sw.js")).toBe("network");
		expect(worker.strategyFor("GET", "https://abcd.supabase.co/rest/v1/user_strum_patterns", "cors")).toBe("network");
		expect(worker.strategyFor("GET", "https://other.example/_next/static/chunks/a.js", "no-cors")).toBe("network");
	});
});

describe("assetsIn", () => {
	it("finds the scripts, styles and fonts a page names, and the chunks in its flight data", () => {
		const html = [
			'<link rel="stylesheet" href="/_next/static/css/a1b2.css" data-precedence="next"/>',
			'<link rel="preload" href="/_next/static/media/figtree-x.p.woff2" as="font"/>',
			'<script src="/_next/static/chunks/main-9f.js" async=""></script>',
			'<script>self.__next_f.push([1,"2:I[123,[\\"static/chunks/page-77.js\\",\\"/_next/static/chunks/main-9f.js\\"],\\"default\\"]"])</script>',
		].join("");
		expect(worker.assetsIn(html).sort()).toEqual([
			"/_next/static/chunks/main-9f.js",
			"/_next/static/chunks/page-77.js",
			"/_next/static/css/a1b2.css",
			"/_next/static/media/figtree-x.p.woff2",
		]);
	});

	it("drops a query or fragment", () => {
		expect(worker.assetsIn('<script src="/_next/static/chunks/a.js?dpl=1"></script>')).toEqual(["/_next/static/chunks/a.js"]);
	});
});

describe("the worker's setup", () => {
	it("names its caches after the build it was registered with", () => {
		expect(worker.CACHE_NAMES).toEqual(["gp-static-abc123", "gp-pages-abc123", "gp-data-abc123"]);
		expect(loadWorker(`${ORIGIN}/sw.js`).CACHE_NAMES[0]).toBe("gp-static-local");
	});

	it("stores every bundled sound preset on install", () => {
		const presets = readdirSync(path.join(process.cwd(), "public/audio/webaudiofont")).filter((f) => f.endsWith(".json"));
		expect(presets.length).toBeGreaterThan(0);
		for (const file of presets) expect(worker.PRECACHE).toContain(`/audio/webaudiofont/${file}`);
	});

	it("only stores files that exist", () => {
		for (const url of worker.PRECACHE) expect(() => readFileSync(path.join(process.cwd(), "public", url))).not.toThrow();
	});

	it("listens for install, activate, the page's messages and fetches", () => {
		expect(worker.listeners.sort()).toEqual(["activate", "fetch", "install", "message"]);
	});
});
