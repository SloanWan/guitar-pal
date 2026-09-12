import { describe, it, expect, vi } from "vitest";
import {
	resolveAssistantTurn,
	DETERMINISTIC_REPLY,
	PHRASE_REPLY,
	ASSISTANT_ENDPOINT,
} from "@/lib/strumAssistant/turn";
import type { AssistantReply, AssistantTurn } from "@/lib/strumAssistant/types";
import { isBrowsableSuffix } from "@/lib/chordSuffixes";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { CHORD_ROWS } from "@/lib/__fixtures__/chordData.fixture";

/**
 * The promise #136 is built on: the model is reached only where determinism
 * runs out. Every case here watches the injected fetch — a deterministic answer
 * that quietly called the endpoint would still look right on screen, and only
 * this assertion would notice.
 */

// The same chord corpus the proposal builder's tests use, so a word that
// resolves here resolves in the app for the same reason.
const INDEX: readonly ChordIndexEntry[] = CHORD_ROWS.filter((r) =>
	isBrowsableSuffix(r.suffix),
).map((r) => ({ root: r.root, suffix: r.suffix }));

function turns(text: string): AssistantTurn[] {
	return [{ role: "user", content: text }];
}

/** A fetch that fails the test if it is called at all. */
function forbiddenFetch() {
	return vi.fn(async () => {
		throw new Error("the model was reached for input the app can read itself");
	}) as unknown as typeof fetch;
}

function replyingFetch(reply: AssistantReply, status = 200) {
	return vi.fn(async () => new Response(JSON.stringify(reply), { status })) as unknown as typeof fetch;
}

describe("resolveAssistantTurn", () => {
	describe("paths the app reads itself — no API call", () => {
		it("answers a plain chord line from memory", async () => {
			const fetchImpl = forbiddenFetch();
			const outcome = await resolveAssistantTurn({
				text: "C Am F G",
				history: turns("C Am F G"),
				index: INDEX,
				fetchImpl,
			});

			expect(fetchImpl).not.toHaveBeenCalled();
			expect(outcome.usedModel).toBe(false);
			expect(outcome.text).toBe(DETERMINISTIC_REPLY);
			expect(outcome.proposal?.chords).toHaveLength(4);
			// No rhythm was asked for, so one was chosen — and said so.
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(true);
		});

		it("answers a typed rhythm from memory", async () => {
			const fetchImpl = forbiddenFetch();
			const outcome = await resolveAssistantTurn({
				text: "D DU UD",
				history: turns("D DU UD"),
				index: INDEX,
				fetchImpl,
			});

			expect(fetchImpl).not.toHaveBeenCalled();
			expect(outcome.usedModel).toBe(false);
			expect(outcome.proposal?.rhythm).toBe("D DU UD");
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(false);
		});

		it("answers a sentence the lexicon can read from memory", async () => {
			const fetchImpl = forbiddenFetch();
			const text = "给我一个 C-G-Am-F 的民谣扫弦，慢一点";
			const outcome = await resolveAssistantTurn({ text, history: turns(text), index: INDEX, fetchImpl });

			expect(fetchImpl).not.toHaveBeenCalled();
			expect(outcome.usedModel).toBe(false);
			expect(outcome.text).toBe(PHRASE_REPLY);
			expect(outcome.proposal?.chords).toHaveLength(4);
			expect(outcome.proposal?.rhythm).toBe("D DU UD");
			expect(outcome.proposal?.bpm).toBe(70);
			// The strokes came from the style word, not from the player.
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(true);
		});

		it("answers chords and a rhythm together from memory", async () => {
			const fetchImpl = forbiddenFetch();
			const outcome = await resolveAssistantTurn({
				text: "C Am F G, DUDUDUDU",
				history: turns("C Am F G, DUDUDUDU"),
				index: INDEX,
				fetchImpl,
			});

			expect(fetchImpl).not.toHaveBeenCalled();
			expect(outcome.proposal?.bars).toHaveLength(4);
			expect(outcome.proposal?.chords).toHaveLength(4);
		});
	});

	describe("the path that needs the model", () => {
		it("asks the endpoint when the words are not chords or a rhythm", async () => {
			const fetchImpl = replyingFetch({
				message: "Here is a slow folk strum.",
				draft: {
					kind: "progression",
					name: "slow folk",
					rhythm: "D DU UD",
					chords: ["C", "G"],
					bpm: 72,
					rhythmGuessed: true,
				},
			});
			const text = "something dreamy in C";
			const outcome = await resolveAssistantTurn({
				text,
				history: turns(text),
				index: INDEX,
				fetchImpl,
			});

			expect(fetchImpl).toHaveBeenCalledTimes(1);
			const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe(ASSISTANT_ENDPOINT);
			expect(JSON.parse((init as RequestInit).body as string)).toEqual({ messages: turns(text) });

			expect(outcome.usedModel).toBe(true);
			expect(outcome.text).toBe("Here is a slow folk strum.");
			// The bars are expanded here from the model's notation, never sent by it.
			expect(outcome.proposal?.bars).toHaveLength(2);
			expect(outcome.proposal?.warnings.rhythmGuessed).toBe(true);
		});

		it("shows a reply that carries no draft as speech", async () => {
			const fetchImpl = replyingFetch({ message: "Which key are you in?" });
			const outcome = await resolveAssistantTurn({
				text: "something folky",
				history: turns("something folky"),
				index: INDEX,
				fetchImpl,
			});

			expect(outcome.text).toBe("Which key are you in?");
			expect(outcome.proposal).toBeUndefined();
			expect(outcome.failed).toBeUndefined();
		});

		it("passes the endpoint's own refusal through as the failure", async () => {
			const fetchImpl = vi.fn(
				async () =>
					new Response(JSON.stringify({ error: "Sign in to use the assistant." }), {
						status: 401,
					}),
			) as unknown as typeof fetch;
			const outcome = await resolveAssistantTurn({
				text: "something dreamy",
				history: turns("something dreamy"),
				index: INDEX,
				fetchImpl,
			});

			expect(outcome.failed).toBe(true);
			expect(outcome.text).toBe("Sign in to use the assistant.");
		});

		it("survives a network that is simply not there", async () => {
			const fetchImpl = vi.fn(async () => {
				throw new Error("offline");
			}) as unknown as typeof fetch;
			const outcome = await resolveAssistantTurn({
				text: "something dreamy",
				history: turns("something dreamy"),
				index: INDEX,
				fetchImpl,
			});

			expect(outcome.failed).toBe(true);
			expect(outcome.proposal).toBeUndefined();
		});
	});
});
