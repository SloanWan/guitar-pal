"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagram from "@/components/chords/ChordDiagram";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";
import { batchGridHref } from "@/lib/chordBatchResolve";
import { chordHref } from "@/lib/chordSlug";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { selectStandardVoicing, voicingToDiagramShape } from "@/lib/chordVoicing";
import { chordAbbreviation } from "@/lib/strumProgressions";
import type { ChordRef } from "@/lib/strumPatterns";
import { pick, type Lang } from "@/lib/assistant/lang";

/**
 * Chords, held: the answer to "how do I play F#m7" and to "show me C Am F G".
 *
 * One section per chord: the library's shapes for it, one at a time, with the
 * arrows stepping through the rest — a phone's width holds one diagram, and
 * one is what the question asked for. The standard shape comes first, as the
 * chord page opens on it. A single chord's card leads to that page, where
 * every shape sits side by side and can be heard; several lead to the grid
 * that shows them all at once, each keeping a small link to its own page.
 * Nothing here writes anything; it is a lookup, not a proposal.
 */

const ARROW =
	"flex size-(--h-control) shrink-0 items-center justify-center border border-line-strong text-ink-dim transition-[color,border-color] duration-(--dur-hover) ease-out hover:border-denim hover:text-denim-accent disabled:pointer-events-none disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

const FOOTER_LINK =
	"flex h-(--h-control) w-full items-center justify-center gap-1.5 border border-denim bg-transparent px-3 font-mono text-xs uppercase tracking-[0.08em] text-denim-accent transition-[color,background-color,border-color,translate] duration-(--dur-hover) ease-out hover:bg-denim hover:text-on-denim motion-safe:active:translate-y-px active:bg-denim-tint active:text-denim-accent active:duration-(--dur-switch) focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1";

/** One chord's shapes, with the arrows through them. */
function Shape({
	chord,
	voicingsOf,
	pageLink,
	lang,
}: {
	chord: ChordRef;
	voicingsOf: ReturnType<typeof useChordVoicings>;
	/** Whether the header carries the link to the chord's own page. */
	pageLink: boolean;
	lang: Lang;
}) {
	const state = voicingsOf(chord);
	const voicings = useMemo(() => {
		if (state.status !== "ready") return [];
		// The standard shape leads; the rest keep the library's order.
		const standard = selectStandardVoicing(state.voicings);
		return standard ? [standard, ...state.voicings.filter((v) => v.id !== standard.id)] : state.voicings;
	}, [state]);
	const [at, setAt] = useState(0);
	const index = Math.min(at, Math.max(0, voicings.length - 1));
	const shown = voicings[index];
	const label = chordAbbreviation(chord);

	return (
		<div>
			<div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
				{/* Not uppercased like the other cards' headers: "m7" and "M7" are
				    different chords. */}
				<span className="truncate font-mono text-[11px] tracking-[0.08em] text-ink-dim">
					{chordDisplayName(chord.root, chord.suffix)}
				</span>
				<span className="flex shrink-0 items-baseline gap-3 font-mono text-[11px] tracking-[0.04em] text-ink-faint">
					{voicings.length > 0 && (
						<span>
							{shown?.label ? `${shown.label} · ` : ""}
							{index + 1} / {voicings.length}
						</span>
					)}
					{pageLink && (
						<Link
							href={chordHref(chord.root, chord.suffix)}
							className="flex items-center gap-0.5 text-denim-accent transition-colors duration-(--dur-hover) hover:text-denim focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-1"
						>
							{pick(lang, "page", "和弦页")}
							<ArrowUpRight className="size-3" strokeWidth={1.5} aria-hidden="true" />
						</Link>
					)}
				</span>
			</div>

			<div className="flex items-center justify-center gap-2 px-3 py-3">
				<button
					type="button"
					onClick={() => setAt(Math.max(0, index - 1))}
					disabled={voicings.length < 2 || index <= 0}
					aria-label={pick(lang, `Previous ${label} shape`, `${label} 上一个按法`)}
					className={ARROW}
				>
					<ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
				{shown ? (
					<ChordDiagram def={voicingToDiagramShape(shown)} label={label} size="regular" />
				) : (
					// The diagram's footprint, so the card does not jump when it lands.
					<div className="flex h-[240px] w-[210px] items-center justify-center border border-transparent bg-denim-tint font-mono text-[11px] tracking-[0.04em] text-ink-faint">
						{state.status === "failed"
							? pick(lang, "Could not load its shapes", "指法加载失败")
							: state.status === "ready"
								? pick(lang, "No shape in the library", "库里没有它的指法")
								: pick(lang, "Loading…", "加载中…")}
					</div>
				)}
				<button
					type="button"
					onClick={() => setAt(Math.min(voicings.length - 1, index + 1))}
					disabled={voicings.length < 2 || index >= voicings.length - 1}
					aria-label={pick(lang, `Next ${label} shape`, `${label} 下一个按法`)}
					className={ARROW}
				>
					<ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}

export default function ChordShapeCard({ chords, lang = "en" }: { chords: readonly ChordRef[]; lang?: Lang }) {
	// One lookup for the lot: a chord asked about twice is fetched once.
	const voicingsOf = useChordVoicings(chords);
	const several = chords.length > 1;

	return (
		<div className="mt-2 border border-denim bg-surface animate-[proposal-pop_0.18s_ease-out] motion-reduce:animate-none">
			<div className="divide-y divide-line">
				{chords.map((chord, i) => (
					<Shape key={`${chord.root} ${chord.suffix} ${i}`} chord={chord} voicingsOf={voicingsOf} pageLink={several} lang={lang} />
				))}
			</div>

			<div className="border-t border-line p-2">
				{several ? (
					<Link href={batchGridHref(chords.map(chordAbbreviation).join(" "))} className={FOOTER_LINK}>
						{pick(lang, `Open all ${chords.length} in the chord grid`, `在网格页并排看这 ${chords.length} 个`)}
						<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
					</Link>
				) : (
					<Link href={chordHref(chords[0].root, chords[0].suffix)} className={FOOTER_LINK}>
						{pick(lang, "Open in chords", "在和弦库打开")}
						<ArrowUpRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
					</Link>
				)}
			</div>
		</div>
	);
}
