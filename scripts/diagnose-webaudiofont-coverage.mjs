/**
 * Diagnostic script — WebAudioFont preset coverage analysis.
 * Run: node scripts/diagnose-webaudiofont-coverage.mjs
 *
 * Answers:
 *   1. Zone count per preset
 *   2. MIDI pitch range per zone
 *   3. Coverage gaps in guitar range MIDI 40–76 (E2–E5, open strings to 20th fret)
 *   4. Approximate sample file size per zone
 */

const WAF_BASE_URL = "https://surikov.github.io/webaudiofontdata/sound/";

const PRESETS = [
	{ label: "Steel Guitar (GM25)", key: "0250_SoundBlasterOld_sf2", varName: "_tone_0250_SoundBlasterOld_sf2" },
	{ label: "Muted Guitar (GM28)", key: "0280_SoundBlasterOld_sf2", varName: "_tone_0280_SoundBlasterOld_sf2" },
];

const GUITAR_RANGE_LOW = 40;  // E2  (low E open string)
const GUITAR_RANGE_HIGH = 76; // E5  (high E, 20th fret ~)

// ── Replicates parsePresetFromJs from useGuitarSampleLoader.ts ────────────────

function parsePreset(text, varName) {
	const assignmentRe = new RegExp(String.raw`\b${varName}\s*=\s*\{`);
	const match = assignmentRe.exec(text);
	if (!match) throw new Error(`Var "${varName}" not found`);

	const jsStart = match.index + match[0].length - 1;
	let depth = 0, inString = false, escape = false, jsEnd = -1;

	for (let i = jsStart; i < text.length; i++) {
		const ch = text[i];
		if (escape) { escape = false; continue; }
		if (ch === "\\" && inString) { escape = true; continue; }
		if (ch === '"') { inString = !inString; continue; }
		if (inString) continue;
		if (ch === "{") depth++;
		else if (ch === "}") { depth--; if (depth === 0) { jsEnd = i; break; } }
	}

	if (jsEnd === -1) throw new Error(`Unbalanced braces for "${varName}"`);
	const jsText = text.slice(jsStart, jsEnd + 1);
	return new Function(`"use strict"; return (${jsText})`)();
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

function b64DecodedBytes(b64) {
	// Base64: every 4 chars → 3 bytes; strip padding.
	const pad = (b64.match(/=+$/) || [""])[0].length;
	return Math.floor(b64.length * 3 / 4) - pad;
}

function midiToNote(midi) {
	const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
	return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function findGaps(zones, lo, hi) {
	// Collect all covered semitones in [lo, hi].
	const covered = new Set();
	for (const z of zones) {
		const zLo = Math.max(z.keyRangeLow, lo);
		const zHi = Math.min(z.keyRangeHigh, hi);
		for (let m = zLo; m <= zHi; m++) covered.add(m);
	}
	const gaps = [];
	let gapStart = null;
	for (let m = lo; m <= hi; m++) {
		if (!covered.has(m)) {
			if (gapStart === null) gapStart = m;
		} else {
			if (gapStart !== null) { gaps.push([gapStart, m - 1]); gapStart = null; }
		}
	}
	if (gapStart !== null) gaps.push([gapStart, hi]);
	return gaps;
}

// ── Main ──────────────────────────────────────────────────────────────────────

for (const preset of PRESETS) {
	const url = `${WAF_BASE_URL}${preset.key}.js`;
	console.log(`\n${"=".repeat(70)}`);
	console.log(`Preset: ${preset.label}`);
	console.log(`URL:    ${url}`);
	console.log("=".repeat(70));

	let text;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		text = await res.text();
		console.log(`Fetched: ${(text.length / 1024).toFixed(1)} KB raw JS`);
	} catch (e) {
		console.error(`  FETCH ERROR: ${e.message}`);
		continue;
	}

	let data;
	try {
		data = parsePreset(text, preset.varName);
	} catch (e) {
		console.error(`  PARSE ERROR: ${e.message}`);
		continue;
	}

	const zones = data.zones;
	console.log(`\nZone count: ${zones.length}`);

	// Per-zone table
	console.log(`\n${"─".repeat(70)}`);
	console.log(
		"Zone".padEnd(4) +
		"  keyLow".padEnd(10) +
		"keyHigh".padEnd(10) +
		"origPitch(MIDI)".padEnd(18) +
		"type".padEnd(8) +
		"decodedKB"
	);
	console.log("─".repeat(70));

	let totalBytes = 0;
	for (let i = 0; i < zones.length; i++) {
		const z = zones[i];
		const origMidi = Math.round(z.originalPitch / 100);
		const sampleData = z.file ?? z.sample ?? "";
		const bytes = sampleData ? b64DecodedBytes(sampleData) : 0;
		totalBytes += bytes;
		const type = z.file ? "file" : z.sample ? "sample" : "none";
		console.log(
			String(i).padEnd(4) +
			`  ${z.keyRangeLow} (${midiToNote(z.keyRangeLow)})`.padEnd(10) +
			`${z.keyRangeHigh} (${midiToNote(z.keyRangeHigh)})`.padEnd(10) +
			`${origMidi} (${midiToNote(origMidi)})`.padEnd(18) +
			type.padEnd(8) +
			`${(bytes / 1024).toFixed(1)} KB`
		);
	}
	console.log("─".repeat(70));
	console.log(`Total decoded sample data: ${(totalBytes / 1024).toFixed(1)} KB  (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);

	// Overall preset range
	const globalLow  = Math.min(...zones.map(z => z.keyRangeLow));
	const globalHigh = Math.max(...zones.map(z => z.keyRangeHigh));
	console.log(`\nFull coverage: MIDI ${globalLow} (${midiToNote(globalLow)}) – ${globalHigh} (${midiToNote(globalHigh)})`);

	// Guitar range gap analysis
	const gaps = findGaps(zones, GUITAR_RANGE_LOW, GUITAR_RANGE_HIGH);
	if (gaps.length === 0) {
		console.log(`Guitar range MIDI ${GUITAR_RANGE_LOW}–${GUITAR_RANGE_HIGH}: fully covered (no gaps)`);
	} else {
		console.log(`Guitar range MIDI ${GUITAR_RANGE_LOW}–${GUITAR_RANGE_HIGH}: ${gaps.length} gap(s):`);
		for (const [lo, hi] of gaps) {
			console.log(`  gap  MIDI ${lo} (${midiToNote(lo)}) – ${hi} (${midiToNote(hi)})`);
		}
	}
}

console.log(`\n${"=".repeat(70)}`);
console.log("Done.");
