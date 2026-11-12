/**
 * What `/docs/mcp` tells a player to paste, per client. Every snippet is
 * built from the one URL, so the page cannot show two addresses.
 */

/** The hosted server. Fixed to production: a preview's URL dies with the preview. */
export const MCP_URL = "https://guitarpal.sloanwan.com/api/mcp";

/** The name the server is registered under in a client's config. */
export const MCP_SERVER_NAME = "guitar-pal";

export type ConnectClient = "claude" | "claudeCode" | "cursor" | "vscode" | "other";

/** In the order the page's picker lists them. */
export const CONNECT_CLIENTS: readonly ConnectClient[] = ["claude", "claudeCode", "cursor", "vscode", "other"];

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * The text to copy for each client: claude.ai takes the bare URL in a form,
 * Claude Code a command, Cursor and VS Code a config file (their keys differ),
 * and "other" the `mcp-remote` bridge for a client that only launches local
 * servers.
 */
export function connectSnippets(url: string = MCP_URL): Record<ConnectClient, string> {
	return {
		claude: url,
		claudeCode: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`,
		cursor: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
		vscode: json({ servers: { [MCP_SERVER_NAME]: { type: "http", url } } }),
		other: json({ mcpServers: { [MCP_SERVER_NAME]: { command: "npx", args: ["-y", "mcp-remote", url] } } }),
	};
}
