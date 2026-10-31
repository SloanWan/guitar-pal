"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, AudioLines, ChevronLeft, ChevronRight, Play } from "lucide-react";
import Link from "@/components/AppLink";
import ChordDiagramSVG from "@/components/chords/ChordDiagramSVG";
import { Button } from "@/components/ui/button";
import { useChordVoicings } from "@/components/fingerpick/useChordVoicings";
import { useChordPreview, type ChordPreview } from "@/components/chords/useChordPreview";
import { boardHref } from "@/lib/chordBatchResolve";
import { chordHref } from "@/lib/chordSlug";
import { chordDisplayName } from "@/lib/chordSuffixes";
import { voicingToDiagramShape } from "@/lib/chordVoicing";
import { voicingPitches } from "@/lib/chordVoicingToMidi";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { chordAbbreviation } from "@/lib/strumProgressions";
import type { ChordRef } from "@/lib/strumPatterns";
import { pick, type Lang } from "@/lib/assistant/lang";
import { closeAssistant } from "@/lib/assistant/handoff";
import { claimAudition } from "@/lib/assistant/audition";

/**
 * Chords, held: the answer to "how do I play F#m7" and to "show me C Am F G".
 *
 * One section per chord: the library's shapes for it, one at a time, with the
 * arrows stepping through the rest — a phone's width holds one diagram, and
 * one is what the question asked for. The shape on show can be strummed or
 * played string by string, as on the chord page. The standard shape comes first, as the
 * chord page opens on it. A single chord's card leads to that page, where
 * every shape sits side by side and can be heard; several lead to the grid
 * that shows them all at once, each keeping a small link to its own page.
 * Nothing here writes anything; it is a lookup, not a proposal.
 */

/** One chord's shapes, with the arrows through them. */
function Shape({
	chord,
	voicingsOf,
	pageLink,
	preview,
	sounding,
	onSound,
	lang,
}: {
	chord: ChordRef;
	voicingsOf: ReturnType<typeof useChordVoicings>;
	/** Whether the header carries the link to the chord's own page. */
	pageLink: boolean;
	/** The card's one preview, shared by its shapes. */
	preview: ChordPreview;
	/** Whether the sounding preview is this shape's. */
	sounding: boolean;
	onSound: () => void;
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

	function sound(how: "strum" | "arpeggio") {
		if (!shown) return;
		// Silences a strum or tab card that is playing; a preview is too short to hold the floor.
		claimAudition(() => undefined)();
		onSound();
		const pitches = voicingPitches(shown);
		void (how === "strum" ? preview.play(pitches) : preview.arpeggiate(pitches));
	}

	return (
		<div>
			<div className="as-card-h">
				<span className="as-card-t">{chordDisplayName(chord.root, chord.suffix)}</span>
				<span className="as-card-meta">
					{voicings.length > 0 && (
						<span>
							{shown?.label ? `${shown.label} · ` : ""}
							{index + 1} / {voicings.length}
						</span>
					)}
					{pageLink && (
						<Link href={chordHref(chord.root, chord.suffix)} onClick={closeAssistant}>
							{pick(lang, "page", "和弦页")}
							<ArrowUpRight aria-hidden="true" />
						</Link>
					)}
				</span>
			</div>

			<div className="as-shape">
				<Button
					variant="icon"
					size="xs"
					onClick={() => setAt(Math.max(0, index - 1))}
					disabled={voicings.length < 2 || index <= 0}
					aria-label={pick(lang, `Previous ${label} shape`, `${label} 上一个按法`)}
				>
					<ChevronLeft aria-hidden="true" />
				</Button>
				{/* The diagram's footprint holds while it loads, so the card does not jump when it lands. */}
				<div className="as-shape-dg">
					{shown ? (
						<span role="img" aria-label={label}>
							<ChordDiagramSVG {...voicingToDiagramShape(shown)} size="compact" />
						</span>
					) : state.status === "failed" ? (
						pick(lang, "Could not load its shapes", "指法加载失败")
					) : state.status === "ready" ? (
						pick(lang, "No shape in the library", "库里没有它的指法")
					) : (
						pick(lang, "Loading…", "加载中…")
					)}
				</div>
				<Button
					variant="icon"
					size="xs"
					onClick={() => setAt(Math.min(voicings.length - 1, index + 1))}
					disabled={voicings.length < 2 || index >= voicings.length - 1}
					aria-label={pick(lang, `Next ${label} shape`, `${label} 下一个按法`)}
				>
					<ChevronRight aria-hidden="true" />
				</Button>
			</div>

			{/* Labels that never change, so neither button moves while the samples load or the chord rings. */}
			<div className="as-shape-plays">
				<Button
					variant="secondary"
					size="xs"
					onClick={() => sound("strum")}
					disabled={!shown}
					loading={preview.isPreloading}
					aria-pressed={sounding && preview.playing === "strum"}
					aria-label={pick(lang, `Play ${label}`, `播放 ${label}`)}
				>
					<Play aria-hidden="true" />
					{pick(lang, "Play", "播放")}
				</Button>
				<Button
					variant="secondary"
					size="xs"
					onClick={() => sound("arpeggio")}
					disabled={!shown}
					loading={preview.isPreloading}
					aria-pressed={sounding && preview.playing === "arpeggio"}
					aria-label={pick(lang, `Arpeggio ${label}`, `分解 ${label}`)}
				>
					<AudioLines aria-hidden="true" />
					{pick(lang, "Arpeggio", "分解")}
				</Button>
			</div>
		</div>
	);
}

export default function ChordShapeCard({ chords, lang = "en" }: { chords: readonly ChordRef[]; lang?: Lang }) {
	// One lookup for the lot: a chord asked about twice is fetched once.
	const voicingsOf = useChordVoicings(chords);
	const several = chords.length > 1;
	const preview = useChordPreview();
	const [soundingOf, setSoundingOf] = useState<number | null>(null);

	return (
		<div className="as-card" data-m="chords">
			<div className="as-shapes">
				{chords.map((chord, i) => (
					<Shape
						key={`${chord.root} ${chord.suffix} ${i}`}
						chord={chord}
						voicingsOf={voicingsOf}
						pageLink={several}
						preview={preview}
						sounding={preview.isPlaying && soundingOf === i}
						onSound={() => setSoundingOf(i)}
						lang={lang}
					/>
				))}
			</div>

			<div className="as-card-f">
				<Button asChild size="sm" variant="secondary">
					{several ? (
						<Link href={boardHref(chords.map(chordAbbreviation).join(" "))} onClick={closeAssistant}>
							{pick(lang, `Open all ${chords.length} in the chord grid`, `在网格页并排看这 ${chords.length} 个`)}
							<ArrowUpRight aria-hidden="true" />
						</Link>
					) : (
						<Link href={chordHref(chords[0].root, chords[0].suffix)} onClick={closeAssistant}>
							{pick(lang, "Open in Chords", "在和弦库打开")}
							<ArrowUpRight aria-hidden="true" />
						</Link>
					)}
				</Button>
			</div>
		</div>
	);
}
