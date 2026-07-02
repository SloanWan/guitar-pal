/**
 * Standalone verification script — confirms that parsePresetFromJs correctly
 * evaluates both active webaudiofont CDN presets using the Function() approach.
 *
 * Requires Node.js 18+ (built-in fetch). Run with:
 *   node scripts/verify-cdn-parsing.mjs
 */

const CDN_BASE = "https://surikov.github.io/webaudiofontdata/sound/";

const PRESETS = [
  { key: "0250_SoundBlasterOld_sf2", varName: "_tone_0250_SoundBlasterOld_sf2" },
  { key: "0280_SoundBlasterOld_sf2", varName: "_tone_0280_SoundBlasterOld_sf2" },
];

function parsePresetFromJs(text, varName) {
  const re = new RegExp(`\\b${varName}\\s*=\\s*\\{`);
  const match = re.exec(text);
  if (!match) throw new Error(`Preset variable "${varName}" not found`);

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
  if (jsEnd === -1) throw new Error("Unbalanced braces");

  const jsText = text.slice(jsStart, jsEnd + 1);
  const result = new Function(`"use strict"; return (${jsText})`)();
  if (!result || !Array.isArray(result.zones)) throw new Error("Invalid shape");
  return result;
}

let passed = 0;
let failed = 0;

for (const { key, varName } of PRESETS) {
  const url = `${CDN_BASE}${key}.js`;
  process.stdout.write(`Fetching ${key}.js ... `);
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const preset = parsePresetFromJs(text, varName);
    console.log(`✓ (${preset.zones.length} zones)`);
    for (const [i, z] of preset.zones.entries()) {
      const data = z.sample
        ? `sample(${z.sample.length} b64 chars)`
        : z.file
        ? `file(${z.file.length} b64 chars)`
        : "NO DATA ✗";
      console.log(
        `  zone${i + 1}: [${z.keyRangeLow}–${z.keyRangeHigh}] pitch=${z.originalPitch} rate=${z.sampleRate} ${data}`
      );
      if (!z.sample && !z.file) { failed++; process.exitCode = 1; }
    }
    passed++;
  } catch (err) {
    console.log(`✗  ${err.message}`);
    failed++;
    process.exitCode = 1;
  }
}

console.log(`\n${passed} preset(s) OK, ${failed} failed.`);
