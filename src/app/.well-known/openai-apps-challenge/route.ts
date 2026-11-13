import { challengeResponse } from "@/lib/mcp/domainChallenge";

/** OpenAI's domain challenge for the plugin directory; see `challengeResponse`. */
export const dynamic = "force-dynamic";

export function GET(): Response {
	return challengeResponse(process.env.OPENAI_APPS_CHALLENGE_TOKEN);
}
