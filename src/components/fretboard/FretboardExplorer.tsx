"use client";

/**
 * The scale + chord view: controls above, one `<Fretboard/>` below. The root
 * is picked on a 61-key piano (C2–C7) with the guitar's E2–D6 marked.
 *
 * Two modes. **Scale**: the piano picks the key's root, the neck shows the
 * scale, a chord from the picker lays its tones over it. **Chords**: the
 * piano's keys become the key's chords (I, ii, iii…); pressing one lights
 * that chord's standard voicing on the neck and sounds it, on the piano from
 * the key and on the guitar from any note of the shape. A capo follows the
 * strum page's rule: the chord names the shape, the capo raises what sounds,
 * so the neck shows the fingered chord and the piano the heard one.
 *
 * The whole 22-fret neck is always rendered; where it does not fit it scrolls
 * sideways under the fixed string-name column. Any slot sounds its note when
 * tapped, lit or not; the first press downloads the samples, and the SOUND
 * control shows that wait; the rocker turns sound off (and with it the press
 * affordance) and is remembered per device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Volume2, X } from "lucide-react";

import Fretboard, { type FretboardHandle } from "@/components/fretboard/Fretboard";
import PianoKeyboard, { type PianoKeyboardHandle } from "@/components/fretboard/PianoKeyboard";
import { useNoteSound } from "@/components/fretboard/useNoteSound";
import ChordPickerModal, { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import MusicalText from "@/components/MusicalText";
import Rocker from "@/components/ui/Rocker";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import { GUITAR_OPEN_MIDI, rootPitchClass } from "@/lib/chordVoicingToMidi";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { chordModeView, inShape, shapeSlots, type ChordModeView } from "@/lib/fretboard/chordMode";
import { keyChord, shapeMarks, shapePitches, type KeyChord } from "@/lib/fretboard/chords";
import { chordTonesFromMidi, overlayChordTones } from "@/lib/fretboard/overlay";
import {
	SCALE_LABELS,
	SCALE_ROOTS,
	SCALE_TYPES,
	createLabeler,
	scaleMarks,
	scaleRootPitchClass,
	type LabelMode,
	type ScaleType,
} from "@/lib/fretboard/scales";
import { slotsSounding, type SlotNote } from "@/lib/fretboard/positions";
import type { FretMark, FretWindow } from "@/lib/fretboard/types";
import { PIANO_61, pitchClassOf, type PianoKey, type PianoRange } from "@/lib/piano/keys";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { parseMusicalText } from "@/lib/musicalNotation";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import { chordAbbreviation } from "@/lib/strumProgressions";

/** A 22-fret neck, the common electric; acoustics simply never use the top frets. */
export const NECK: FretWindow = { fromFret: 0, toFret: 22 };

/** What the neck can sound, E2 to D6: the band drawn under the piano keys. */
export const GUITAR_RANGE: PianoRange = {
	fromMidi: GUITAR_OPEN_MIDI[0],
	toMidi: GUITAR_OPEN_MIDI[GUITAR_OPEN_MIDI.length - 1] + NECK.toFret,
};

/** Device-local memory of the SOUND rocker; absent means on. */
export const SOUND_STORAGE_KEY = "fretboardSound";

export type ExplorerMode = "scale" | "chords";

export interface FretboardExplorerProps {
	initialRoot?: string;
	initialScale?: ScaleType;
	initialMode?: ExplorerMode;
}

interface SegmentedProps<T extends string> {
	options: readonly { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	ariaLabel: string;
}

function Segmented<T extends string>({ options, value, onChange, ariaLabel }: SegmentedProps<T>) {
	return (
		<div role="radiogroup" aria-label={ariaLabel} className="flex border border-line-strong">
			{options.map((opt, i) => {
				const on = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						role="radio"
						aria-checked={on}
						onClick={() => onChange(opt.value)}
						className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-(--dur-hover) ${
							i > 0 ? "border-l border-line-strong" : ""
						} ${on ? "bg-denim text-on-denim" : "text-ink-dim hover:text-denim-accent"}`}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">{label}</span>
			{children}
		</div>
	);
}

/** "Bb" → "B♭", "b3" → "♭3": the board prints glyphs, the model keeps ASCII. */
function withGlyphs(label: string): string {
	return parseMusicalText(label)
		.map((seg) => seg.value)
		.join("");
}

/** "Em", "C#dim": a key chord the way a chart writes it. */
function chordName(chord: KeyChord): string {
	return chordAbbreviation({ root: chord.root, suffix: chord.suffix });
}

const MODES: readonly { value: ExplorerMode; label: string }[] = [
	{ value: "scale", label: "Scale" },
	{ value: "chords", label: "Chords" },
];

const LABEL_MODES: readonly { value: LabelMode; label: string }[] = [
	{ value: "note", label: "Notes" },
	{ value: "degree", label: "Degrees" },
];

const CAPO_OPTIONS = Array.from({ length: STRUM_CAPO_MAX + 1 }, (_, i) => i);

const LEGEND: readonly { emphasis: FretMark["emphasis"]; tone?: FretMark["tone"]; label: string }[] = [
	{ emphasis: "root", label: "Root" },
	{ emphasis: "chordTone", tone: "third", label: "3rd" },
	{ emphasis: "chordTone", tone: "fifth", label: "5th" },
	{ emphasis: "chordTone", tone: "seventh", label: "7th" },
	{ emphasis: "chordTone", tone: "extension", label: "9 / 11 / 13 / sus" },
	{ emphasis: "scaleTone", label: "Scale tone" },
];

/** The standard voicing of a chord, from the cache when it has it. */
async function standardVoicing(chord: KeyChord): Promise<ChordVoicing | null> {
	const cached = peekVoicings(chord.root, chord.suffix);
	return selectStandardVoicing(cached ?? (await loadVoicings(chord.root, chord.suffix)));
}

export default function FretboardExplorer({
	initialRoot = "A",
	initialScale = "minorPentatonic",
	initialMode = "scale",
}: FretboardExplorerProps) {
	const [root, setRoot] = useState(initialRoot);
	const [scale, setScale] = useState<ScaleType>(initialScale);
	const [labelMode, setLabelMode] = useState<LabelMode>("note");
	const [mode, setMode] = useState<ExplorerMode>(initialMode);
	const [capo, setCapo] = useState(0);
	const [chord, setChord] = useState<ConfirmedChord | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	/** Chords mode: the sounding pitch class of the chosen chord; the tonic until a key is pressed. */
	const [chordPc, setChordPc] = useState<number | null>(null);
	/** Chords mode: the fingered chord's voicing, or null while loading / when the library has none. */
	const [voicing, setVoicing] = useState<{ chord: KeyChord; voicing: ChordVoicing | null } | null>(null);
	// Default on; the stored choice is applied after mount so the server and
	// the first client render agree, then every change is written back.
	const [soundOn, setSoundOn] = useState(true);
	const [soundRestored, setSoundRestored] = useState(false);
	const { play, playChord, isLoading: soundLoading } = useNoteSound();

	useEffect(() => {
		const stored = localStorage.getItem(SOUND_STORAGE_KEY);
		queueMicrotask(() => {
			if (stored === "off") setSoundOn(false);
			setSoundRestored(true);
		});
	}, []);

	useEffect(() => {
		if (!soundRestored) return;
		localStorage.setItem(SOUND_STORAGE_KEY, soundOn ? "on" : "off");
	}, [soundOn, soundRestored]);

	const spec = useMemo(() => ({ root, scale }), [root, scale]);
	const inChords = mode === "chords";

	/** The key's chord on each pitch class, for the piano's labels and dimming. */
	const chordsByPc = useMemo(() => Array.from({ length: 12 }, (_, pc) => keyChord(spec, pc)), [spec]);

	const view = useMemo<ChordModeView | null>(
		() => (inChords ? chordModeView(spec, capo, chordPc ?? scaleRootPitchClass(root)) : null),
		[inChords, spec, capo, chordPc, root],
	);

	// The fingered chord's standard voicing, fetched when it changes. A stale
	// answer (the chord moved on while it loaded) is dropped.
	useEffect(() => {
		if (!view) return;
		const target = view.shape;
		let live = true;
		void standardVoicing(target)
			.catch(() => null)
			.then((v) => {
				if (live) setVoicing({ chord: target, voicing: v });
			});
		return () => {
			live = false;
		};
	}, [view]);
	const shapeVoicing = view && voicing?.chord.root === view.shape.root && voicing.chord.suffix === view.shape.suffix ? voicing.voicing : null;

	const marks = useMemo<FretMark[]>(() => {
		const label = createLabeler(spec, labelMode);
		let raw: FretMark[];
		if (view) {
			raw = shapeVoicing ? shapeMarks(shapeVoicing, capo, view.shape.rootPitchClass, label) : [];
		} else {
			const base = scaleMarks(spec, NECK, labelMode);
			raw = chord
				? overlayChordTones(base, chordTonesFromMidi(chord.pitches, rootPitchClass(chord.root)), spec, NECK, labelMode)
				: base;
		}
		return raw.map((m) => ({ ...m, label: withGlyphs(m.label) }));
	}, [spec, labelMode, chord, view, shapeVoicing, capo]);

	// The piano follows the neck: hover rings the key, a press strikes it.
	// Both go through the keyboard's imperative handle, never through state.
	const piano = useRef<PianoKeyboardHandle>(null);
	const fretboard = useRef<FretboardHandle>(null);
	const handleSlotHover = useCallback((slot: SlotNote | null) => piano.current?.highlight(slot?.midi ?? null), []);

	/** Sound the current shape in a voice and animate it on both instruments. */
	const soundShape = useCallback(
		(v: ChordVoicing, voice: "guitar" | "piano") => {
			const pitches = shapePitches(v, capo);
			for (const midi of pitches) piano.current?.strike(midi);
			fretboard.current?.strike(shapeSlots(shapeMarks(v, capo, 0, () => "")));
			void playChord(pitches, voice).catch(() => undefined);
		},
		[capo, playChord],
	);

	// A press that cannot sound (samples still failing to load) is just silent.
	// In Chords mode a note of the shape strums the whole shape on the guitar.
	const handleSlotPress = useCallback(
		(slot: SlotNote) => {
			if (view && shapeVoicing && inShape(marks, slot)) {
				soundShape(shapeVoicing, "guitar");
				return;
			}
			piano.current?.strike(slot.midi);
			void play(slot.midi).catch(() => undefined);
		},
		[view, shapeVoicing, marks, soundShape, play],
	);

	// Scale mode: a piano key picks the root by pitch class and, with sound
	// on, plays the key itself in the piano voice; every position of that
	// pitch on the neck ripples. Chords mode: the key picks the chord on that
	// degree and, with sound on, plays its voicing on the piano once the
	// voicing is known.
	const handleKeySelect = useCallback(
		(midi: number) => {
			const pc = pitchClassOf(midi);
			if (!inChords) {
				setRoot(SCALE_ROOTS[pc]);
				if (soundOn) {
					piano.current?.strike(midi);
					fretboard.current?.strike(slotsSounding(midi, NECK));
					void play(midi, "piano").catch(() => undefined);
				}
				return;
			}
			setChordPc(pc);
			if (!soundOn) return;
			const next = chordModeView(spec, capo, pc);
			void standardVoicing(next.shape)
				.catch(() => null)
				.then((v) => {
					// The marks land on the next frame; strike after them so lit notes pulse.
					if (v) requestAnimationFrame(() => soundShape(v, "piano"));
				});
		},
		[inChords, soundOn, play, spec, capo, soundShape],
	);

	const keyLabel = useCallback(
		(key: PianoKey, selected: boolean) => {
			const c = chordsByPc[key.pitchClass];
			return c.diatonic || selected ? c.numeral : "";
		},
		[chordsByPc],
	);
	const keyDimmed = useCallback((key: PianoKey) => !chordsByPc[key.pitchClass].diatonic, [chordsByPc]);

	const boardLabel = view
		? `${chordName(view.shape)} shape on the fretboard`
		: `${root} ${SCALE_LABELS[scale]} on the fretboard`;

	return (
		<div className="flex flex-col gap-4">
			{/* Controls */}
			<div className="flex flex-col gap-3 border border-line bg-panel p-3">
				<Field
					label={inChords ? `Chords · key of ${withGlyphs(root)} ${SCALE_LABELS[scale].toLowerCase()}` : "Root"}
				>
					<PianoKeyboard
						ref={piano}
						keys={PIANO_61}
						selectedPitchClass={view ? view.sounding.rootPitchClass : scaleRootPitchClass(root)}
						tonePitchClasses={view?.sounding.pitchClasses}
						range={GUITAR_RANGE}
						onSelect={handleKeySelect}
						labelFor={inChords ? keyLabel : undefined}
						dimmed={inChords ? keyDimmed : undefined}
						ariaLabel={inChords ? "Chord" : "Scale root"}
					/>
				</Field>

				<div className="flex flex-wrap items-end gap-3">
					<Field label="Mode">
						<Segmented options={MODES} value={mode} onChange={setMode} ariaLabel="Mode" />
					</Field>

					<label className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Scale</span>
						<select
							value={scale}
							onChange={(e) => setScale(e.target.value as ScaleType)}
							className="border border-line-strong bg-surface px-2 py-1.5 font-mono text-[12px] text-ink"
						>
							{SCALE_TYPES.map((t) => (
								<option key={t} value={t}>
									{SCALE_LABELS[t]}
								</option>
							))}
						</select>
					</label>

					<Field label="Labels">
						<Segmented options={LABEL_MODES} value={labelMode} onChange={setLabelMode} ariaLabel="Label mode" />
					</Field>

					<label className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Capo</span>
						<select
							value={capo}
							onChange={(e) => setCapo(Number(e.target.value))}
							className="border border-line-strong bg-surface px-2 py-1.5 font-mono text-[12px] text-ink"
						>
							{CAPO_OPTIONS.map((fret) => (
								<option key={fret} value={fret}>
									{fret === 0 ? "None" : `Fret ${fret}`}
								</option>
							))}
						</select>
					</label>

					<Field label="Chord">
						{view ? (
							<div
								className="flex h-[30px] items-center gap-2 border border-line-strong px-3 font-mono text-[12px] text-ink"
								data-testid="chord-readout"
							>
								<MusicalText text={chordName(view.sounding)} />
								<span className="text-denim-accent">{view.sounding.numeral}</span>
								{capo > 0 && (
									<span className="text-ink-dim">
										· <MusicalText text={chordName(view.shape)} /> shape
									</span>
								)}
								{shapeVoicing === null && voicing?.chord === view.shape && (
									<span className="text-ink-faint">· no voicing</span>
								)}
							</div>
						) : (
							<div className="flex border border-line-strong">
								<button
									type="button"
									onClick={() => setPickerOpen(true)}
									className={`px-3 py-1.5 font-mono text-[12px] transition-colors duration-(--dur-hover) hover:bg-denim-tint ${
										chord ? "text-ink" : "text-ink-dim"
									}`}
								>
									{chord ? <MusicalText text={`${chord.root}${chord.suffix}`} /> : "None"}
								</button>
								{chord && (
									<button
										type="button"
										aria-label="Clear chord"
										onClick={() => setChord(null)}
										className="border-l border-line-strong px-2 text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent"
									>
										<X className="size-3.5" strokeWidth={1.5} strokeLinecap="square" />
									</button>
								)}
							</div>
						)}
					</Field>

					<Field label={soundLoading ? "Loading sound…" : "Sound"}>
						<span className="flex h-[30px] items-center gap-2">
							{soundLoading ? (
								<LoaderCircle className="size-3.5 shrink-0 animate-spin text-denim-accent" strokeWidth={1.5} />
							) : (
								<Volume2 className="size-3.5 shrink-0 text-ink-dim" strokeWidth={1.5} />
							)}
							<Rocker checked={soundOn} onChange={setSoundOn} loading={soundLoading} ariaLabel="Sound" />
						</span>
					</Field>
				</div>
			</div>

			{/* The board */}
			<div className="select-none border border-line bg-surface p-3 sm:p-4">
				<Fretboard
					ref={fretboard}
					marks={marks}
					fromFret={NECK.fromFret}
					toFret={NECK.toFret}
					capo={capo}
					label={boardLabel}
					onSlotPress={handleSlotPress}
					onSlotHover={handleSlotHover}
					pressable={soundOn}
				/>
				<ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-hidden="true">
					{LEGEND.map(({ emphasis, tone, label }) => (
						<li key={label} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim">
							<svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
								<g className="fb-mark" data-emphasis={emphasis} data-tone={tone}>
									<circle className="fb-ring" cx="9" cy="9" r="8" />
									<circle className="fb-dot" cx="9" cy="9" r="5.5" strokeWidth={1.25} />
								</g>
							</svg>
							{label}
						</li>
					))}
				</ul>
			</div>

			<ChordPickerModal
				open={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onConfirm={(picked) => {
					setChord(picked);
					setPickerOpen(false);
				}}
				initialChord={chord ? { root: chord.root, suffix: chord.suffix } : null}
			/>
		</div>
	);
}
