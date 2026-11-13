import { describe, expect, it } from "vitest";
import { challengeResponse } from "@/lib/mcp/domainChallenge";

describe("challengeResponse", () => {
	it("returns exactly the token, as plain text, uncached", async () => {
		const response = challengeResponse("  tok_abc123\n");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("tok_abc123");
		expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("is a 404 while no token is set", async () => {
		for (const token of [undefined, "", "   "]) {
			const response = challengeResponse(token);
			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain("tok");
		}
	});
});
