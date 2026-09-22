"use client";

import { CornerDownLeft } from "lucide-react";
import ProposalPreview from "@/components/assistant/strum/ProposalPreview";
import { ASSISTANT_DEMO_OUTCOME, assistantStage } from "@/lib/landing/assistantStage";
import Chapter, { type ChapterCaption } from "./Chapter";
import { Pill } from "./landingUi";

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Describe a rhythm in words.",
		text: "Chords, strokes, tempo and capo in one line — the assistant reads it and proposes the bar.",
	},
	{
		lead: "Strum, Tab or General.",
		text: "Three modes on a chip. Whatever mode reads it, the card is drawn by the same code that draws the real pattern.",
	},
	{
		lead: "Accept it and play.",
		text: "The pattern lands in your workspace with the tempo and capo already set. Change it later in a sentence too.",
	},
];

const MODES = ["Strum", "Tab", "General"] as const;

/** A turn, in the panel's own bubble vocabulary: square, flat, denim for the player. */
function Bubble({ side, children }: { side: "user" | "assistant"; children: React.ReactNode }) {
	return (
		<div
			className={`max-w-[85%] px-2.5 py-1.5 text-sm leading-snug whitespace-pre-line ${
				side === "user" ? "bg-denim text-on-denim" : "bg-denim-tint text-ink"
			}`}
		>
			{children}
		</div>
	);
}

const CARET =
	"ml-px inline-block h-[1em] w-[0.55ch] translate-y-[0.15em] bg-current animate-[blink_1.1s_steps(1)_infinite] motion-reduce:animate-none";

export default function AssistantChapter({ index }: { index: number }) {
	const proposal = ASSISTANT_DEMO_OUTCOME.proposal;
	return (
		<Chapter
			index={index}
			name="Assistant"
			title="Say it. Don't click it."
			captions={CAPTIONS}
			cta={{ href: "/strum", label: "Try the assistant →" }}
			frame={{ title: "Assistant" }}
			position={(p) => assistantStage(p).position}
		>
			{(p) => {
				const s = assistantStage(p);
				return (
					<div className="flex min-h-[380px] flex-col">
						<div className="flex items-center gap-2 border-b border-line pb-2.5">
							<div role="radiogroup" aria-label="Which assistant" className="flex border border-line-strong">
								{MODES.map((m, i) => (
									<span
										key={m}
										role="radio"
										aria-checked={i === 0}
										className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
											i > 0 ? "border-l border-line-strong" : ""
										} ${i === 0 ? "bg-denim text-on-denim" : "text-ink-dim"}`}
									>
										{m}
									</span>
								))}
							</div>
							<span className="ml-auto min-w-0 truncate font-mono text-[11px] tracking-[0.04em] text-ink-faint">
								Guest · 3 of 3 free today
							</span>
						</div>

						<ul className="flex flex-1 flex-col gap-2.5 py-3">
							<li className="flex justify-end">
								<Bubble side="user">
									{s.typed}
									{s.typing && <span aria-hidden="true" className={CARET} />}
								</Bubble>
							</li>
							{s.reply !== null && (
								<li className="flex flex-col items-start gap-2">
									<Bubble side="assistant">
										{s.reply}
										{s.reply.length < ASSISTANT_DEMO_OUTCOME.text.length && (
											<span aria-hidden="true" className={CARET} />
										)}
									</Bubble>
									{s.card && proposal && (
										<div className="w-full max-w-[360px]">
											<ProposalPreview proposal={proposal} />
											<div
												aria-hidden={!s.accepted || undefined}
												className={`mt-2 transition-opacity duration-200 ${s.accepted ? "opacity-100" : "opacity-0"}`}
											>
												<Pill on>Ready in Strum · 92 BPM · Capo 2</Pill>
											</div>
										</div>
									)}
								</li>
							)}
						</ul>

						<div className="flex items-end gap-2 border-t border-line pt-2" aria-hidden="true">
							<span className="min-w-0 flex-1 border border-line-strong bg-panel px-2 py-[0.4375rem] font-mono text-xs text-ink-faint">
								Try: “Am F C G, travis picking”
							</span>
							<span className="flex size-8 flex-none items-center justify-center border border-line-strong text-ink-dim">
								<CornerDownLeft className="size-4" strokeWidth={1.5} />
							</span>
						</div>
					</div>
				);
			}}
		</Chapter>
	);
}
