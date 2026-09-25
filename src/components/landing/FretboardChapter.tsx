"use client";

import Fretboard from "@/components/fretboard/Fretboard";
import PianoKeyboard from "@/components/fretboard/PianoKeyboard";
import type { PianoKey } from "@/lib/piano/keys";
import { SCALE_LABELS } from "@/lib/fretboard/scales";
import {
	FRETBOARD_DEMO_CHORD_MIDI,
	FRETBOARD_DEMO_CHORD_NAME,
	FRETBOARD_DEMO_KEY_CHORDS,
	FRETBOARD_DEMO_SPEC,
	FRETBOARD_DEMO_WINDOW,
	fretboardStage,
} from "@/lib/landing/fretboardStage";
import Chapter, { type ChapterCaption } from "./Chapter";
import { MODULE_LABEL, Pill } from "./landingUi";

const CAPTIONS: readonly ChapterCaption[] = [
	{
		lead: "Pick a key and a scale.",
		text: "Seven scale types across the whole neck, labelled as note names or scale degrees. Press anything to hear it.",
	},
	{
		lead: "Lay a chord over the scale.",
		text: "The chord tones light up in denim, so you can see which of the scale's notes are safe under your fingers.",
	},
	{
		lead: "The piano is the same key.",
		text: "Press a diatonic chord and its shape lights on the neck. Loop a progression one strum per bar while you find it.",
	},
];

/** A3 to G4: the key's seven chord roots, its own root on the first key (a range must end on a white key). */
const KEY_OCTAVE = { fromMidi: 57, toMidi: 67 };
const CHORD_BY_PC = new Map(FRETBOARD_DEMO_KEY_CHORDS.map((c) => [c.rootPitchClass, c]));
const chordKeyLabel = (key: PianoKey) => CHORD_BY_PC.get(key.pitchClass)?.numeral ?? "";
const keyDimmed = (key: PianoKey) => !CHORD_BY_PC.has(key.pitchClass);
const noop = () => {};

export default function FretboardChapter({ index }: { index: number }) {
	return (
		<Chapter
			index={index}
			name="Fretboard"
			title="The neck, explained."
			captions={CAPTIONS}
			cta={{ href: "/fretboard", label: "Open Fretboard →" }}
			frame={{
				title: "Fretboard",
				meta: `${FRETBOARD_DEMO_SPEC.root} ${SCALE_LABELS[FRETBOARD_DEMO_SPEC.scale]}`,
			}}
			position={(p) => fretboardStage(p).position}
		>
			{(p) => {
				const s = fretboardStage(p);
				return (
					<>
						<div className="mb-3.5 flex flex-wrap items-center gap-2">
							<Pill on>Key {FRETBOARD_DEMO_SPEC.root}</Pill>
							<Pill on>{SCALE_LABELS[FRETBOARD_DEMO_SPEC.scale]}</Pill>
							<Pill on={s.chord !== null}>Chord {FRETBOARD_DEMO_CHORD_NAME}</Pill>
							<span className="flex-1" />
							<span className="max-[640px]:hidden">
								<Pill>Names</Pill>
							</span>
						</div>
						<Fretboard
							marks={s.marks}
							fromFret={FRETBOARD_DEMO_WINDOW.fromFret}
							toFret={FRETBOARD_DEMO_WINDOW.toFret}
							pressable={false}
							label={`${FRETBOARD_DEMO_SPEC.root} ${SCALE_LABELS[FRETBOARD_DEMO_SPEC.scale]} on the neck`}
						/>
						<div
							aria-hidden={!s.piano || undefined}
							className={`mt-3.5 transition-[opacity,transform] duration-300 ${
								s.piano ? "opacity-100" : "translate-y-2 opacity-0"
							}`}
						>
							<span className={`${MODULE_LABEL} mb-2`}>Diatonic chords · {FRETBOARD_DEMO_SPEC.root} minor</span>
							<PianoKeyboard
								keys={KEY_OCTAVE}
								selectedPitchClass={FRETBOARD_DEMO_KEY_CHORDS[0].rootPitchClass}
								toneMidis={s.piano ? FRETBOARD_DEMO_CHORD_MIDI : undefined}
								labelFor={chordKeyLabel}
								dimmed={keyDimmed}
								onSelect={noop}
								ariaLabel="Chord"
								className="max-w-[420px]"
							/>
						</div>
					</>
				);
			}}
		</Chapter>
	);
}
