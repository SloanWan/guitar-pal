"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import StepGrid from "@/components/strum/StepGrid";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { stashHandoff } from "@/lib/strumAssistant/handoff";
import type { AssistantProposal } from "@/lib/strumAssistant/types";

/**
 * What the assistant is offering, drawn as the real grid rather than described.
 *
 * Nothing is written from here. The proposal is handed to the strum page, which
 * owns saving patterns and progressions, so there is exactly one write path in
 * the app and the person always sees the thing before it exists.
 */

function warningLines(proposal: AssistantProposal): string[] {
	const lines: string[] = [];
	const { unresolvedChords, rhythmGuessed, padded, fellBackToDeterministic } = proposal.warnings;
	if (unresolvedChords.length > 0) {
		lines.push(`No chord matched ${unresolvedChords.join(", ")} — those bars have no chord.`);
	}
	if (rhythmGuessed) lines.push("The rhythm is a suggestion, not something you asked for.");
	if (padded) lines.push("The rhythm was shorter than the bar and was padded with rests.");
	if (fellBackToDeterministic) lines.push("Built without the model after it failed to answer usably.");
	return lines;
}

export default function ProposalPreview({ proposal }: { proposal: AssistantProposal }) {
	const router = useRouter();
	const warnings = warningLines(proposal);

	function openInStrum() {
		stashHandoff(proposal);
		router.push("/strum");
	}

	return (
		<div className="mt-2 border border-line-strong bg-surface">
			<div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
				<span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					{proposal.name}
				</span>
				{proposal.bpm !== null && (
					<span className="shrink-0 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
						{proposal.bpm} BPM
					</span>
				)}
			</div>

			<div className="overflow-x-auto px-3 py-3">
				<StepGrid bars={proposal.bars} activeCell={null} size="sm" showLabels={false} />
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2">
				<span className="font-mono text-xs tracking-[0.08em] text-ink">{proposal.rhythm}</span>
				{proposal.chords.length > 0 && (
					<span className="font-mono text-xs tracking-[0.04em] text-ink-dim">
						{proposal.chords.map(chordAbbreviation).join(" · ")}
					</span>
				)}
			</div>

			{warnings.length > 0 && (
				<ul className="border-t border-line px-3 py-2">
					{warnings.map((line) => (
						<li key={line} className="flex gap-2 py-0.5 text-xs leading-snug text-ink-dim">
							<TriangleAlert
								className="mt-px size-3.5 shrink-0"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
							<span>{line}</span>
						</li>
					))}
				</ul>
			)}

			<div className="border-t border-line p-2">
				<button
					type="button"
					onClick={openInStrum}
					className="flex h-(--h-control) w-full items-center justify-center gap-1.5 border border-denim bg-transparent px-3 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color,translate] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim motion-safe:active:translate-y-px active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					Open in strum
					<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
