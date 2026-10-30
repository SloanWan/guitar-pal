"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import HearButton from "../HearButton";
import TabStavePreview from "./TabStavePreview";
import { useTabAudition } from "./useTabAudition";
import { chordSymbolLabel } from "@/lib/fingerpickChords";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { stashHandoff } from "@/lib/assistant/handoff";
import type { TabProposal } from "@/lib/assistant/tab/types";
import { indexPattern } from "@/lib/fingerpickIndex";
import { useNavRouter } from "@/components/nav-progress";

/**
 * What the tab assistant is offering, drawn as the real stave rather than
 * described — the same VexFlow path the fingerpick page renders with, so what
 * the player confirms is what they will see. One row only; the editor is
 * where the whole pattern is read. "Hear it" plays all of it, once.
 *
 * Nothing is written from here. The proposal is handed to the fingerpick
 * page, which opens it in its editor for checking and saves it the way a
 * hand-drawn pattern is saved.
 */

const FINGERPICK_PATH = "/fingerpick";

export default function TabProposalPreview({ proposal }: { proposal: TabProposal }) {
	const router = useNavRouter();
	const pathname = usePathname();
	const { pattern } = proposal;
	const [shown, setShown] = useState(0);
	const renderContext = useMemo(() => ({ index: indexPattern(pattern) }), [pattern]);
	const more = pattern.measures.length - shown;
	const audition = useTabAudition(pattern);

	function openInFingerpick() {
		// The stash announces itself, so a fingerpick page already on screen
		// picks it up; the navigation is only for the times this was asked from
		// elsewhere.
		stashHandoff({ kind: "fingerpick", pattern, warnings: proposal.warnings });
		if (pathname !== FINGERPICK_PATH) router.push(FINGERPICK_PATH);
	}

	return (
		<div className="as-card" data-m="tab">
			<div className="as-card-h">
				<span className="as-card-t">{proposal.name}</span>
				<span className="as-card-meta">
					{pattern.capo !== undefined && pattern.capo > 0 && <span>capo {pattern.capo}</span>}
					<span>
						{pattern.timeSignature[0]}/{pattern.timeSignature[1]}
					</span>
					<span>
						{beatUnitGlyph(pattern.timeSignature)} = {pattern.bpm}
					</span>
				</span>
			</div>

			<div className="as-card-b">
				{proposal.chords.length > 0 && (
					<div className="as-chordline">
						{proposal.chords.map((chord, i) => (
							<span key={i}>{chordSymbolLabel(chord)}</span>
						))}
					</div>
				)}
				<div className="as-stave">
					<TabStavePreview
						measures={pattern.measures}
						timeSignature={pattern.timeSignature}
						onShown={setShown}
						renderContext={renderContext}
					/>
				</div>
				<span className="as-card-note">
					{pattern.measures.length} {pattern.measures.length === 1 ? "bar" : "bars"}
					{more > 0 && ` · ${more} more in the editor`}
				</span>
				{proposal.warnings.length > 0 && (
					<ul className="as-warn">
						{proposal.warnings.map((warning) => (
							<li key={`${warning.code}:${warning.path}:${warning.message}`}>
								<TriangleAlert aria-hidden="true" />
								<span>{warning.message}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="as-card-f">
				<HearButton playing={audition.isPlaying} preparing={audition.isPreparing} onClick={audition.toggle} />
				<Button size="sm" onClick={openInFingerpick}>
					Open in Tab
					<ArrowUpRight aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}
