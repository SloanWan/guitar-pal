/**
 * What `/docs/mcp` tells a player to paste, per client. Every snippet is
 * built from the one URL, so the page cannot show two addresses.
 */

/** The hosted server. Fixed to production: a preview's URL dies with the preview. */
export const MCP_URL = "https://guitarpal.sloanwan.com/api/mcp";

/** The name the server is registered under in a client's config. */
export const MCP_SERVER_NAME = "guitar-pal";

export type ConnectClient = "claude" | "chatgpt" | "claudeCode" | "cursor" | "vscode";

/** In the order the page's picker lists them. */
export const CONNECT_CLIENTS: readonly ConnectClient[] = ["claude", "chatgpt", "claudeCode", "cursor", "vscode"];

const json = (value: unknown): string => JSON.stringify(value, null, 2);

/**
 * The text to copy for each client: claude.ai and ChatGPT take the bare URL
 * in a form, Claude Code a command, Cursor and VS Code a config file (their
 * keys differ).
 */
export function connectSnippets(url: string = MCP_URL): Record<ConnectClient, string> {
	return {
		claude: url,
		chatgpt: url,
		claudeCode: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`,
		cursor: json({ mcpServers: { [MCP_SERVER_NAME]: { url } } }),
		vscode: json({ servers: { [MCP_SERVER_NAME]: { type: "http", url } } }),
	};
}
