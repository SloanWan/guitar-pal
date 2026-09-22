"use client";

import StepGrid from "@/components/strum/StepGrid";
import type { BarChordDiagram } from "@/components/strum/useBarChordDiagrams";
import { voicingToDiagramShape } from "@/lib/chordVoicing";
import { CHORD_DEMO_VOICINGS } from "@/lib/landing/chordsStage";
import {
	STRUM_DEMO_CAPO,
	STRUM_DEMO_CHORDS,
	STRUM_DEMO_PROGRESSION,
	strumStage,
} from "@/lib/landing/strumStage";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import Chapter, { NARROW_STAGE_QUERY, type ChapterCaption } from "./Chapter";
import { BpmReadout, ENTER, ENTER_SVGS, Led, MODULE_LABEL, Pill, UNIT_LABEL } from "./landingUi";

/* The demo's bar chords drawn from the same fixed voicings the chord chapter
   uses — the shape view needs no database on the landing. */
const DIAGRAMS: BarChordDiagram[] = STRUM_DEMO_CHORDS.map((ref) => {
	const v = CHORD_DEMO_VOICINGS.find((d) => d.root === ref.root && d.suffix === ref.suffix);
	return v ? { status: "ready", def: voicingToDiagramShape(v.voicing) } : { status: "loading" };
});

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Every beat is a cell.",
		text: "Down, up, or a muted chuck — tap it in and hear it back on real guitar samples, at any tempo from 40 to 220.",
	},
	{
		lead: "Chords ride the bars.",
		text: "Pick a voicing per bar; the playhead strums it, string by string, with a metronome that ticks the beat, the division or the subdivision.",
	},
	{
		lead: "Type the progression as words.",
		text: "C G Am F becomes four bars you can loop, save, favourite and share with a link.",
	},
	{
		lead: "Capo, meter, diagram.",
		text: "Flip the chord names into shapes, set a capo, count in 4/4, 3/4, 6/8 or 12/8.",
	},
];

const WORDS = STRUM_DEMO_PROGRESSION.split(" ");

export default function StrumChapter({ index }: { index: number }) {
	// A phone's stage has no room for two bars with their diagrams: it shows the
	// bar under the playhead, the way the workspace follows it, and skips the chips.
	const narrow = useMediaQuery(NARROW_STAGE_QUERY);
	return (
		<Chapter
			index={index}
			name="Strum Machine"
			title="Rhythm you can see."
			captions={CAPTIONS}
			cta={{ href: "/strum", label: "Open Strum →" }}
			frame={{ title: "Old faithful", meta: "4/4 · 8 steps" }}
			position={(p) => strumStage(p).position}
		>
			{(p) => {
				const s = strumStage(p);
				return (
					<>
						{/* Tempo on one line, so the frame stays inside the stage once the
						    bars grow their chord diagrams. */}
						<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
							<div className="flex items-baseline gap-3">
								<span className={MODULE_LABEL}>
									<Led on />
									Tempo
								</span>
								<BpmReadout bpm={s.bpm} size="sm" />
								<span className={UNIT_LABEL}>BPM</span>
							</div>
							<div className="ml-auto flex flex-wrap gap-2">
								<Pill on>Loop</Pill>
								<Pill>Once</Pill>
								<Pill hidden={s.capo === null}>Capo {STRUM_DEMO_CAPO}</Pill>
							</div>
						</div>

						{/* One StepGrid per bar: a lone bar only nudges itself into view,
						    which is a no-op inside the sticky stage; a multi-bar grid would
						    scroll the page's own scroller to follow its playhead. */}
						{/* Every arrow tapped in and every shape drawn is a new SVG: it fades up. */}
						<div className={`mt-3 flex flex-col gap-2 ${ENTER_SVGS}`}>
							{s.bars.map((bar, i) =>
								narrow && i !== (s.activeCell?.barIdx ?? 0) ? null : (
									<div key={i} className={ENTER}>
										<StepGrid
											bars={[bar]}
											activeCell={
												s.activeCell && s.activeCell.barIdx === i
													? { ...s.activeCell, barIdx: 0 }
													: null
											}
											chordView={s.chordView}
											barDiagrams={[DIAGRAMS[i]]}
										/>
									</div>
								),
							)}
						</div>

						<div
							aria-hidden={s.progressionText === null || undefined}
							className={`mt-3 flex min-h-10 items-center gap-2.5 border border-line-strong bg-surface px-3 font-mono text-[13px] text-ink transition-opacity duration-200 ${
								s.progressionText === null ? "opacity-0" : ""
							}`}
						>
							<span className="text-[10px] tracking-[0.14em] text-ink-faint">CHORDS</span>
							<span>{s.progressionText ?? ""}</span>
							<span
								aria-hidden="true"
								className="inline-block h-[1em] w-[0.55ch] animate-[blink_1.1s_steps(1)_infinite] bg-denim motion-reduce:animate-none"
							/>
						</div>
						<div className="mt-2 flex flex-wrap gap-2 max-[900px]:hidden">
							{WORDS.map((w, i) => (
								<span
									key={w}
									aria-hidden={i >= s.chipsShown || undefined}
									className={`border px-3 py-[7px] font-mono text-xs font-medium transition-[opacity,transform,border-color,color] duration-250 ${
										i < s.chipsShown ? "opacity-100" : "translate-y-1.5 opacity-0"
									} ${s.currentChip === i ? "border-denim text-denim-accent" : "border-line-strong"}`}
								>
									{w}
								</span>
							))}
						</div>
					</>
				);
			}}
		</Chapter>
	);
}
