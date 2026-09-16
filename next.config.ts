import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Self-hosted in Docker: emit .next/standalone with a traced node_modules
	// subset so the runtime image needs no `npm ci` (see Dockerfile).
	output: "standalone",
};

export default nextConfig;
