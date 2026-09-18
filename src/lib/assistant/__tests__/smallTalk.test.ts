import { describe, it, expect } from "vitest";
import { smallTalk } from "@/lib/assistant/smallTalk";
import { BLANK } from "@/lib/assistant/strum/suggest";

describe("smallTalk", () => {
	it("answers a greeting and points at the syntax", () => {
		for (const said of ["hi", "Hi!", "hello there", "hey", "你好", "嗨～", "good morning"]) {
			const talk = smallTalk(said);
			expect(talk, said).not.toBeNull();
			expect(talk!.text.trim(), said).not.toBe("");
			expect(talk!.templates.some((t) => t.includes(BLANK)), said).toBe(true);
		}
	});

	it("answers 'how are you' in its own voice", () => {
		for (const said of ["how are you?", "hru", "what's up", "你好吗"]) {
			expect(smallTalk(said)?.text, said).toMatch(/tune|string|play|working/i);
		}
	});

	it("takes thanks and goodbye without offering anything", () => {
		for (const said of ["thanks", "thank you!", "谢谢", "bye", "再见", "cya"]) {
			const talk = smallTalk(said);
			expect(talk, said).not.toBeNull();
			expect(talk!.templates, said).toEqual([]);
		}
	});

	it("explains itself when asked what it is or does", () => {
		for (const said of ["what can you do", "who are you?", "help", "?", "你能做什么"]) {
			const talk = smallTalk(said);
			expect(talk?.text, said).toMatch(/chords|rhythm|pattern/i);
			expect(talk?.templates.length, said).toBeGreaterThan(0);
		}
	});

	it("matches whole messages only", () => {
		// A question with content in it is not small talk, whatever it starts with.
		expect(smallTalk("what chords go with C")).toBeNull();
		expect(smallTalk("hi, add C G to belief")).toBeNull();
		expect(smallTalk("C Am F G")).toBeNull();
		expect(smallTalk("")).toBeNull();
	});

	it("gives the same message the same answer", () => {
		expect(smallTalk("hello")?.text).toBe(smallTalk("hello")?.text);
	});
});
