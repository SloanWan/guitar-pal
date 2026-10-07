import { resolveAssistantTurn, type AssistantTurnOutcome } from "@/lib/assistant/strum/turn";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { seg } from "./progress";

/**
 * The assistant chapter's story: a sentence is typed, the Strum reader
 * answers it, and the bar it proposes lands as a card to accept. The reply
 * and the proposal are the reader's own — the rules that answer on the
 * page answer here, at module load, on a four-chord index.
 */

export const ASSISTANT_DEMO_SENTENCE = "C G Am F, D DU UDU at 92 bpm capo 2";

const INDEX: readonly ChordIndexEntry[] = [
	{ root: "C", suffix: "major" },
	{ root: "G", suffix: "major" },
	{ root: "A", suffix: "minor" },
	{ root: "F", suffix: "major" },
];

export const ASSISTANT_DEMO_OUTCOME: AssistantTurnOutcome = resolveAssistantTurn({
	text: ASSISTANT_DEMO_SENTENCE,
	index: INDEX,
});

const PHASE = { typing: [0.02, 0.3], reply: [0.36, 0.6], cardAt: 0.62, acceptAt: 0.86 } as const;

export interface AssistantStage {
	/** The sentence as typed so far. */
	typed: string;
	/** The caret is still moving. */
	typing: boolean;
	/** The reply as written so far; null before the assistant starts. */
	reply: string | null;
	card: boolean;
	/** The proposal has been accepted and handed to the strum page. */
	accepted: boolean;
	position: string;
}

export function assistantStage(p: number): AssistantStage {
	const typedShare = seg(p, ...PHASE.typing);
	const typed = ASSISTANT_DEMO_SENTENCE.slice(0, Math.round(typedShare * ASSISTANT_DEMO_SENTENCE.length));
	const replyShare = seg(p, ...PHASE.reply);
	const full = ASSISTANT_DEMO_OUTCOME.text;
	const reply = replyShare > 0 ? full.slice(0, Math.round(replyShare * full.length)) : null;
	const card = p >= PHASE.cardAt;
	const accepted = p >= PHASE.acceptAt;
	return {
		typed,
		typing: typedShare < 1,
		reply,
		card,
		accepted,
		position: accepted ? "HANDOFF → /STRUM" : card ? "PROPOSAL" : "STRUM",
	};
}
