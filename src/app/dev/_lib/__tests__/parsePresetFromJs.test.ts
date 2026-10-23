import { describe, it, expect } from "vitest";

import { parsePresetFromJs } from "@/app/dev/_lib/parsePresetFromJs";
import { SampleLoadError } from "@/components/strum/useGuitarSampleLoader";

const VALID_ZONE_JSON =
	'{"keyRangeLow":0,"keyRangeHigh":127,"originalPitch":6000,' +
	'"coarseTune":0,"fineTune":0,"loopStart":0,"loopEnd":0,' +
	`"sampleRate":44100,"file":"${btoa("fake-audio")}"}`;

function mockPresetJs(varName: string): string {
	return `if(typeof module!=="undefined")module.exports={};var ${varName}={"zones":[${VALID_ZONE_JSON}]};`;
}

// ─── parsePresetFromJs ─────────────────────────────────────────────────────────

describe("parsePresetFromJs — success paths", () => {
	it("parses a valid preset assignment", () => {
		const js = mockPresetJs("_tone_0250_Test");
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
		expect(result.zones[0].originalPitch).toBe(6000);
	});

	it("handles whitespace around the assignment operator", () => {
		const js = `var _tone_0250_Test = {"zones":[${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
	});

	it("handles multi-zone presets", () => {
		const js = `var _tone_Test={"zones":[${VALID_ZONE_JSON},${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_Test");
		expect(result.zones).toHaveLength(2);
	});

	it("correctly selects the target variable when multiple assignments appear", () => {
		const js =
			`var _tone_OTHER={"zones":[]};` +
			`var _tone_0250_Test={"zones":[${VALID_ZONE_JSON}]};`;
		const result = parsePresetFromJs(js, "_tone_0250_Test");
		expect(result.zones).toHaveLength(1);
	});

	it("parses real CDN format: unquoted keys, single-quoted strings, leading comma, JS comment", () => {
		const sampleB64 = btoa("fake-pcm-data");
		const js =
			`console.log('load _tone_CDN_Test');\n` +
			`var _tone_CDN_Test={\n` +
			`\tzones:[\n` +
			`\t\t{\n` +
			`\t\t\tmidi:25\n` +
			`\t\t\t,originalPitch:6000\n` +
			`\t\t\t,keyRangeLow:0\n` +
			`\t\t\t,keyRangeHigh:127\n` +
			`\t\t\t,coarseTune:0\n` +
			`\t\t\t,fineTune:-46\n` +
			`\t\t\t,loopStart:0\n` +
			`\t\t\t,loopEnd:0\n` +
			`\t\t\t,sampleRate:44100\n` +
			`\t\t\t,ahdsr:true\n` +
			`\t\t\t,sample:'${sampleB64}'\n` +
			`\t\t\t//_tone.mgtr\n` +
			`\t\t}\n` +
			`\t]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_CDN_Test");
		expect(result.zones).toHaveLength(1);
		expect(result.zones[0].originalPitch).toBe(6000);
		expect(result.zones[0].fineTune).toBe(-46);
		expect(result.zones[0].sample).toBe(sampleB64);
	});

	it("preserves // inside a base64 sample string and ignores the adjacent // comment", () => {
		const sampleWithSlashes = "AA//BB==";
		const js =
			`var _tone_Slash_Test={\n` +
			`\tzones:[{keyRangeLow:0,keyRangeHigh:127,originalPitch:6000,` +
			`coarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,` +
			`sample:'${sampleWithSlashes}'\n` +
			`//_tone.comment\n` +
			`}]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_Slash_Test");
		expect(result.zones[0].sample).toBe(sampleWithSlashes);
	});

	it("parses multi-zone CDN format with a // comment after each zone's sample", () => {
		const s1 = btoa("zone-one-pcm");
		const s2 = btoa("zone-two-pcm");
		const js =
			`console.log('load _tone_Multi_Test');\n` +
			`var _tone_Multi_Test={\n` +
			`\tzones:[\n` +
			`\t\t{\n` +
			`\t\t\tmidi:25,originalPitch:6000,keyRangeLow:0,keyRangeHigh:72,\n` +
			`\t\t\tcoarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,\n` +
			`\t\t\tsample:'${s1}'\n` +
			`\t\t\t//_tone.zone1\n` +
			`\t\t}\n` +
			`\t\t,{\n` +
			`\t\t\tmidi:25,originalPitch:8000,keyRangeLow:73,keyRangeHigh:127,\n` +
			`\t\t\tcoarseTune:0,fineTune:0,loopStart:0,loopEnd:0,sampleRate:44100,\n` +
			`\t\t\tsample:'${s2}'\n` +
			`\t\t\t//_tone.zone2\n` +
			`\t\t}\n` +
			`\t]\n` +
			`};`;
		const result = parsePresetFromJs(js, "_tone_Multi_Test");
		expect(result.zones).toHaveLength(2);
		expect(result.zones[0].sample).toBe(s1);
		expect(result.zones[1].sample).toBe(s2);
		expect(result.zones[1].originalPitch).toBe(8000);
	});
});

describe("parsePresetFromJs — error paths", () => {
	it("throws SampleLoadError when the variable is not found", () => {
		const js = mockPresetJs("_tone_OTHER");
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("not found");
	});

	it("does not match a variable whose name is a prefix of the target", () => {
		const js = `var _tone_0250_TestLong={"zones":[${VALID_ZONE_JSON}]};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
	});

	it("throws SampleLoadError for unbalanced braces", () => {
		const js = `var _tone_0250_Test={"zones":[{`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("Unbalanced");
	});

	it("throws SampleLoadError when the extracted value lacks a zones array", () => {
		const js = `var _tone_0250_Test={"notZones":true};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow("unexpected shape");
	});

	it("throws SampleLoadError when the extracted value is not valid JavaScript", () => {
		const js = `var _tone_0250_Test={broken js here};`;
		expect(() => parsePresetFromJs(js, "_tone_0250_Test")).toThrow(SampleLoadError);
	});
});

// ─── Live CDN integration ─────────────────────────────────────────────────────
//
// Skipped by default. Run with: INTEGRATION=1 npm test

const CDN_BASE = "https://surikov.github.io/webaudiofontdata/sound/";

describe.skipIf(!process.env.INTEGRATION)(
	"parsePresetFromJs — live CDN integration (INTEGRATION=1 npm test)",
	() => {
		it.each([
			["0250_SoundBlasterOld_sf2", "_tone_0250_SoundBlasterOld_sf2", 3],
			["0280_SoundBlasterOld_sf2", "_tone_0280_SoundBlasterOld_sf2", 2],
		] as const)(
			"parses live CDN preset %s with Function() and validates all zones",
			async (key, varName, expectedZones) => {
				const res = await fetch(`${CDN_BASE}${key}.js`);
				expect(res.ok).toBe(true);
				const text = await res.text();

				const preset = parsePresetFromJs(text, varName);

				expect(preset.zones).toHaveLength(expectedZones);
				for (const zone of preset.zones) {
					expect(zone.sampleRate).toBeGreaterThan(0);
					expect(zone.keyRangeLow).toBeGreaterThanOrEqual(0);
					expect(zone.keyRangeHigh).toBeGreaterThan(zone.keyRangeLow);
					expect(typeof zone.originalPitch).toBe("number");
					expect(zone.sample !== undefined || zone.file !== undefined).toBe(true);
					if (zone.sample !== undefined) {
						expect(zone.sample.length).toBeGreaterThan(0);
						expect(() => atob(zone.sample!)).not.toThrow();
					}
				}
			},
			15_000,
		);
	},
);
