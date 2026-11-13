#!/usr/bin/env node
/**
 * Builds the OpenAI plugin package for the MCP server (#492): a ZIP of
 * plugin.json + mcp.json + assets/ + skills/, from docs/listing/.
 *
 *   node scripts/build-openai-plugin.mjs        # → dist/openai-plugin/guitar-pal-<version>.zip
 *
 * Schema as OpenAI's docs gave it on 2026-11-13
 * (developers.openai.com/apps-sdk/deploy/submission, /plugins/build/plugins,
 * /plugins/deploy/submission-errors): Agent Plugins `plugin.json` with the
 * listing under `extensions["com.openai"]`, a root `mcp.json` with one
 * streamable-http server and `auth.type: "none"`, no headers, and at least one
 * skill. Reviewer instructions and credentials are typed into the portal,
 * never packed. The limits below are checked so a bad field fails here, not
 * in review.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LISTING = path.join(ROOT, "docs/listing");
const listing = JSON.parse(readFileSync(path.join(LISTING, "listing.json"), "utf8"));
const cases = JSON.parse(readFileSync(path.join(LISTING, "openai-test-cases.json"), "utf8"));

const problems = [];
const atMost = (label, value, max) => {
	if (value.length > max) problems.push(`${label} is ${value.length} characters; the limit is ${max}.`);
};
const en = listing.en;
atMost("name", listing.slug, 64);
atMost("displayName", listing.name, 30);
atMost("shortDescription", en.tagline, 30);
atMost("description", en.taglineLong, 1024);
atMost("longDescription", en.description, 4000);
atMost("developerName", listing.developer.name, 80);
atMost("release_notes", en.releaseNotes, 4000);
if (en.prompts.length > 3) problems.push("defaultPrompt holds at most 3 prompts.");
for (const prompt of en.prompts) atMost(`defaultPrompt "${prompt.slice(0, 20)}…"`, prompt, 128);
if (cases.positive.length !== 5 || cases.negative.length !== 3) {
	problems.push(`Review needs exactly 5 positive and 3 negative test cases; there are ${cases.positive.length} and ${cases.negative.length}.`);
}
for (const c of cases.positive) {
	for (const key of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
		if (!c[key]) problems.push(`A positive case lacks ${key}: "${c.prompt ?? c.description}".`);
	}
}
for (const c of cases.negative) {
	for (const key of ["description", "prompt"]) if (!c[key]) problems.push(`A negative case lacks ${key}.`);
}
if (!listing.demoRecordingUrl) console.warn("warning: no demoRecordingUrl in listing.json; MCP review requires one before submitting.");
if (problems.length > 0) {
	console.error(problems.map((p) => `- ${p}`).join("\n"));
	process.exit(1);
}

const plugin = {
	$schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
	name: listing.slug,
	version: listing.version,
	description: en.taglineLong,
	author: { name: listing.developer.name, email: listing.developer.email, url: listing.website },
	homepage: listing.website,
	repository: listing.repository,
	keywords: ["guitar", "tab", "strumming", "fingerpicking", "music practice"],
	extensions: {
		"com.openai": {
			interface: {
				displayName: listing.name,
				shortDescription: en.tagline,
				longDescription: en.description,
				developerName: listing.developer.name,
				category: en.categories.openai,
				capabilities: [],
				websiteURL: listing.website,
				supportURL: listing.support,
				privacyPolicyURL: listing.privacy,
				termsOfServiceURL: listing.terms,
				defaultPrompt: en.prompts,
				brandColor: listing.brandColor,
				brandColorDark: listing.brandColorDark,
				logo: "./assets/logo.png",
				composerIcon: "./assets/icon.svg",
			},
			review: {
				test_cases: cases,
				...(listing.demoRecordingUrl ? { demo_recording_url: listing.demoRecordingUrl } : {}),
				commerce: false,
			},
			publication: {
				release_notes: en.releaseNotes,
				translations: {
					"zh-CN": { subtitle: listing.zh.tagline, description: listing.zh.description },
				},
			},
		},
	},
};

const mcp = {
	$schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
	mcpServers: {
		[listing.slug]: { type: "streamable-http", url: listing.url, extensions: { "com.openai": { auth: { type: "none" } } } },
	},
};

const out = path.join(ROOT, "dist/openai-plugin");
const stage = path.join(out, listing.slug);
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(stage, "assets"), { recursive: true });
mkdirSync(path.join(stage, "skills", listing.slug), { recursive: true });
writeFileSync(path.join(stage, "plugin.json"), `${JSON.stringify(plugin, null, 2)}\n`);
writeFileSync(path.join(stage, "mcp.json"), `${JSON.stringify(mcp, null, 2)}\n`);
copyFileSync(path.join(LISTING, "assets/icon-512.png"), path.join(stage, "assets/logo.png"));
copyFileSync(path.join(LISTING, "assets/icon.svg"), path.join(stage, "assets/icon.svg"));
copyFileSync(path.join(LISTING, "skill/SKILL.md"), path.join(stage, "skills", listing.slug, "SKILL.md"));

const zip = path.join(out, `${listing.slug}-${listing.version}.zip`);
const result = spawnSync("zip", ["-r", "-X", "-q", zip, listing.slug], { cwd: out, stdio: "inherit" });
if (result.status !== 0 || !existsSync(zip)) {
	console.error("zip failed; the staged folder is at", stage);
	process.exit(1);
}
console.log(path.relative(ROOT, zip));
