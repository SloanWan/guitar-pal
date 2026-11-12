import { describe, expect, it } from "vitest";
import { CONNECT_CLIENTS, MCP_SERVER_NAME, MCP_URL, connectSnippets } from "@/lib/mcp/connectGuide";

describe("connectSnippets", () => {
	const snippets = connectSnippets();

	it("points at the production server", () => {
		expect(MCP_URL).toBe("https://guitarpal.sloanwan.com/api/mcp");
		for (const client of CONNECT_CLIENTS) expect(snippets[client]).toContain(MCP_URL);
	});

	it("gives claude.ai and ChatGPT the bare URL and Claude Code an http add command", () => {
		expect(snippets.claude).toBe(MCP_URL);
		expect(snippets.chatgpt).toBe(MCP_URL);
		expect(snippets.claudeCode).toBe(`claude mcp add --transport http guitar-pal ${MCP_URL}`);
	});

	it("writes each config file in its client's shape", () => {
		expect(JSON.parse(snippets.cursor)).toEqual({ mcpServers: { [MCP_SERVER_NAME]: { url: MCP_URL } } });
		expect(JSON.parse(snippets.vscode)).toEqual({ servers: { [MCP_SERVER_NAME]: { type: "http", url: MCP_URL } } });
	});

	it("builds every snippet from the URL it is given", () => {
		const local = connectSnippets("http://localhost:3000/api/mcp");
		for (const client of CONNECT_CLIENTS) {
			expect(local[client]).toContain("http://localhost:3000/api/mcp");
			expect(local[client]).not.toContain(MCP_URL);
		}
	});
});
