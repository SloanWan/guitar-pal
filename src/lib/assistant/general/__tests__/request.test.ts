import { describe, it, expect } from "vitest";
import { buildGeneralRequest, contextBlock, withContext, type GeneralContext } from "@/lib/assistant/general/request";
import { TOOL_NAMES } from "@/lib/assistant/general/tools";

const ctx: GeneralContext = { page: "strum", strumNames: ["belief"], tabNames: [], lang: "zh" };

describe("the General request", () => {
	it("puts the breakpoint on the system prompt, after every tool", () => {
		const req = buildGeneralRequest("claude-sonnet-5", [{ role: "user", content: "hi" }], ctx);
		expect(req.tools?.map((t) => ("name" in t ? t.name : ""))).toEqual([...TOOL_NAMES]);
		expect(req.tools?.every((t) => !("cache_control" in t && t.cache_control))).toBe(true);
		const system = req.system as { cache_control?: unknown }[];
		expect(system[0].cache_control).toEqual({ type: "ephemeral" });
		expect(req.max_tokens).toBeGreaterThan(0);
	});

	it("is byte-stable across calls but for the messages", () => {
		const a = buildGeneralRequest("claude-sonnet-5", [{ role: "user", content: "one" }], ctx);
		const b = buildGeneralRequest("claude-sonnet-5", [{ role: "user", content: "two" }], ctx);
		expect(JSON.stringify(a.system)).toBe(JSON.stringify(b.system));
		expect(JSON.stringify(a.tools)).toBe(JSON.stringify(b.tools));
	});

	it("sets thinking and effort by model", () => {
		expect(buildGeneralRequest("claude-sonnet-5", [], ctx)).toMatchObject({ thinking: { type: "disabled" }, output_config: { effort: "low" } });
		const haiku = buildGeneralRequest("claude-haiku-4-5", [], ctx);
		expect(haiku).not.toHaveProperty("thinking");
		expect(haiku).not.toHaveProperty("output_config");
		expect(buildGeneralRequest("claude-opus-5", [], ctx)).toMatchObject({ thinking: { type: "adaptive" } });
	});

	it("rides the context on the turn's user message, leaving tool results alone", () => {
		const msgs = withContext(
			[
				{ role: "user", content: "earlier" },
				{ role: "assistant", content: "ok" },
				{ role: "user", content: "now" },
				{ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "read_strum", input: { text: "now" } }] },
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "read" }] },
			],
			ctx,
		);
		expect(msgs[0].content).toBe("earlier");
		expect(msgs[4].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "read" }]);
		const turn = msgs[2].content as { type: string; text: string }[];
		expect(turn[0].text).toBe(contextBlock(ctx));
		expect(turn[1].text).toBe("now");
	});

	it("names the page, the libraries and the language", () => {
		const block = contextBlock(ctx);
		expect(block).toContain("strumming machine");
		expect(block).toContain('"belief"');
		expect(block).toContain("fingerpicking patterns the player has: none");
		expect(block).toContain("interface language: zh");
	});
});
