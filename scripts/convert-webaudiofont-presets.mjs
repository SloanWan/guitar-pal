// One-time conversion (#366): the three WebAudioFont presets the app plays,
// from the JS files on surikov.github.io to JSON under public/audio/webaudiofont/.
//
// The upstream files are JavaScript, not JSON (unquoted keys, single-quoted
// strings, a trailing // comment), so each is run once here, offline, in a
// bare vm context, after its SHA-256 is checked against the hash below. The
// app then reads plain JSON and never evaluates anything it downloads.
//
// Usage: node scripts/convert-webaudiofont-presets.mjs
// Aborts without writing if a hash differs (upstream changed) or the JSON
// would not read back as the same object.

import { createHash } from "node:crypto";
import { deepEqual } from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SOURCE_BASE = "https://surikov.github.io/webaudiofontdata/sound/";
const OUT_DIR = path.resolve(import.meta.dirname, "../public/audio/webaudiofont");

/** Hashes of the files as fetched on 2026-10-22 (last modified upstream 2019-03-07). */
const PRESETS = [
	{
		key: "0250_LK_AcousticSteel_SF2_file",
		sha256: "a8993f799da3e40b59fb82016a8e752885f517127ab326a8d1fa0e8656c52ec9",
	},
	{
		key: "0280_Chaos_sf2_file",
		sha256: "15833dcec5b65ee203ce79ee5496f295099b3a54c62768bda3da120517e59810",
	},
	{
		key: "0000_Chaos_sf2_file",
		sha256: "862a854230a7ea26d7cc64d2485936cd01f5dd9a034fa5897ca60ba4b06bba8f",
	},
];

/** Throws unless every value is something JSON writes and reads back unchanged. */
function assertJsonSafe(value, at) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`${at}: non-finite number`);
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, i) => assertJsonSafe(item, `${at}[${i}]`));
		return;
	}
	if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) assertJsonSafe(v, `${at}.${k}`);
		return;
	}
	throw new Error(`${at}: ${typeof value} has no JSON form`);
}

const outputs = [];
for (const { key, sha256 } of PRESETS) {
	const url = `${SOURCE_BASE}${key}.js`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
	const text = await response.text();

	const actual = createHash("sha256").update(text).digest("hex");
	if (actual !== sha256) throw new Error(`${key}: SHA-256 ${actual}, expected ${sha256}`);

	const varName = `_tone_${key}`;
	const preset = vm.runInNewContext(`${text}\n;${varName}`, { console: { log() {} } }, { timeout: 5000 });
	if (!Array.isArray(preset?.zones) || preset.zones.length === 0) throw new Error(`${key}: no zones`);
	assertJsonSafe(preset, key);

	const json = JSON.stringify(preset);
	// The vm's objects come from another realm, so compare a plain copy.
	deepEqual(JSON.parse(json), structuredClone(preset), `${key}: JSON does not read back the same`);
	outputs.push({ key, json, zones: preset.zones.length, sha256 });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const { key, json, zones } of outputs) {
	writeFileSync(path.join(OUT_DIR, `${key}.json`), json);
	console.log(`${key}.json  ${zones} zones  ${json.length} bytes`);
}
