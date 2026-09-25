import { describe, expect, it } from "vitest";
import { ASSISTANT_DEMO_OUTCOME, ASSISTANT_DEMO_SENTENCE, assistantStage } from "../assistantStage";

describe("the demo sentence, read by the Strum rules", () => {
	it("proposes four bars of D DU UDU over C G Am F at 92, capo 2, with nothing to warn about", () => {
		const proposal = ASSISTANT_DEMO_OUTCOME.proposal;
		expect(proposal).toBeDefined();
		expect(proposal?.kind).toBe("progression");
		expect(proposal?.bars.map((b) => b.chord)).toEqual([
			{ root: "C", suffix: "major", voicingId: null },
			{ root: "G", suffix: "major", voicingId: null },
			{ root: "A", suffix: "minor", voicingId: null },
			{ root: "F", suffix: "major", voicingId: null },
		]);
		expect(proposal?.rhythm).toBe("D DU UDU");
		expect(proposal?.bpm).toBe(92);
		expect(proposal?.capo).toBe(2);
		expect(proposal?.warnings).toMatchObject({
			unresolvedChords: [],
			rhythmGuessed: false,
			padded: false,
			fellBackToDeterministic: false,
		});
		expect(ASSISTANT_DEMO_OUTCOME.failed).toBeUndefined();
		expect(ASSISTANT_DEMO_OUTCOME.text.length).toBeGreaterThan(0);
	});
});

describe("assistantStage", () => {
	it("types the sentence, then the reply, then shows the card, then accepts it", () => {
		expect(assistantStage(0)).toMatchObject({ typed: "", typing: true, reply: null, card: false, accepted: false });
		expect(assistantStage(0.16).typed).toBe(ASSISTANT_DEMO_SENTENCE.slice(0, Math.round(ASSISTANT_DEMO_SENTENCE.length / 2)));
		expect(assistantStage(0.3)).toMatchObject({ typed: ASSISTANT_DEMO_SENTENCE, typing: false, reply: null });
		expect(assistantStage(0.48).reply).toBe(
			ASSISTANT_DEMO_OUTCOME.text.slice(0, Math.round(ASSISTANT_DEMO_OUTCOME.text.length / 2)),
		);
		expect(assistantStage(0.6)).toMatchObject({ reply: ASSISTANT_DEMO_OUTCOME.text, card: false });
		expect(assistantStage(0.7)).toMatchObject({ card: true, accepted: false, position: "PROPOSAL" });
		expect(assistantStage(1)).toMatchObject({ card: true, accepted: true, position: "HANDOFF → /STRUM" });
	});
});
