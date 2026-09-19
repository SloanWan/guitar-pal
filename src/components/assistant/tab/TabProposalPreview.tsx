"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import TabStavePreview from "./TabStavePreview";
import { chordSymbolLabel } from "@/lib/fingerpickChords";
import { beatUnitGlyph } from "@/lib/strumMeter";
import { stashHandoff } from "@/lib/assistant/handoff";
import type { TabProposal } from "@/lib/assistant/tab/types";

/**
 * What the tab assistant is offering, drawn as the real stave rather than
 * described — the same VexFlow path the fingerpick page renders with, so what
 * the player confirms is what they will see. One row only; the editor is
 * where the whole pattern is read.
 *
 * Nothing is written from here. The proposal is handed to the fingerpick
 * page, which opens it in its editor for checking and saves it the way a
 * hand-drawn pattern is saved.
 */

const FINGERPICK_PATH = "/fingerpick";

export default function TabProposalPreview({ proposal }: { proposal: TabProposal }) {
	const router = useRouter();
	const pathname = usePathname();
	const { pattern } = proposal;
	const [shown, setShown] = useState(0);
	const more = pattern.measures.length - shown;

	function openInFingerpick() {
		// The stash announces itself, so a fingerpick page already on screen
		// picks it up; the navigation is only for the times this was asked from
		// elsewhere.
		stashHandoff({ kind: "fingerpick", pattern, warnings: proposal.warnings });
		if (pathname !== FINGERPICK_PATH) router.push(FINGERPICK_PATH);
	}

	return (
		<div className="mt-2 border border-denim bg-surface animate-[proposal-pop_0.18s_ease-out] motion-reduce:animate-none">
			<div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
				<span className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-ink-dim">
					{proposal.name}
				</span>
				<span className="flex shrink-0 gap-2 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
					{pattern.capo !== undefined && pattern.capo > 0 && <span>capo {pattern.capo}</span>}
					<span>
						{pattern.timeSignature[0]}/{pattern.timeSignature[1]}
					</span>
					<span>
						{beatUnitGlyph(pattern.timeSignature)} = {pattern.bpm}
					</span>
				</span>
			</div>

			<TabStavePreview measures={pattern.measures} timeSignature={pattern.timeSignature} onShown={setShown} />

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2">
				<span className="font-mono text-xs tracking-[0.04em] text-ink-dim">
					{pattern.measures.length} {pattern.measures.length === 1 ? "bar" : "bars"}
					{more > 0 && ` · ${more} more in the editor`}
				</span>
				{proposal.chords.length > 0 && (
					<span className="font-mono text-xs tracking-[0.04em] text-ink">
						{proposal.chords.map(chordSymbolLabel).join(" · ")}
					</span>
				)}
			</div>

			{proposal.warnings.length > 0 && (
				<ul className="border-t border-line px-3 py-2">
					{proposal.warnings.map((warning) => (
						<li
							key={`${warning.code}:${warning.path}:${warning.message}`}
							className="flex gap-2 py-0.5 text-xs leading-snug text-ink-dim"
						>
							<TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
							<span>{warning.message}</span>
						</li>
					))}
				</ul>
			)}

			<div className="border-t border-line p-2">
				<button
					type="button"
					onClick={openInFingerpick}
					className="flex h-(--h-control) w-full items-center justify-center gap-1.5 border border-denim bg-transparent px-3 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color,translate] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim motion-safe:active:translate-y-px active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
				>
					Open in fingerpick
					<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
