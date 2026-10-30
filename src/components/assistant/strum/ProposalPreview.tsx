"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import RhythmGrid from "@/components/strum/stage/RhythmGrid";
import { chordAbbreviation } from "@/lib/strumProgressions";
import { DEFAULT_STRUM_BPM } from "@/lib/strumPatterns";
import { rhythmOfBars } from "@/lib/strumRhythm";
import { DEFAULT_METER, SUPPORTED_METERS, beatsPerBar, type Meter } from "@/lib/strumMeter";
import { patternHandoff, stashHandoff } from "@/lib/assistant/handoff";
import type { AssistantProposal } from "@/lib/assistant/types";
import HearButton from "../HearButton";
import { useStrumAudition } from "./useStrumAudition";
import "@/components/strum/strum.css";

/**
 * What the assistant is offering, drawn as the real grid rather than described.
 *
 * "Hear it" plays the bars once, the playhead walking the grid and the
 * sounding chord lit above it.
 *
 * Nothing is written from here. The proposal is handed to the strum page, which
 * owns saving patterns and progressions, so there is exactly one write path in
 * the app and the person always sees the thing before it exists.
 */

function warningLines(proposal: AssistantProposal): string[] {
	const lines: string[] = [];
	const { unresolvedChords, rhythmGuessed, padded, fellBackToDeterministic, capoIgnored } =
		proposal.warnings;
	if (unresolvedChords.length > 0) {
		lines.push(`No chord matched ${unresolvedChords.join(", ")} — those bars have no chord.`);
	}
	if (rhythmGuessed) lines.push("The rhythm is a suggestion, not something you asked for.");
	if (padded) lines.push("The rhythm was shorter than the bar and was padded with rests.");
	if (fellBackToDeterministic) lines.push("Built from the parts that could be read.");
	if (capoIgnored) lines.push("A capo was named, but there are no chords for it to sit on — it was left off.");
	return lines;
}

const STRUM_PATH = "/strum";

/** A proposal carries no meter: it is the simple one its bars have the beats of. */
function proposalMeter(proposal: AssistantProposal): Meter {
	const beats = proposal.bars[0]?.beats.length ?? 0;
	return SUPPORTED_METERS.find((m) => m[1] === 4 && beatsPerBar(m) === beats) ?? DEFAULT_METER;
}

export default function ProposalPreview({ proposal }: { proposal: AssistantProposal }) {
	const router = useRouter();
	const pathname = usePathname();
	const warnings = warningLines(proposal);
	const rhythm = rhythmOfBars(proposal.bars);
	const audition = useStrumAudition({
		bars: proposal.bars,
		bpm: proposal.bpm ?? DEFAULT_STRUM_BPM,
		capo: proposal.capo ?? 0,
		meter: proposalMeter(proposal),
		rhythmBars: rhythm.length,
	});
	// Bar i carries chord i of the line; a bar past the last chord has none.
	const soundingChord = audition.bar !== null && audition.bar < proposal.chords.length ? audition.bar : null;

	function openInStrum() {
		// The stash announces itself, so a strum page already on screen picks it
		// up; the navigation is only for the times this was asked from elsewhere.
		stashHandoff(patternHandoff(proposal));
		if (pathname !== STRUM_PATH) router.push(STRUM_PATH);
	}

	return (
		<div className="as-card" data-m="strum">
			<div className="as-card-h">
				<span className="as-card-t">{proposal.name}</span>
				<span className="as-card-meta">
					{proposal.capo !== null && <span>capo {proposal.capo}</span>}
					{proposal.bpm !== null && <span>{proposal.bpm} BPM</span>}
				</span>
			</div>

			<div className="as-card-b">
				{proposal.chords.length > 0 && (
					<div className="as-chordline">
						{proposal.chords.map((chord, i) => (
							<span key={i} data-on={i === soundingChord ? "" : undefined}>
								{chordAbbreviation(chord)}
							</span>
						))}
					</div>
				)}
				<div className="as-rhythm">
					{/* The rhythm once, as the pattern will hold it — the chords above say how many bars it plays. */}
					<RhythmGrid rhythm={rhythm} meter={proposalMeter(proposal)} position={audition.position} />
				</div>
				{warnings.length > 0 && (
					<ul className="as-warn">
						{warnings.map((line) => (
							<li key={line}>
								<TriangleAlert aria-hidden="true" />
								<span>{line}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="as-card-f">
				<HearButton
					playing={audition.isPlaying}
					preparing={audition.isPreparing}
					disabled={!audition.ready}
					onClick={audition.toggle}
				/>
				<Button size="sm" onClick={openInStrum}>
					Open in Strum
					<ArrowUpRight aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}
