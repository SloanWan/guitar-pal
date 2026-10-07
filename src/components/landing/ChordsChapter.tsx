"use client";

import ChordDiagram from "@/components/chords/ChordDiagram";
import PianoKeyboard from "@/components/fretboard/PianoKeyboard";
import { voicingToDiagramShape } from "@/lib/chordVoicing";
import { CHORD_SUFFIX_CATEGORIES, ROOT_CHROMATIC_ORDER } from "@/lib/chordSuffixes";
import {
	CHORD_DEMO_VOICINGS,
	chordsStage,
	pitchClassOfName,
	stringTones,
} from "@/lib/landing/chordsStage";
import Chapter, { type ChapterCaption } from "./Chapter";
import { ENTER, Pill } from "./landingUi";

const QUALITY_COUNT = CHORD_SUFFIX_CATEGORIES.reduce((n, c) => n + c.suffixes.length, 0);

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Twelve roots on a piano key.",
		text: `Every open and barre voicing for each root, ${QUALITY_COUNT} chord qualities, drawn as diagrams with fingers, note names or a fretboard view.`,
	},
	{
		lead: "Hear it before you fret it.",
		text: "Each voicing plays back string by string on real samples, so the shape and the sound learn together.",
	},
	{
		lead: "Write your own.",
		text: "Type a fret sequence and the library names the chord for you. Search by name, or by the grip you already know.",
	},
];

/** Middle C's octave: one of each root, white keys edge to edge. */
const ONE_OCTAVE = { fromMidi: 60, toMidi: 71 };

const META: readonly { label: string; value: string }[] = [
	{ label: "Roots", value: String(ROOT_CHROMATIC_ORDER.length) },
	{ label: "Qualities", value: String(QUALITY_COUNT) },
	{ label: "Families", value: String(CHORD_SUFFIX_CATEGORIES.length) },
	{ label: "Views", value: "Fingers · Notes · Neck" },
	{ label: "Search", value: "Name or grip" },
	{ label: "Yours", value: "Fret sequence" },
];

const noop = () => {};

export default function ChordsChapter({ index }: { index: number }) {
	return (
		<Chapter
			index={index}
			name="Chord Library"
			title="Every root. Every voicing."
			captions={CAPTIONS}
			cta={{ href: "/chords", label: "Browse chords →" }}
			frame={{ title: "Chords" }}
			position={(p) => {
				const s = chordsStage(p);
				const v = CHORD_DEMO_VOICINGS[s.voicingIndex];
				if (s.ringingString === null) return `${v.root} ${v.suffix}`;
				const tone = stringTones(v)[6 - s.ringingString] ?? "×";
				return `String ${s.ringingString} · ${tone}`;
			}}
		>
			{(p) => {
				const s = chordsStage(p);
				const v = CHORD_DEMO_VOICINGS[s.voicingIndex];
				const tones = stringTones(v);
				return (
					<>
						<PianoKeyboard
							keys={ONE_OCTAVE}
							selectedPitchClass={pitchClassOfName(v.root)}
							onSelect={noop}
							ariaLabel="Chord root"
							className="max-w-[420px]"
						/>
						{/* Two columns only where the frame is wide enough for the diagram and the grid side by side. */}
						<div className="mt-4 grid grid-cols-1 items-start gap-5 @xl:grid-cols-2">
							<div className="flex flex-col items-center">
								{/* One diagram for every root: its dots slide to the next shape (ChordDiagramSVG). */}
								<ChordDiagram def={voicingToDiagramShape(v.voicing)} label={v.name} size="large" />
								{/* The six strings as they sound, low E first; the one being
								    played lights up in turn. */}
								<div
									key={`strings-${v.name}`}
									className={`mt-3 grid w-full max-w-[240px] grid-cols-6 gap-px border border-line bg-line ${ENTER}`}
									aria-label={`${v.name} string by string`}
								>
									{tones.map((t, i) => {
										const stringNo = 6 - i;
										const ringing = s.ringingString === stringNo;
										return (
											<span
												key={stringNo}
												className={`flex flex-col items-center gap-0.5 py-1.5 font-mono transition-[background-color,color,box-shadow] duration-100 ${
													ringing
														? "bg-denim text-on-denim shadow-(--glow-playhead)"
														: "bg-surface"
												}`}
											>
												<span
													className={`text-[8px] tracking-[0.1em] ${ringing ? "text-on-denim" : "text-ink-faint"}`}
												>
													{stringNo}
												</span>
												<span
													className={`text-xs font-medium ${ringing ? "" : t === null ? "text-ink-faint" : "text-ink"}`}
												>
													{t ?? "×"}
												</span>
											</span>
										);
									})}
								</div>
								<div className="mt-3.5">
									<Pill on={s.ringingString !== null}>▶ Play voicing</Pill>
								</div>
							</div>
							<div className="grid grid-cols-3 gap-px border border-line bg-line max-[640px]:hidden">
								{META.map(({ label, value }) => (
									<div key={label} className="bg-surface px-3 py-2.5">
										<span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint">
											{label}
										</span>
										<b className="mt-0.5 block font-mono text-sm font-medium text-ink">{value}</b>
									</div>
								))}
							</div>
						</div>
					</>
				);
			}}
		</Chapter>
	);
}
