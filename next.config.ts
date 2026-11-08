import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Self-hosted in Docker: emit .next/standalone with a traced node_modules
	// subset so the runtime image needs no `npm ci` (see Dockerfile).
	//
	// Not on Vercel, though. Vercel injects its own build adapter and serves from
	// the Build Output API, so standalone buys nothing there — and in Next 16.3
	// the two together broke the build outright: the adapter suppressed
	// .next/next-server.js.nft.json while writeStandaloneDirectory still read it,
	// so every deploy died with ENOENT (vercel/next.js#96646, fixed in 16.3.5).
	// Dropping standalone under Vercel keeps that combination off the table.
	output: process.env.VERCEL ? undefined : "standalone",
	// Which build a report came from (#447): Vercel names its commit, the Docker
	// deploy passes BUILD_SHA. Empty when built by hand.
	env: {
		NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_SHA ?? "").slice(0, 12),
	},
	// The document pages read their Markdown from docs/ at request time; the
	// trace has to carry the file into the standalone output.
	outputFileTracingIncludes: {
		"/docs/assistant-grammar": ["./docs/assistant-grammar.md", "./docs/assistant-grammar.zh.md"],
	},
	// The Tab page lived at /fingerpick; links and bookmarks from then still land.
	// The query (?pattern=…, ?draft=…) is carried across.
	async redirects() {
		return [{ source: "/fingerpick/:path*", destination: "/tab/:path*", permanent: true }];
	},
};

export default nextConfig;
