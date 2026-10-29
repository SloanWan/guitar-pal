import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/* The Candy token file (#350) is plain CSS custom properties. These tests read it as text:
   the light base, the prefers-color-scheme dark block and the [data-theme="dark"] block must
   agree on their keys, and the colours must meet the contrast targets the design spec states. */

const css = readFileSync(path.resolve(__dirname, "../tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Decls = Map<string, string>;

/** Top-level rules as [prelude, body], with @media blocks flattened as "@media … > selector". */
function rules(source: string): [string, string][] {
	const out: [string, string][] = [];
	let i = 0;
	while (i < source.length) {
		const open = source.indexOf("{", i);
		if (open < 0) break;
		const prelude = source.slice(i, open).trim();
		let depth = 1;
		let j = open + 1;
		while (j < source.length && depth > 0) {
			if (source[j] === "{") depth++;
			else if (source[j] === "}") depth--;
			j++;
		}
		const body = source.slice(open + 1, j - 1);
		if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
			for (const [inner, innerBody] of rules(body)) out.push([`${prelude} > ${inner}`, innerBody]);
		} else {
			out.push([prelude, body]);
		}
		i = j;
	}
	return out;
}

function decls(body: string): Decls {
	const map: Decls = new Map();
	for (const part of body.split(";")) {
		const m = part.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
		if (m) map.set(m[1], m[2]);
	}
	return map;
}

function collect(match: (prelude: string) => boolean): Decls {
	const map: Decls = new Map();
	for (const [prelude, body] of rules(css)) if (match(prelude)) for (const [k, v] of decls(body)) map.set(k, v);
	return map;
}

const DARK_MEDIA = '@media (prefers-color-scheme: dark) > :root:not([data-theme="light"])';
const light = collect((p) => p === ":root");
const darkMedia = collect((p) => p === DARK_MEDIA);
const darkAttr = collect((p) => p === ':root[data-theme="dark"]');

/** Keys deliberately fixed across themes (app-icon tiles wear their own slots; role labels sit on light tints). */
const FIXED = new Set(["--gp-tile-l", "--gp-tile-d", "--gp-on-role", "--gp-focus", "--gp-a2-light"]);
const isFixed = (k: string) => FIXED.has(k) || /^--gp-lg[ld]\d$/.test(k);
/** A colour or shadow value — literally, or through a var() chain that ends in one. */
function isColour(v: string, depth = 0): boolean {
	if (/^(#|rgba?\(|color-mix\(|inset |0 )/.test(v)) return true;
	const ref = v.match(/^var\((--gp-[\w-]+)\)$/);
	const target = ref && light.get(ref[1]);
	return !!target && depth < 8 && isColour(target, depth + 1);
}

function resolve(key: string, theme: Decls): string {
	let v = theme.get(key) ?? light.get(key);
	for (let n = 0; v && v.startsWith("var(") && n < 8; n++) v = theme.get(v.slice(4, -1)) ?? light.get(v.slice(4, -1));
	if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${key} does not resolve to a hex colour (${v})`);
	return v;
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const MODULES = ["strum", "tab", "chords", "fb", "books"] as const;

describe("tokens.css — structure", () => {
	it("defines the decided values: Snow page and the matte gauge 500s", () => {
		expect(light.get("--gp-page")).toBe("#F7F7F8");
		expect(darkAttr.get("--gp-page")).toBe("#18191B");
		expect(MODULES.map((m) => light.get(`--gp-${m}-500`))).toEqual(["#4C7A56", "#427394", "#823F3B", "#624634", "#865D82"]);
	});

	it("defines every theme-dependent key of the light base in both dark blocks", () => {
		const themed = [...light].filter(([k, v]) => isColour(v) && !isFixed(k) && !k.startsWith("--gp-m-")).map(([k]) => k);
		expect(themed.length).toBeGreaterThan(60);
		expect(themed.filter((k) => !darkMedia.has(k))).toEqual([]);
		expect(themed.filter((k) => !darkAttr.has(k))).toEqual([]);
	});

	it("keeps the two dark blocks identical", () => {
		expect(Object.fromEntries(darkMedia)).toEqual(Object.fromEntries(darkAttr));
	});

	it("sets color-scheme with the theme: light by default, dark under either dark selector", () => {
		const scheme = (selector: string) =>
			rules(css)
				.filter(([p]) => p === selector)
				.map(([, body]) => body.match(/color-scheme\s*:\s*(\w+)/)?.[1])
				.find(Boolean);
		expect(scheme(":root")).toBe("light");
		expect(scheme(':root[data-theme="dark"]')).toBe("dark");
		expect(scheme(DARK_MEDIA)).toBe("dark");
	});

	it("points every module alias at its own ramp", () => {
		for (const m of MODULES) {
			const alias = collect((p) => p === `[data-m="${m}"]`);
			expect(alias.get("--gp-m-500")).toBe(`var(--gp-${m}-500)`);
			expect(alias.get("--gp-m-on")).toBe(`var(--gp-${m}-on)`);
		}
	});
});

describe("tokens.css — contrast targets (spec v1.1 §3)", () => {
	it("light ink, ink-2 and ink-3 reach 4.5:1 on page, card and well", () => {
		for (const ink of ["--gp-ink", "--gp-ink-2", "--gp-ink-3"])
			for (const ground of ["--gp-page", "--gp-card", "--gp-well"])
				expect(contrast(resolve(ink, light), resolve(ground, light)), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
	});

	it("every module 500 reads as a graphic on the Snow page (3:1)", () => {
		for (const m of MODULES) expect(contrast(resolve(`--gp-${m}-500`, light), resolve("--gp-page", light)), m).toBeGreaterThanOrEqual(3);
	});

	it("text on every 500 fill reaches 4.5:1 in both themes", () => {
		for (const theme of [light, darkAttr])
			for (const m of MODULES)
				expect(contrast(resolve(`--gp-${m}-on`, theme), resolve(`--gp-${m}-500`, theme)), m).toBeGreaterThanOrEqual(4.5);
	});

	it("dark ink reaches 12:1 on page and card, 7:1 on a button face (a known 10.4:1, spec §12)", () => {
		expect(contrast(resolve("--gp-ink", darkAttr), resolve("--gp-page", darkAttr))).toBeGreaterThanOrEqual(12);
		expect(contrast(resolve("--gp-ink", darkAttr), resolve("--gp-card", darkAttr))).toBeGreaterThanOrEqual(12);
		expect(contrast(resolve("--gp-ink", darkAttr), resolve("--gp-face", darkAttr))).toBeGreaterThanOrEqual(7);
	});

	it("dark ink-2 reaches 7:1 and ink-3 4.5:1 on page and card", () => {
		for (const ground of ["--gp-page", "--gp-card"]) {
			expect(contrast(resolve("--gp-ink-2", darkAttr), resolve(ground, darkAttr))).toBeGreaterThanOrEqual(7);
			expect(contrast(resolve("--gp-ink-3", darkAttr), resolve(ground, darkAttr))).toBeGreaterThanOrEqual(4.5);
		}
	});
});

/** `a` mixed into `b` at `share` (sRGB, close enough to the oklab mix for a contrast floor). */
function mix(a: string, b: string, share: number): string {
	const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
	return (
		"#" +
		[1, 3, 5]
			.map((i) => Math.round(ch(a, i) * share + ch(b, i) * (1 - share)))
			.map((n) => n.toString(16).padStart(2, "0"))
			.join("")
	);
}

describe("tokens.css — primitives II cues (#355)", () => {
	it("a Lift-selected card stands off the page: its 3px module shadow in light (3:1)", () => {
		for (const m of MODULES) expect(contrast(resolve(`--gp-${m}-sh`, light), resolve("--gp-page", light)), m).toBeGreaterThanOrEqual(3);
	});

	it("and its 60% module ring in dark (3:1 on the page)", () => {
		for (const m of MODULES) {
			const ring = mix(resolve(`--gp-${m}-500`, darkAttr), resolve("--gp-face", darkAttr), 0.6);
			expect(contrast(ring, resolve("--gp-page", darkAttr)), m).toBeGreaterThanOrEqual(3);
		}
	});

	it("toast text reaches 4.5:1 on the ink toast in both themes", () => {
		for (const theme of [light, darkAttr]) expect(contrast(resolve("--gp-on-ink", theme), resolve("--gp-ink", theme))).toBeGreaterThanOrEqual(4.5);
	});

	it("the toast's pick (the other theme's slot) reads on the ink toast (3:1)", () => {
		for (let slot = 0; slot <= 6; slot++) {
			expect(contrast(resolve(`--gp-lgd${slot}`, light), resolve("--gp-ink", light)), `light ${slot}`).toBeGreaterThanOrEqual(3);
		}
		for (const key of ["--gp-lgl0", "--gp-lgl1", "--gp-lgl2", "--gp-lgl3", "--gp-lgl5", "--gp-lgl6", "--gp-a2-light"]) {
			expect(contrast(resolve(key, light), resolve("--gp-ink", darkAttr)), `dark ${key}`).toBeGreaterThanOrEqual(3);
		}
	});
});

