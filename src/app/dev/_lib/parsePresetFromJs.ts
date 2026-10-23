import { SampleLoadError, type WafPreset } from "@/components/strum/useGuitarSampleLoader";

/**
 * Dev only: the /dev audition pages browse presets straight off the
 * webaudiofontdata CDN, so they still need to read its JS files. The app's
 * loaders read the bundled JSON instead (#366) and never evaluate a download;
 * keep this module out of anything outside src/app/dev.
 *
 * Extract and evaluate the preset object from a webaudiofont instrument JS file.
 * The CDN file format is valid JavaScript but not valid JSON:
 *   console.log('load _tone_XXXX_...');
 *   var _tone_XXXX_...={zones:[{midi:25,originalPitch:7400,...,sample:'BASE64...'}]};
 *
 * CDN quirks handled by delegating to the JS engine via Function():
 *   - Unquoted identifier keys  (midi:25)
 *   - Single-quoted strings     (sample:'BASE64...')
 *   - Inline // comments        (//_tone.mgtr between last property and closing })
 *
 * Extraction: a regex locates the variable assignment; brace-counting (tracking
 * only double-quote strings, sufficient since base64 contains no braces) finds
 * the matching closing brace. The extracted text is the sole input to Function() —
 * the full file script is never executed, so the leading console.log() is skipped.
 */
export function parsePresetFromJs(text: string, varName: string): WafPreset {
	const assignmentRe = new RegExp(String.raw`\b${varName}\s*=\s*\{`);
	const match = assignmentRe.exec(text);
	if (!match) {
		throw new SampleLoadError(`Preset variable "${varName}" not found in fetched content`);
	}

	const jsStart = match.index + match[0].length - 1;

	let depth = 0;
	let inString = false;
	let escape = false;
	let jsEnd = -1;

	for (let i = jsStart; i < text.length; i++) {
		const ch = text[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (ch === "\\" && inString) {
			escape = true;
			continue;
		}
		if (ch === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) {
				jsEnd = i;
				break;
			}
		}
	}

	if (jsEnd === -1) {
		throw new SampleLoadError(`Unbalanced braces parsing preset "${varName}"`);
	}

	const jsText = text.slice(jsStart, jsEnd + 1);
	let result: unknown;
	try {
		result = new Function(`"use strict"; return (${jsText})`)();
	} catch (err) {
		throw new SampleLoadError(
			`Failed to evaluate preset "${varName}" as a JavaScript object`,
			err,
		);
	}

	if (!isWafPreset(result)) {
		throw new SampleLoadError(`Preset "${varName}" has unexpected shape (missing zones array)`);
	}

	return result;
}

function isWafPreset(value: unknown): value is WafPreset {
	return (
		typeof value === "object" &&
		value !== null &&
		"zones" in value &&
		Array.isArray((value as Record<string, unknown>).zones)
	);
}
