import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Self-hosted in Docker: emit .next/standalone with a traced node_modules
	// subset so the runtime image needs no `npm ci` (see Dockerfile).
	output: "standalone",
	// The document pages read their Markdown from docs/ at request time; the
	// trace has to carry the file into the standalone output.
	outputFileTracingIncludes: {
		"/docs/assistant-grammar": ["./docs/assistant-grammar.md", "./docs/assistant-grammar.zh.md"],
	},
};

export default nextConfig;
