/**
 * OpenAI's domain verification for the plugin directory (#492): the portal
 * shows a token, and `/.well-known/openai-apps-challenge` on the MCP's host
 * must return exactly that token as plain text — "not JSON or a list of
 * tokens". The token lives in `OPENAI_APPS_CHALLENGE_TOKEN`; without it the
 * path is a plain 404, as it was before.
 */
export function challengeResponse(token: string | undefined): Response {
	const value = token?.trim();
	if (!value) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
	return new Response(value, {
		status: 200,
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
	});
}
