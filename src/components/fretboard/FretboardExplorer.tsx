"use client";

/**
 * The fretboard page (#363 step 11, Candy): the instruments are the page, the settings
 * are one panel beside them.
 *
 * Layout. The stage holds, top to bottom: what is showing (the key and its step formula,
 * and in Chords mode the chord), the **piano**, the **neck** and the **circle of fifths**.
 * The piano and the circle can each be put away and brought back (`panels`, kept per
 * device); the neck cannot. The panel, a card of its own, holds what the instruments show
 * and what to do with them — key, scale, mode, the mode's tools (in Chords mode the
 * chord, the **progression** and the hand position), display and sound — beside the stage
 * from 960px, and in a sheet opened from the dock below that.
 *
 * Scale mode: the neck shows the scale across the neck, the piano tints its pitch
 * classes, and pressing anything sounds that note. Chords mode: the piano's keys become
 * the key's chords, pressing one lights that chord's shape on the neck and sounds it;
 * pressing a note of the shape strums the shape. The octave of the key picks the shape: a
 * guitar changes register by changing position, so a low key holds the open shape and a
 * high one the barre up the neck. The panel's chord chips and the circle's wedge pick the
 * same chords, in the standard shape.
 *
 * The chord is held as **semitones above the key's root**, not as a pitch class, so
 * changing key or scale keeps the degree and transposes the chord with it — that is what
 * makes numerals worth showing.
 *
 * The readout is two search fields, "D · C shape": the chord heard and, with a capo, the
 * shape that holds it. Either can be typed into — a name or a grip — and the other side
 * follows at the capo's distance. Pressing a key or a numeral fills both. Clearing returns
 * to the degree.
 *
 * Chords mode also carries a **progression**: a strip of bars, each held as an interval
 * like the picked chord, looped one strum per bar. And a **hand position**: a right-press
 * raises a five-fret frame on the neck and the panel lists the key's chords with a shape
 * inside it — pressing one lights that shape, and the frame's play button walks them once
 * through.
 *
 * A capo follows the strum page's rule: a chord names the shape the player holds, so the
 * neck shows the fingered chord and the piano the heard one. It also shortens the neck:
 * nothing behind the capo can be played, so the scale's marks start at the capo fret,
 * which becomes the new open string. Marks above it keep the pitch they had.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Guitar, Piano, Play, SlidersHorizontal, Square } from "lucide-react";
import { toast } from "sonner";

import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import CircleOfFifths from "@/components/fretboard/CircleOfFifths";
import Fretboard, { type FretboardHandle } from "@/components/fretboard/Fretboard";
import PianoKeyboard, { type PianoKeyboardHandle } from "@/components/fretboard/PianoKeyboard";
import { useNoteSound, type NoteVoice } from "@/components/fretboard/useNoteSound";
import { useSequencePlayer } from "@/components/fretboard/useSequencePlayer";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import {
	CardHead,
	CardToggle,
	ChoiceChip,
	NeckLegend,
	ScaleSteps,
	StripBar,
	ToneList,
	TuningPicker,
	type LegendItem,
} from "@/components/fretboard/parts";
import MusicalText from "@/components/MusicalText";
import { Button, PlayPick } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { chordModeView, inShape, shapeSlots } from "@/lib/fretboard/chordMode";
import { keyChord, keyChords, shapeMarks, shapePitches, type KeyChord } from "@/lib/fretboard/chords";
import { circlePitchClass, keyFromCircle, keyIndex } from "@/lib/fretboard/circleOfFifths";
import {
	heldChordView,
	shownFromKeyChords,
	transposeChord,
	type HeldChord,
	type ShownChord,
} from "@/lib/fretboard/heldChord";
import { DEFAULT_PANELS, PANELS_STORAGE_KEY, parsePanels, type FretboardPanels } from "@/lib/fretboard/panels";
import {
	TUNING_LABELS,
	TUNING_OFFSET,
	TUNING_STORAGE_KEY,
	parseTuning,
	stringNames,
	type Tuning,
} from "@/lib/fretboard/tuning";
import {
	SCALE_LABELS,
	SCALE_ROOTS,
	SCALE_TYPES,
	createLabeler,
	degreeLabel,
	scaleMarks,
	scalePitchClasses,
	scaleRootPitchClass,
	type LabelMode,
	type ScaleType,
} from "@/lib/fretboard/scales";
import { slotsSounding, type SlotNote } from "@/lib/fretboard/positions";
import { MIN_REACHABLE, reachableChords, type ReachableChord } from "@/lib/fretboard/reachable";
import {
	MAX_BARS,
	PROGRESSION_BPM,
	PROGRESSION_PRESETS,
	appendStep,
	barSeconds,
	presetSteps,
	progressionSteps,
	removeStep,
	resolveProgression,
	type ProgressionStep,
	type ResolvedBar,
} from "@/lib/fretboard/progression";
import { BOX_FRETS, noteSpacingSeconds, scalePositions, scaleRun, type RunTarget } from "@/lib/fretboard/scaleRun";
import { noteSteps, type SequenceStep } from "@/lib/fretboard/sequence";
import type { FretMark, FretWindow } from "@/lib/fretboard/types";
import { PIANO_61, pitchClassOf, type PianoKey, type PianoRange } from "@/lib/piano/keys";
import { selectStandardVoicing } from "@/lib/selectStandardVoicing";
import { parseMusicalText } from "@/lib/musicalNotation";
import { voicingNearest } from "@/lib/fretboard/voicingRegister";
import { STRUM_CAPO_MAX, type ChordRef } from "@/lib/strumPatterns";
import { hasCoarsePointer } from "@/lib/pointer";
import { chordAbbreviation } from "@/lib/strumProgressions";

/** A 22-fret neck, the common electric; acoustics simply never use the top frets. */
export const NECK: FretWindow = { fromFret: 0, toFret: 22 };

/** What the neck can sound, E2 to D6: the band drawn under the piano keys. */
export const GUITAR_RANGE: PianoRange = {
	fromMidi: GUITAR_OPEN_MIDI[0],
	toMidi: GUITAR_OPEN_MIDI[GUITAR_OPEN_MIDI.length - 1] + NECK.toFret,
};

/** Device-local memory of the Sound switch; absent means on. */
export const SOUND_STORAGE_KEY = "fretboardSound";

export type ExplorerMode = "scale" | "chords";

export interface FretboardExplorerProps {
	initialRoot?: string;
	initialScale?: ScaleType;
	initialMode?: ExplorerMode;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** "Bb" → "B♭", "b3" → "♭3": the board prints glyphs, the model keeps ASCII. */
function withGlyphs(label: string): string {
	return parseMusicalText(label)
		.map((seg) => seg.value)
		.join("");
}

/** A chord by the library's spelling, whatever else it carries. */
type Named = { root: string; suffix: string };

/** The voicing library's key for a chord. */
const chordKey = (c: Named): string => `${c.root} ${c.suffix}`;
const sameChord = (a: Named, b: Named): boolean => a.root === b.root && a.suffix === b.suffix;

/** "Em", "C#dim", "Am7": a chord the way a chart writes it. */
function chordName(chord: Named): string {
	return chordAbbreviation({ root: chord.root, suffix: chord.suffix });
}

const MODES: readonly { value: ExplorerMode; label: string }[] = [
	{ value: "scale", label: "Scale" },
	{ value: "chords", label: "Chords" },
];

/** Off is a display choice like the other two, so it lives in the same control. */
type LabelChoice = LabelMode | "none";

const LABEL_MODES: readonly { value: LabelChoice; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "note", label: "Notes" },
	{ value: "degree", label: "Degrees" },
];

/** ₀…₉, for an octave written small after a numeral. */
const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** Where a capo lands when it is switched on: the first fret, then drag it. */
const DEFAULT_CAPO = 1;

/** Slow enough to learn a shape, fast enough to hear it as a line. */
const DEFAULT_BPM = 90;
/** A run's fixed tempo and voice, now that neither has a control. */
const RUN_BPM = DEFAULT_BPM;
const RUN_VOICE: NoteVoice = "guitar";
/** A tempo held still this long restarts a playing strip at it, so a held step button restarts once. */
const TEMPO_SETTLE_MS = 350;

const LEGEND: readonly (LegendItem & { mode: ExplorerMode | "both" })[] = [
	{ emphasis: "root", label: "Root", mode: "both" },
	{ emphasis: "chordTone", tone: "third", label: "3rd", mode: "chords" },
	{ emphasis: "chordTone", tone: "fifth", label: "5th", mode: "chords" },
	{ emphasis: "chordTone", tone: "seventh", label: "7th", mode: "chords" },
	{ emphasis: "chordTone", tone: "extension", label: "9 / 11 / 13 / sus", mode: "chords" },
	{ emphasis: "scaleTone", label: "Scale tone", mode: "scale" },
];

/** One of a chord's voicings, chosen by `pick` from the cache when it has them. */
async function chordVoicing(
	chord: Named,
	pick: (list: ChordVoicing[]) => ChordVoicing | null,
): Promise<ChordVoicing | null> {
	const cached = peekVoicings(chord.root, chord.suffix);
	return pick(cached ?? (await loadVoicings(chord.root, chord.suffix)));
}
/** Every voicing the library has for a chord, from the cache when it has them. */
const allVoicings = async (chord: Named): Promise<ChordVoicing[]> =>
	peekVoicings(chord.root, chord.suffix) ?? (await loadVoicings(chord.root, chord.suffix));
/** The voicing with this id, else the standard one: a grip that was written, if it was. */
const byId =
	(id: string | null) =>
	(list: ChordVoicing[]): ChordVoicing | null =>
		(id ? list.find((v) => v.id === id) : undefined) ?? selectStandardVoicing(list);

export default function FretboardExplorer({
	initialRoot = "C",
	initialScale = "major",
	initialMode = "scale",
}: FretboardExplorerProps) {
	const [root, setRoot] = useState(initialRoot);
	const [scale, setScale] = useState<ScaleType>(initialScale);
	const [labelChoice, setLabelChoice] = useState<LabelChoice>("note");
	const [mode, setMode] = useState<ExplorerMode>(initialMode);
	const [capo, setCapo] = useState(0);
	/** The whole guitar tuned down (#396): restored after mount, like the sound switch. */
	const [tuning, setTuning] = useState<Tuning>("standard");
	const [tuningRestored, setTuningRestored] = useState(false);
	/** Semitones every string sits from standard: a capo below the nut. */
	const tune = TUNING_OFFSET[tuning];
	/**
	 * What the capo and the tuning do to pitch together: a shape held sounds this many
	 * semitones from where it would in standard tuning without a capo. Pitch reads through
	 * this; where a shape sits on the neck reads through the capo alone.
	 */
	const shift = capo + tune;
	/** Scale mode: what a run plays — the whole neck, a hand position, or one string. */
	const [runChoice, setRunChoice] = useState("neck");
	/** Chords mode: semitones above the key's root; 0 (the tonic) until a key is pressed. */
	const [chordInterval, setChordInterval] = useState(0);
	/** Chords mode: the fingered chord's voicing, or null while loading / when the library has none. */
	const [voicing, setVoicing] = useState<{ chord: Named; voicing: ChordVoicing | null } | null>(null);
	/** Chords mode: a shape named or written in the Shape field, shown in place of the degree. */
	const [held, setHeld] = useState<HeldChord | null>(null);
	/** Chords mode: the key that picked the degree, whose octave picks the shape; null takes the standard one. */
	const [chordKeyMidi, setChordKeyMidi] = useState<number | null>(null);
	/** The chord library's names, for the Shape field; loaded on entering Chords mode. */
	const [chordIndex, setChordIndex] = useState<ChordIndexEntry[]>([]);
	/** Chords mode: the strip, as intervals above the key's root. Session-only. */
	const [progression, setProgression] = useState<ProgressionStep[]>([]);
	const [progressionBpm, setProgressionBpm] = useState<number>(PROGRESSION_BPM.default);
	/** What is sounding, resolved when play began: the strip, or a position's chords. Null between runs. */
	const [playing, setPlaying] = useState<{ bars: ResolvedBar[]; source: "strip" | "position" } | null>(null);
	/** Chords mode: the hand position raised by a right-press, on the fingered neck. */
	const [chordBox, setChordBox] = useState<FretWindow | null>(null);
	/** Chords mode: a shape picked from the position's list; stands in for the standard one while the chord matches. */
	const [pinned, setPinned] = useState<ReachableChord | null>(null);
	/** Every shape of the fingered key's seven chords, loaded once a position is raised. */
	const [keyVoicings, setKeyVoicings] = useState<{ key: string; table: Map<string, ChordVoicing[]> } | null>(null);
	/** Identifies the latest press of play, so a strip that changed while its shapes loaded is not played. */
	const playToken = useRef(0);
	// Default on; the stored choice is applied after mount so the server and
	// the first client render agree, then every change is written back.
	const [soundOn, setSoundOn] = useState(true);
	const [soundRestored, setSoundRestored] = useState(false);
	const { play, playChord, isLoading: soundLoading, volumes, setVolume, prepare, bus } = useNoteSound();

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

	useEffect(() => {
		const stored = localStorage.getItem(TUNING_STORAGE_KEY);
		queueMicrotask(() => {
			setTuning(parseTuning(stored));
			setTuningRestored(true);
		});
	}, []);
	useEffect(() => {
		if (!tuningRestored) return;
		localStorage.setItem(TUNING_STORAGE_KEY, tuning);
	}, [tuning, tuningRestored]);
	/** The open strings' names in this tuning, and the band of what the neck sounds under the piano. */
	const strings = useMemo(() => stringNames(tuning).map(withGlyphs), [tuning]);
	const range = useMemo<PianoRange>(
		() => ({ fromMidi: GUITAR_RANGE.fromMidi + tune, toMidi: GUITAR_RANGE.toMidi + tune }),
		[tune],
	);

	// The first press downloads a voice's samples, which takes seconds on a
	// cold cache. Say so, and take it back when the wait is over, so a silent
	// board is never a mystery.
	useEffect(() => {
		if (!soundLoading) return;
		const id = toast.loading("Loading instrument sounds…");
		return () => {
			toast.dismiss(id);
		};
	}, [soundLoading]);

	const spec = useMemo(() => ({ root, scale }), [root, scale]);
	const inChords = mode === "chords";
	const rootPc = scaleRootPitchClass(root);
	const scalePcs = useMemo(() => scalePitchClasses(spec), [spec]);

	// The piano follows the neck: hover rings the key, a press strikes it.
	// Both go through the keyboard's imperative handle, never through state.
	const piano = useRef<PianoKeyboardHandle>(null);
	const fretboard = useRef<FretboardHandle>(null);

	// Each step of a run lights on both instruments as it sounds. The strike
	// waits a frame so that a chord's marks, which land with the same step,
	// are lit before they pulse.
	// The box a run plays in, for the follow. On a phone a run inside a box
	// is never followed — the neck swung on every note whatever the box's
	// width — and on a wider screen only while the box fits the viewport.
	const runWithinRef = useRef<{ fromFret: number; toFret: number } | null>(null);
	const handleRunStep = useCallback((step: SequenceStep) => {
		const first = step.slots[0];
		const within = runWithinRef.current;
		if (first && !(within && hasCoarsePointer())) fretboard.current?.revealFret(first.fret, within ?? undefined);
		requestAnimationFrame(() => {
			fretboard.current?.strike(step.slots);
			for (const midi of step.midis) piano.current?.strike(midi);
		});
	}, []);
	const player = useSequencePlayer({ audio: bus, onStep: handleRunStep });
	const { stop: stopRun } = player;

	/** While the strip plays, the bar sounding now stands in for the chord picked on the piano. */
	const playingBar =
		playing && player.isPlaying && player.currentIndex >= 0 ? (playing.bars[player.currentIndex] ?? null) : null;

	// What the mode shows, by name: the sounding bar, else the held shape,
	// else the degree. A held shape's numeral waits for its voicing (below),
	// since only the notes it sounds can say whether it is the key's.
	const named = useMemo<ShownChord | null>(() => {
		if (!inChords) return null;
		if (playingBar) return shownFromKeyChords(playingBar.sounding, playingBar.shape);
		if (held) return heldChordView(held, spec, shift, null);
		const { sounding, shape } = chordModeView(spec, shift, rootPc + chordInterval);
		return shownFromKeyChords(sounding, shape);
	}, [inChords, playingBar, held, spec, shift, rootPc, chordInterval]);

	// The fingered chord's voicing, fetched when it changes: the grip that was
	// written, else the standard one. A stale answer (the chord moved on while
	// it loaded) is dropped.
	useEffect(() => {
		if (!named) return;
		const target = named.shape;
		let live = true;
		// The grip written for this chord; else the shape nearest the key that
		// picked it; else the standard one.
		const pick =
			held && sameChord(held, target)
				? byId(held.voicingId)
				: !held && chordKeyMidi !== null
					? (list: ChordVoicing[]) => voicingNearest(list, chordKeyMidi, shift)
					: selectStandardVoicing;
		void chordVoicing(target, pick)
			.catch(() => null)
			.then((v) => {
				if (live) setVoicing({ chord: target, voicing: v });
			});
		return () => {
			live = false;
		};
	}, [named, held, chordKeyMidi, shift]);
	// A sounding bar brings its own voicing, resolved before play began; a
	// shape picked from a position stands in while it is that chord's.
	const shapeVoicing = playingBar
		? playingBar.voicing
		: named && pinned && sameChord(pinned.chord, named.shape)
			? pinned.voicing
			: named && voicing && sameChord(voicing.chord, named.shape)
				? voicing.voicing
				: null;
	/** The chord on show, its numeral settled: a held shape is judged by the notes its voicing sounds. */
	const shown = useMemo<ShownChord | null>(() => {
		if (!named || !held || playingBar || !shapeVoicing) return named;
		return heldChordView(held, spec, shift, shapePitches(shapeVoicing, shift).map(mod12));
	}, [named, held, playingBar, shapeVoicing, spec, shift]);

	// Behind a capo there is no neck left to play, so the scale starts at the
	// capo fret; the pitches above it are what they always were.
	const playable = useMemo<FretWindow>(() => ({ fromFret: capo, toFret: NECK.toFret }), [capo]);

	const noteName = useMemo(() => createLabeler(spec, "note"), [spec]);
	const labelMode: LabelMode = labelChoice === "degree" ? "degree" : "note";
	const showLabels = labelChoice !== "none";

	const marks = useMemo<FretMark[]>(() => {
		const label = createLabeler(spec, labelMode);
		let raw: FretMark[];
		if (shown) {
			// The marks sit where the shape is held; each names what it sounds.
			raw = shapeVoicing
				? shapeMarks(shapeVoicing, capo, shown.shape.rootPitchClass, (pc) => label(pc + tune))
				: [];
		} else {
			raw = scaleMarks(spec, playable, labelMode, tune);
		}
		return raw.map((m) => ({ ...m, label: showLabels ? withGlyphs(m.label) : "" }));
	}, [spec, labelMode, showLabels, shown, shapeVoicing, capo, tune, playable]);

	// ── Playing the scale ─────────────────────────────────────────────────────
	const boxes = useMemo(
		() => (inChords ? [] : scalePositions(spec, playable, tune)),
		[inChords, spec, playable, tune],
	);
	const targetFor = useCallback(
		(choice: string): RunTarget => {
			const [kind, index] = choice.split(":");
			if (kind === "box") return { kind: "box", box: boxes[Number(index)] ?? playable };
			if (kind === "pick") {
				const [from, to] = index.split("-").map(Number);
				return { kind: "box", box: { fromFret: from, toFret: to } };
			}
			if (kind === "string") return { kind: "string", string: Number(index) };
			return { kind: "neck" };
		},
		[boxes, playable],
	);
	const runTarget = useMemo(() => targetFor(runChoice), [targetFor, runChoice]);
	const runNotes = useMemo(
		() => (inChords ? [] : scaleRun(spec, playable, runTarget, tune)),
		[inChords, spec, playable, runTarget, tune],
	);
	/**
	 * The box outlined on the neck: whichever tag the pointer is over, else the
	 * one a run would play, so hovering previews without committing.
	 */
	const runBox = inChords ? null : runTarget.kind === "box" ? runTarget.box : null;
	const runWithin = inChords ? chordBox : runBox;
	useEffect(() => {
		runWithinRef.current = runWithin;
	}, [runWithin]);

	/**
	 * The chord as it actually sounds: every note of the shape, low to high,
	 * named with its octave and with which degree of the chord it is. Without a
	 * voicing there is only the triad to show, so its three tones stand in.
	 */
	const chordTones = useMemo(() => {
		if (!shown) return [];
		const root = shown.sounding.rootPitchClass;
		const describe = (midi: number, withOctave: boolean) => ({
			name: `${noteName(((midi % 12) + 12) % 12)}${withOctave ? Math.floor(midi / 12) - 1 : ""}`,
			degree: degreeLabel(midi - root),
		});
		if (shapeVoicing) return shapePitches(shapeVoicing, shift).map((midi) => describe(midi, true));
		return (shown.triad ?? []).map((pc) => describe(pc, false));
	}, [shown, shapeVoicing, shift, noteName]);

	/** The string whose run is sounding, so its button can offer to stop it. */
	const playingString = player.isPlaying && runTarget.kind === "string" ? runTarget.string : null;

	/** End whatever is sounding, a run or the strip. */
	const stopPlayback = useCallback(() => {
		playToken.current++;
		setPlaying(null);
		stopRun();
	}, [stopRun]);
	// A run or a progression describes the key it started in; changing any of
	// that ends it, as does editing the strip under it.
	useEffect(() => stopPlayback, [stopPlayback, root, scale, capo, tuning, mode, soundOn, progression]);

	/** Load whatever the run needs, then play it. */
	const startRun = useCallback(
		(notes: readonly SlotNote[]) => {
			if (!soundOn || notes.length === 0) return;
			void prepare(RUN_VOICE)
				.then((ready) => {
					if (ready) player.play(noteSteps(notes), noteSpacingSeconds(RUN_BPM, "eighth"), RUN_VOICE);
				})
				.catch(() => undefined);
		},
		[soundOn, prepare, player],
	);

	// ── Playing the strip ─────────────────────────────────────────────────────
	const progressionPlaying = playing?.source === "strip" && player.isPlaying;
	/** The strip's bars named through the key, for the chips; no voicing needed to name them. */
	const stripBars = useMemo(
		() => (inChords ? resolveProgression(progression, spec, capo, () => null, tune) : []),
		[inChords, progression, spec, capo, tune],
	);

	/**
	 * Load every shape the strip needs, then loop it. With a position raised,
	 * each bar takes the shape inside it when the library has one there, and
	 * the standard shape when it does not — the strip stays under the hand as
	 * far as it can. A strip, key or capo that changed while the shapes loaded
	 * has stopped this press already, so its bars are dropped rather than
	 * played over the new state.
	 */
	const startProgression = useCallback(() => {
		if (!soundOn || progression.length === 0) return;
		const token = ++playToken.current;
		const shapes = new Map<string, KeyChord>();
		for (const bar of resolveProgression(progression, spec, capo, () => null, tune)) shapes.set(chordKey(bar.shape), bar.shape);
		const table = new Map<string, ChordVoicing | null>();
		void Promise.all(
			[...shapes].map(async ([key, shape]) => {
				const list = await allVoicings(shape).catch(() => null);
				const inBox = list && chordBox ? reachableChords([shape], () => list, chordBox, capo)[0]?.voicing : undefined;
				table.set(key, inBox ?? (list ? selectStandardVoicing(list) : null));
			}),
		)
			.then(() => prepare(RUN_VOICE))
			.then((ready) => {
				if (!ready || token !== playToken.current) return;
				const bars = resolveProgression(progression, spec, capo, (c) => table.get(chordKey(c)) ?? null, tune);
				setPlaying({ bars, source: "strip" });
				player.play(progressionSteps(bars), barSeconds(progressionBpm), RUN_VOICE, { loop: true });
			})
			.catch(() => undefined);
	}, [soundOn, progression, spec, capo, tune, prepare, player, progressionBpm, chordBox]);

	/** A new tempo while the strip plays restarts it at that tempo; between runs it just waits. */
	const applyTempo = useCallback(
		(bpm: number) => {
			if (playing?.source !== "strip" || !player.isPlaying) return;
			player.play(progressionSteps(playing.bars), barSeconds(bpm), RUN_VOICE, { loop: true });
		},
		[playing, player],
	);
	// Stepping restarts once the tempo settles, rather than on every step of a held button.
	const tempoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (tempoTimer.current) clearTimeout(tempoTimer.current);
		},
		[],
	);
	const handleTempo = useCallback(
		(bpm: number) => {
			setProgressionBpm(bpm);
			if (tempoTimer.current) clearTimeout(tempoTimer.current);
			tempoTimer.current = setTimeout(() => {
				tempoTimer.current = null;
				applyTempo(bpm);
			}, TEMPO_SETTLE_MS);
		},
		[applyTempo],
	);

	/** Selecting a run from the board plays it straight away — that is the gesture. */
	const runChoiceSelected = useCallback(
		(choice: string) => {
			setRunChoice(choice);
			startRun(scaleRun(spec, playable, targetFor(choice), tune));
		},
		[startRun, spec, playable, targetFor, tune],
	);
	const handleSlotHover = useCallback(
		(slot: SlotNote | null) => piano.current?.highlight(slot ? slot.midi + tune : null),
		[tune],
	);

	/**
	 * Sound the current shape in a voice and animate it on both instruments.
	 * Whichever instrument was not pressed scrolls to show what it is doing:
	 * on a phone the neck and the keyboard are both wider than the screen.
	 */
	const soundShape = useCallback(
		(v: ChordVoicing, voice: "guitar" | "piano") => {
			const pitches = shapePitches(v, shift);
			const slots = shapeSlots(shapeMarks(v, capo, 0, () => ""));
			for (const midi of pitches) piano.current?.strike(midi);
			fretboard.current?.strike(slots);
			if (pitches.length > 0) piano.current?.reveal(Math.min(...pitches));
			const lowest = slots.reduce<number | null>((low, s) => (low === null || s.fret < low ? s.fret : low), null);
			if (lowest !== null) fretboard.current?.revealFret(lowest);
			void playChord(pitches, voice).catch(() => undefined);
		},
		[capo, shift, playChord],
	);

	// A press that cannot sound (samples still failing to load) is just silent.
	// In Chords mode a note of the shape strums the whole shape on the guitar.
	const handleSlotPress = useCallback(
		(slot: SlotNote) => {
			if (shown && shapeVoicing && inShape(marks, slot)) {
				soundShape(shapeVoicing, "guitar");
				return;
			}
			// The board reports a slot's pitch in standard tuning; the tuning moves what sounds.
			const midi = slot.midi + tune;
			piano.current?.strike(midi);
			piano.current?.reveal(midi);
			void play(midi).catch(() => undefined);
		},
		[shown, shapeVoicing, marks, soundShape, play, tune],
	);

	// Scale mode: a piano key sounds its note and ripples every position of
	// that pitch on the neck — the keyboard is a display, not the key picker.
	// Chords mode: the key chooses the chord on that degree and plays its
	// voicing once the voicing is known.
	const handleKeySelect = useCallback(
		(midi: number) => {
			const pc = pitchClassOf(midi);
			if (!inChords) {
				if (!soundOn) return;
				piano.current?.strike(midi);
				const sounding = slotsSounding(midi, NECK, tune);
				fretboard.current?.strike(sounding);
				// The neck follows the key: the lowest position that sounds it.
				const lowest = sounding.reduce<number | null>((low, s) => (low === null || s.fret < low ? s.fret : low), null);
				if (lowest !== null) fretboard.current?.revealFret(lowest);
				void play(midi, "piano").catch(() => undefined);
				return;
			}
			const interval = mod12(pc - rootPc);
			setChordInterval(interval);
			setChordKeyMidi(midi);
			setPinned(null);
			setHeld(null);
			if (!soundOn) return;
			const next = chordModeView(spec, shift, rootPc + interval);
			void chordVoicing(next.shape, (list) => voicingNearest(list, midi, shift))
				.catch(() => null)
				.then((v) => {
					// The marks land on the next frame; strike after them so lit notes pulse.
					if (v) requestAnimationFrame(() => soundShape(v, "piano"));
				});
		},
		[inChords, soundOn, play, spec, shift, tune, rootPc, soundShape],
	);

	// ── A held shape ──────────────────────────────────────────────────────────
	// The Shape field searches the library by name or by grip; its index and
	// the grip corpus are fetched on entering Chords mode and kept.
	useEffect(() => {
		if (!inChords || chordIndex.length > 0) return;
		let live = true;
		getChordIndex()
			.then((index) => {
				if (live) setChordIndex(index);
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [inChords, chordIndex.length]);
	const shapeCorpus = useChordShapeCorpus(inChords);

	/** Hold a chord from one of the readout's fields, and strum it once its voicing is known; clearing returns to the degree. */
	const handleHeld = useCallback(
		(ref: ChordRef | null, side: HeldChord["side"]) => {
			if (!ref) {
				setHeld(null);
				return;
			}
			const next: HeldChord = { root: ref.root, suffix: ref.suffix, voicingId: ref.voicingId ?? null, side };
			setHeld(next);
			setPinned(null);
			if (!soundOn) return;
			// The shape to sound is the named chord itself, or the one the capo puts under it.
			const shape = side === "shape" ? next : transposeChord(next.root, next.suffix, -shift);
			void chordVoicing(shape, byId(sameChord(shape, next) ? next.voicingId : null))
				.catch(() => null)
				.then((v) => {
					// The marks land on the next frame; strike after them so lit notes pulse.
					if (v) requestAnimationFrame(() => soundShape(v, "guitar"));
				});
		},
		[soundOn, soundShape, shift],
	);
	/** The readout's fields write chords the way the readout always has: "Am7", "E♭m". */
	const fieldName = useCallback((root: string, suffix: string) => withGlyphs(chordName({ root, suffix })), []);

	/** The chord this key sounds, for the numerals and the dimming. */
	const chordsByPc = useMemo(() => Array.from({ length: 12 }, (_, pc) => keyChord(spec, pc)), [spec]);
	/**
	 * Chords mode names each key by its chord's numeral. Every C still carries
	 * its octave, as it does in Scale mode, so the register can be counted:
	 * "I₄" when C is a degree, "C4" when it is not.
	 */
	const chordKeyLabel = useCallback(
		(key: PianoKey, selected: boolean) => {
			const c = chordsByPc[key.pitchClass];
			const numeral = c.diatonic || selected ? c.numeral : "";
			if (key.pitchClass !== 0) return numeral;
			return numeral ? `${numeral}${SUBSCRIPT_DIGITS[key.octave] ?? key.octave}` : `C${key.octave}`;
		},
		[chordsByPc],
	);
	const keyDimmed = useCallback((key: PianoKey) => !chordsByPc[key.pitchClass].diatonic, [chordsByPc]);
	/** The strip's buttons: the seven degrees, then the five chords outside the key, by interval. */
	const degreeChords = useMemo(() => keyChords(spec), [spec]);
	const chromaticChords = useMemo(
		() =>
			chordsByPc
				.filter((c) => !c.diatonic)
				.sort((a, b) => mod12(a.rootPitchClass - rootPc) - mod12(b.rootPitchClass - rootPc)),
		[chordsByPc, rootPc],
	);

	// ── A hand position in Chords mode ────────────────────────────────────────
	// The frame is on the fingered neck, so the chords searched for shapes are
	// the fingered key's; their degrees are the heard key's degrees.
	const shapeKeyRoot = SCALE_ROOTS[mod12(rootPc - shift)];
	const fingeredChords = useMemo(() => keyChords({ root: shapeKeyRoot, scale }), [shapeKeyRoot, scale]);
	const voicingsKey = `${shapeKeyRoot}/${scale}`;
	const voicingsLoaded = keyVoicings?.key === voicingsKey;
	useEffect(() => {
		if (!inChords || !chordBox || voicingsLoaded) return;
		let live = true;
		void Promise.all(
			fingeredChords.map(async (c) => [chordKey(c), await loadVoicings(c.root, c.suffix).catch(() => [])] as const),
		).then((entries) => {
			if (live) setKeyVoicings({ key: voicingsKey, table: new Map(entries) });
		});
		return () => {
			live = false;
		};
	}, [inChords, chordBox, voicingsLoaded, voicingsKey, fingeredChords]);
	const reachable = useMemo<ReachableChord[]>(
		() =>
			chordBox && voicingsLoaded && keyVoicings
				? reachableChords(fingeredChords, (c) => keyVoicings.table.get(chordKey(c)) ?? [], chordBox, capo)
				: [],
		[chordBox, voicingsLoaded, keyVoicings, fingeredChords, capo],
	);
	const positionPlaying = playing?.source === "position" && player.isPlaying;

	// Raising, moving or clearing the position while the strip loops restarts
	// it with the shapes that position gives, so the sound follows the frame.
	// Read through refs so that only the frame, not every re-render of the
	// starter, triggers it.
	const restartStrip = useRef<() => void>(() => {});
	useEffect(() => {
		restartStrip.current = () => {
			if (playing?.source === "strip") startProgression();
		};
	}, [playing, startProgression]);
	useEffect(() => {
		restartStrip.current();
	}, [chordBox]);

	/** Moving or clearing the position ends a walk through it; the strip's loop is not its business. */
	const stopWalk = useCallback(() => {
		if (playing?.source === "position") stopPlayback();
	}, [playing, stopPlayback]);
	/** A right-press raises a five-fret position from that fret; a picked shape does not survive the move. */
	const pickChordBox = useCallback(
		(fromFret: number) => {
			setChordBox({ fromFret, toFret: Math.min(NECK.toFret, fromFret + BOX_FRETS - 1) });
			setPinned(null);
			stopWalk();
		},
		[stopWalk],
	);
	const resizeChordBox = useCallback(
		(toFret: number) => {
			setChordBox((box) => (box ? { fromFret: box.fromFret, toFret } : box));
			setPinned(null);
			stopWalk();
		},
		[stopWalk],
	);
	const clearChordBox = useCallback(() => {
		setChordBox(null);
		setPinned(null);
		stopWalk();
	}, [stopWalk]);
	/** Pressing a numeral on the position: that chord, in that shape, strummed. */
	const pickReachable = useCallback(
		(r: ReachableChord) => {
			setChordInterval(mod12(r.chord.rootPitchClass + shift - rootPc));
			setPinned(r);
			setHeld(null);
			if (!soundOn) return;
			// The marks land on the next frame; strike after them so lit notes pulse.
			requestAnimationFrame(() => soundShape(r.voicing, "guitar"));
		},
		[shift, rootPc, soundOn, soundShape],
	);
	/** Walk the position's chords in degree order, one bar each, once through. */
	const walkPosition = useCallback(() => {
		if (!soundOn || reachable.length === 0) return;
		const token = ++playToken.current;
		const table = new Map(reachable.map((r) => [chordKey(r.chord), r.voicing]));
		const steps = reachable.map((r) => ({ interval: mod12(r.chord.rootPitchClass + shift - rootPc) }));
		void prepare(RUN_VOICE)
			.then((ready) => {
				if (!ready || token !== playToken.current) return;
				const bars = resolveProgression(steps, spec, capo, (c) => table.get(chordKey(c)) ?? null, tune);
				setPlaying({ bars, source: "position" });
				player.play(progressionSteps(bars), barSeconds(progressionBpm), RUN_VOICE);
			})
			.catch(() => undefined);
	}, [soundOn, reachable, capo, shift, tune, rootPc, prepare, spec, player, progressionBpm]);

	/**
	 * Scale mode: a key of the scale is named with its octave — A2, C3 — so the
	 * keyboard says which note, in which register, rather than only "in the
	 * scale". The tonic is named always; the rest appear with their octave's
	 * dots. A C outside the scale keeps its marker, to count octaves by.
	 */
	const scaleKeyLabel = useCallback(
		(key: PianoKey) =>
			scalePcs.includes(key.pitchClass)
				? withGlyphs(`${noteName(key.pitchClass)}${key.octave}`)
				: key.pitchClass === 0
					? `C${key.octave}`
					: "",
		[scalePcs, noteName],
	);

	/** Written with glyphs already: never through MusicalText, which reads the b of "blues" as a flat. */
	const keyName = `${withGlyphs(root)} ${SCALE_LABELS[scale].toLowerCase()}`;
	const boardLabel = shown
		? `${chordName(shown.shape)} shape on the fretboard`
		: `${root} ${SCALE_LABELS[scale]} on the fretboard`;

	// ── Cards and the panel ───────────────────────────────────────────────────
	// Both optional cards are shown until put away; the choice is restored after
	// mount, like the sound switch, so the server and the first client render agree.
	const [panels, setPanels] = useState<FretboardPanels>(DEFAULT_PANELS);
	const [panelsRestored, setPanelsRestored] = useState(false);
	useEffect(() => {
		const stored = localStorage.getItem(PANELS_STORAGE_KEY);
		queueMicrotask(() => {
			setPanels(parsePanels(stored));
			setPanelsRestored(true);
		});
	}, []);
	useEffect(() => {
		if (!panelsRestored) return;
		localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(panels));
	}, [panels, panelsRestored]);
	const showPanel = useCallback(
		(which: keyof FretboardPanels, on: boolean) => setPanels((p) => ({ ...p, [which]: on })),
		[],
	);
	/**
	 * The card in use: the last one pressed or keyed into. Its icon fills in the module
	 * colour and gives a squash, the way the nav marks the current page.
	 */
	const [currentCard, setCurrentCard] = useState<"piano" | "guitar" | "circle" | null>(null);
	const cardProps = (key: "piano" | "guitar" | "circle") => ({
		"data-current": currentCard === key || undefined,
		onPointerDown: () => setCurrentCard(key),
		onFocus: () => setCurrentCard(key),
	});
	/** Below 960px the panel is a sheet, opened from the dock. */
	const [controlsOpen, setControlsOpen] = useState(false);

	/**
	 * A chord of the key picked by its degree — a chip in the panel, a chord in the
	 * circle's wedge: no key pressed, so the standard shape, strummed on the guitar.
	 */
	const pickDegree = useCallback(
		(interval: number) => {
			setChordInterval(mod12(interval));
			setChordKeyMidi(null);
			setPinned(null);
			setHeld(null);
			if (!soundOn) return;
			const next = chordModeView(spec, shift, rootPc + interval);
			void chordVoicing(next.shape, selectStandardVoicing)
				.catch(() => null)
				.then((v) => {
					// The marks land on the next frame; strike after them so lit notes pulse.
					if (v) requestAnimationFrame(() => soundShape(v, "guitar"));
				});
		},
		[soundOn, spec, shift, rootPc, soundShape],
	);
	const changeMode = useCallback(
		(next: ExplorerMode) => {
			setMode(next);
			clearChordBox();
		},
		[clearChordBox],
	);
	/** A key pressed on the circle: that tonic, the scale kept when it is of the ring's kind. */
	const moveKey = useCallback(
		(ring: "major" | "minor", index: number) => {
			const next = keyFromCircle(spec, ring, index);
			setRoot(next.root);
			setScale(next.scale);
		},
		[spec],
	);

	/** The whole-neck run is sounding, so its button offers to stop it. */
	const neckPlaying = !inChords && player.isPlaying && runTarget.kind === "neck";
	/** The major key the scale is spelled in: the circle's wedge, named. */
	const parentKey = withGlyphs(SCALE_ROOTS[circlePitchClass("major", keyIndex(spec))]);
	const isParent = scale === "major";
	const noVoicing = shown !== null && shapeVoicing === null && voicing !== null && sameChord(voicing.chord, shown.shape);
	/** Whether a chip names the chord on show: a picked degree, not a typed shape or a sounding bar. */
	const isPicked = (c: KeyChord) => !!shown && !held && !playingBar && shown.sounding.rootPitchClass === c.rootPitchClass;

	// ── The panel: what the instruments show ──────────────────────────────────
	const controls = (
		<>
			<section className="fbx-sec" aria-label="Key and scale">
				<h2 className="fbx-h">Key</h2>
				<div className="fbx-keys" role="radiogroup" aria-label="Key">
					{SCALE_ROOTS.map((r) => (
						<ChoiceChip key={r} on={r === root} onChoose={() => setRoot(r)}>
							<MusicalText text={r} />
						</ChoiceChip>
					))}
				</div>
				<label className="fbx-fl">
					<span className="fbx-lbl">Scale</span>
					<select
						aria-label="Scale"
						value={scale}
						onChange={(e) => setScale(e.target.value as ScaleType)}
						className="gp-input fbx-select"
					>
						{SCALE_TYPES.map((t) => (
							<option key={t} value={t}>
								{SCALE_LABELS[t]}
							</option>
						))}
					</select>
				</label>
				<div className="fbx-fl">
					<span className="fbx-lbl">Mode</span>
					<Segmented options={MODES} value={mode} onChange={changeMode} label="Mode" full />
				</div>
			</section>

			{inChords ? (
				<>
					<section className="fbx-sec" aria-label="Chord">
						<h2 className="fbx-h">Chord</h2>
						<div className="fbx-row" role="group" aria-label="Chords in the key">
							{degreeChords.map((c) => (
								<Chip
									key={c.numeral}
									pressed={isPicked(c)}
									onClick={() => pickDegree(c.rootPitchClass - rootPc)}
									className="fbx-deg"
								>
									<b>{c.numeral}</b>
									<small>
										<MusicalText text={chordName(c)} />
									</small>
								</Chip>
							))}
						</div>
						<div className="fbx-row" role="group" aria-label="Chords outside the key">
							{chromaticChords.map((c) => (
								<Chip
									key={c.numeral}
									pressed={isPicked(c)}
									onClick={() => pickDegree(c.rootPitchClass - rootPc)}
									className="fbx-deg"
									data-outside=""
								>
									<b>{c.numeral}</b>
									<small>
										<MusicalText text={chordName(c)} />
									</small>
								</Chip>
							))}
						</div>
						<p className="fbx-meta">Or press a key on the piano, a chord on the circle, or type any chord into the field above.</p>
					</section>
					{/* A progression written in degrees over the key. The strip stores
					    intervals, so a key change transposes every bar and leaves the
					    numerals where they are. */}
					<section className="fbx-sec" aria-label="Progression" data-testid="progression-panel">
						<h2 className="fbx-h">Progression</h2>
						<p className="fbx-meta">
							{progression.length} of {MAX_BARS} bars · one strum a bar, looped
						</p>
						<div className="fbx-strip" data-testid="progression-strip">
							{stripBars.length === 0 ? (
								<span className="fbx-meta">Add a degree below to start a strip.</span>
							) : (
								stripBars.map((bar, i) => (
									<StripBar
										key={i}
										index={i}
										numeral={bar.sounding.numeral}
										chord={chordName(bar.sounding)}
										current={progressionPlaying && player.currentIndex === i}
										onRemove={() => setProgression((p) => removeStep(p, i))}
									/>
								))
							)}
						</div>
						<div className="fbx-prow">
							<span className="fbx-lbl">Add</span>
							<div className="fbx-row" role="group" aria-label="Degrees">
								{degreeChords.map((c) => (
									<Chip
										key={c.numeral}
										aria-label={`Add ${c.numeral}`}
										disabled={progression.length >= MAX_BARS}
										onClick={() => setProgression((p) => appendStep(p, c.rootPitchClass - rootPc))}
									>
										{c.numeral}
									</Chip>
								))}
								{chromaticChords.map((c) => (
									<Chip
										key={c.numeral}
										aria-label={`Add ${c.numeral}`}
										disabled={progression.length >= MAX_BARS}
										onClick={() => setProgression((p) => appendStep(p, c.rootPitchClass - rootPc))}
										data-outside=""
									>
										{c.numeral}
									</Chip>
								))}
							</div>
						</div>
						<div className="fbx-prow">
							<span className="fbx-lbl">Presets</span>
							<div className="fbx-row" role="group" aria-label="Presets">
								{PROGRESSION_PRESETS.map((preset) => (
									<Chip key={preset.name} onClick={() => setProgression(presetSteps(preset, spec))}>
										{preset.name}
									</Chip>
								))}
							</div>
						</div>
						<div className="fbx-transport">
							<PlayPick
								playing={progressionPlaying}
								size="sm"
								aria-label={progressionPlaying ? "Stop progression" : "Play progression"}
								disabled={!soundOn || progression.length === 0}
								onClick={() => (progressionPlaying ? stopPlayback() : startProgression())}
							/>
							<Stepper
								label="Tempo"
								value={progressionBpm}
								min={PROGRESSION_BPM.min}
								max={PROGRESSION_BPM.max}
								unit="BPM"
								tap
								disabled={!soundOn}
								onChange={handleTempo}
							/>
							<Button
								variant="ghost"
								size="sm"
								className="fbx-clear"
								disabled={progression.length === 0}
								onClick={() => setProgression([])}
							>
								Clear
							</Button>
						</div>
					</section>
					<section className="fbx-sec" aria-label="Hand position">
						<h2 className="fbx-h">Hand position</h2>
						{chordBox ? (
							<>
								<p className="fbx-meta">
									Frets {chordBox.fromFret}–{chordBox.toFret}
								</p>
								<div className="fbx-row" data-testid="position-chords">
									{!voicingsLoaded ? (
										<span className="fbx-meta">Looking for shapes…</span>
									) : (
										<>
											{reachable.length < MIN_REACHABLE && (
												<span className="fbx-meta" data-testid="position-note">
													{reachable.length === 0
														? "Nothing fits here."
														: `Only ${reachable[0].chord.numeral} fits here.`}
												</span>
											)}
											{reachable.map((r) => {
												const on = !playingBar && pinned?.voicing.id === r.voicing.id;
												const heard = chordsByPc[mod12(r.chord.rootPitchClass + shift)];
												return (
													<Chip
														key={r.chord.numeral}
														pressed={on}
														aria-label={`Play ${r.chord.numeral} here`}
														onClick={() => pickReachable(r)}
														className="fbx-deg"
													>
														<span>{r.chord.numeral}</span>
														<span className="fbx-deg-name">
															<MusicalText text={chordName(heard)} />
														</span>
													</Chip>
												);
											})}
										</>
									)}
								</div>
								<div className="fbx-row">
									<Button
										variant="secondary"
										size="sm"
										disabled={!soundOn || reachable.length === 0}
										onClick={() => (positionPlaying ? stopPlayback() : walkPosition())}
									>
										{positionPlaying ? <Square aria-hidden /> : <Play aria-hidden />}
										{positionPlaying ? "Stop" : "Play them in turn"}
									</Button>
									<Button variant="ghost" size="sm" onClick={clearChordBox}>
										Clear the frame
									</Button>
								</div>
							</>
						) : (
							<p className="fbx-meta">
								Right-click or long-press a fret on the neck to frame five frets there, and see which of the key&apos;s chords fit.
							</p>
						)}
					</section>
				</>
			) : (
				<section className="fbx-sec" aria-label="Play the scale">
					<h2 className="fbx-h">Play the scale</h2>
					<div className="fbx-row">
						<Button
							disabled={!soundOn}
							onClick={() => (neckPlaying ? player.stop() : runChoiceSelected("neck"))}
						>
							{neckPlaying ? <Square aria-hidden /> : <Play aria-hidden />}
							{neckPlaying ? "Stop" : "Whole neck"}
						</Button>
					</div>
					<span className="fbx-lbl">Hand positions</span>
					<div className="fbx-row" role="group" aria-label="Hand positions">
						{boxes.map((box, i) => (
							<Chip
								key={box.fromFret}
								pressed={runChoice === `box:${i}`}
								onClick={() => runChoiceSelected(`box:${i}`)}
							>
								{box.fromFret === 0 ? "Open" : `Fret ${box.fromFret}`}
							</Chip>
						))}
					</div>
					<p className="fbx-meta">
						A string&apos;s name on the neck runs that string. Right-click or long-press a fret to frame five frets of your own.
					</p>
				</section>
			)}

			<section className="fbx-sec" aria-label="Display">
				<h2 className="fbx-h">Display</h2>
				<div className="fbx-fl">
					<span className="fbx-lbl">Labels on the dots</span>
					<Segmented options={LABEL_MODES} value={labelChoice} onChange={setLabelChoice} label="Labels" full />
				</div>
				<div className="fbx-line">
					<Switch
						label="Capo"
						aria-label="Capo"
						checked={capo > 0}
						onCheckedChange={(on) => setCapo(on ? DEFAULT_CAPO : 0)}
					/>
					<Stepper
						label="Capo fret"
						size="sm"
						value={capo > 0 ? capo : DEFAULT_CAPO}
						min={1}
						max={STRUM_CAPO_MAX}
						disabled={capo === 0}
						onChange={setCapo}
					/>
				</div>
			</section>

			<section className="fbx-sec" aria-label="Sound">
				<h2 className="fbx-h">Sound</h2>
				<Switch label="Sound on" aria-label="Sound" checked={soundOn} onCheckedChange={setSoundOn} />
				<label className="fbx-vol">
					<span className="fbx-lbl">Piano</span>
					<Slider
						label="Piano volume"
						value={Math.round(volumes.piano * 100)}
						onChange={(v) => setVolume("piano", v / 100)}
						disabled={!soundOn}
					/>
				</label>
				<label className="fbx-vol">
					<span className="fbx-lbl">Guitar</span>
					<Slider
						label="Guitar volume"
						value={Math.round(volumes.guitar * 100)}
						onChange={(v) => setVolume("guitar", v / 100)}
						disabled={!soundOn}
					/>
				</label>
			</section>
		</>
	);

	return (
		<div className="fbx">
			<div className="fbx-shell">
				<div className="fbx-stage">
					<div className="fbx-stage-in gp-rise">
						<header className="fbx-head">
							<div className="fbx-head-row">
								<h1 className="fbx-title">Fretboard</h1>
								{/* The two cards that can be put away, brought back from here. */}
								<div className="fbx-cardtoggles" role="group" aria-label="Cards">
									<CardToggle
										icon={<Piano />}
										label="Show the piano"
										on={panels.piano}
										onChange={(on) => showPanel("piano", on)}
									/>
									<CardToggle
										icon={<CircleDot />}
										label="Show the circle of fifths"
										on={panels.circle}
										onChange={(on) => showPanel("circle", on)}
									/>
								</div>
							</div>
							<p className="fbx-meta">See a scale across the neck, then lay a chord over it to find the safe notes.</p>
						</header>

						{/* What is showing: the key, and in Chords mode the chord, both searchable. */}
						<section className="fbx-card fbx-now" aria-label="Now showing">
							<div className="fbx-now-key">
								<h2 className="fbx-key" data-testid="view-title">
									{keyName}
								</h2>
								{capo > 0 && (
									<span className="fbx-tag" data-testid="capo-tag">
										Capo {capo}
									</span>
								)}
								{tune !== 0 && (
									<span className="fbx-tag" data-testid="tuning-tag">
										{TUNING_LABELS[tuning]}
									</span>
								)}
								<ScaleSteps scale={scale} />
							</div>
							{shown ? (
								<div className="fbx-readout" data-testid="chord-readout">
									{/* "D · V · C shape": the chord heard and, with a capo, the shape
									    that holds it. A key press fills them; typing into one moves
									    the other the capo's distance. */}
									<div className="fbx-readout-row">
										<ChordSearchSelect
											chord={{ root: shown.sounding.root, suffix: shown.sounding.suffix }}
											onChange={(ref) => handleHeld(ref, "sounding")}
											index={chordIndex}
											shapeCorpus={shapeCorpus}
											ariaLabel="Chord"
											format={fieldName}
										/>
										{shown.numeral && (
											<span className="fbx-num" data-testid="numeral">
												{shown.numeral}
											</span>
										)}
										{shift !== 0 && (
											<span className="fbx-shape">
												<ChordSearchSelect
													chord={{ root: shown.shape.root, suffix: shown.shape.suffix }}
													onChange={(ref) => handleHeld(ref, "shape")}
													index={chordIndex}
													shapeCorpus={shapeCorpus}
													ariaLabel="Shape"
													format={fieldName}
												/>
												<span className="fbx-meta">shape</span>
											</span>
										)}
										{noVoicing && (
											<span className="fbx-meta" data-testid="no-voicing">
												No shape in the library
											</span>
										)}
									</div>
									{/* What the chord is made of: each note the shape sounds, in the
									    key's spelling, with which degree of the chord it is. */}
									<ToneList tones={chordTones} label="Chord tones" testId="chord-tones" />
								</div>
							) : (
								<ToneList
									tones={scalePcs.map((pc) => ({ name: noteName(pc), degree: degreeLabel(pc - rootPc) }))}
									label="Scale tones"
								/>
							)}
						</section>

						{panels.piano && (
							<section className="fbx-card" aria-label="Piano" {...cardProps("piano")}>
								<CardHead
									icon={<Piano />}
									title="Piano"
									hint={inChords ? "A key picks the chord on its degree" : "A key sounds its note and finds it on the neck"}
									onClose={() => showPanel("piano", false)}
									closeLabel="Hide the piano"
								/>
								<PianoKeyboard
									ref={piano}
									keys={PIANO_61}
									selectedPitchClass={shown ? shown.sounding.rootPitchClass : rootPc}
									// A scale is a set of names, uncovered one octave at a time under
									// the pointer; a chord is the six notes its shape actually sounds.
									tonePitchClasses={shown ? undefined : scalePcs}
									toneMidis={shown && shapeVoicing ? shapePitches(shapeVoicing, shift) : undefined}
									range={range}
									onSelect={handleKeySelect}
									labelFor={inChords ? chordKeyLabel : scaleKeyLabel}
									dimmed={inChords ? keyDimmed : undefined}
									ariaLabel={inChords ? "Chord" : "Piano"}
								/>
							</section>
						)}

						<section className="fbx-card" aria-label="Guitar" {...cardProps("guitar")}>
							<CardHead
								icon={<Guitar />}
								title="Guitar"
								hint={
									inChords
										? "A note of the shape strums it · drag the capo along the neck"
										: "A dot sounds its note · drag the capo along the neck"
								}
								control={<TuningPicker value={tuning} onChange={setTuning} />}
							/>
							<div className="select-none">
								<Fretboard
									ref={fretboard}
									marks={marks}
									fromFret={NECK.fromFret}
									toFret={NECK.toFret}
									capo={capo}
									stringNames={strings}
									onCapoChange={(fret) => {
										setCapo(fret);
										// Dragged past the edge, the capo would vanish under the scroll.
										fretboard.current?.revealFret(fret);
									}}
									maxCapo={STRUM_CAPO_MAX}
									highlight={inChords ? chordBox : runBox}
									runSlots={runBox ? runNotes : undefined}
									onStringPlay={
										inChords
											? undefined
											: (s) => (playingString === s ? player.stop() : runChoiceSelected(`string:${s}`))
									}
									playingString={playingString}
									// The same frame in both modes: a run's box in Scale mode, the
									// hand position's in Chords mode.
									onPositionPick={
										inChords
											? pickChordBox
											: (fret) => runChoiceSelected(`pick:${fret}-${Math.min(NECK.toFret, fret + BOX_FRETS - 1)}`)
									}
									onHighlightResize={
										inChords
											? chordBox
												? resizeChordBox
												: undefined
											: runBox
												? (to) => setRunChoice(`pick:${runBox.fromFret}-${to}`)
												: undefined
									}
									onHighlightPlay={
										inChords
											? chordBox && reachable.length > 0
												? () => (positionPlaying ? stopPlayback() : walkPosition())
												: undefined
											: runBox
												? () => (player.isPlaying ? player.stop() : startRun(scaleRun(spec, playable, runTarget, tune)))
												: undefined
									}
									onHighlightClear={
										inChords
											? chordBox
												? clearChordBox
												: undefined
											: runBox
												? () => {
														setRunChoice("neck");
														player.stop();
													}
												: undefined
									}
									highlightPlaying={inChords ? positionPlaying : player.isPlaying && runTarget.kind === "box"}
									label={boardLabel}
									onSlotPress={handleSlotPress}
									onSlotHover={handleSlotHover}
									pressable={soundOn}
								/>
								<NeckLegend items={LEGEND.filter((l) => l.mode === "both" || l.mode === mode)} />
							</div>
						</section>

						{panels.circle && (
							<section className="fbx-card" aria-label="Circle of fifths" {...cardProps("circle")}>
								<CardHead
									icon={<CircleDot />}
									title="Circle of fifths"
									hint={inChords ? "A lit chord plays · any other key moves there" : "A key moves the page to it"}
									onClose={() => showPanel("circle", false)}
									closeLabel="Hide the circle of fifths"
								/>
								<div className="fbx-cof-body">
									<CircleOfFifths
										spec={spec}
										chord={
											shown ? { rootPitchClass: shown.sounding.rootPitchClass, suffix: shown.sounding.suffix } : null
										}
										picking={inChords}
										onKey={moveKey}
										onChord={(pc) => pickDegree(pc - rootPc)}
									/>
									<div className="fbx-cof-side">
										<p className="fbx-cof-lead">
											{isParent ? (
												<>
													The shaded wedge is the seven chords of <MusicalText text={parentKey} /> major.
												</>
											) : (
												<>
													{keyName} is spelled in <MusicalText text={parentKey} /> major: the
													shaded wedge is its seven chords.
												</>
											)}
										</p>
										<dl className="fbx-cof-key">
											<div>
												<dt>Outside</dt>
												<dd>The twelve major keys, a fifth apart.</dd>
											</div>
											<div>
												<dt>Middle</dt>
												<dd>Each key&apos;s relative minor.</dd>
											</div>
											<div>
												<dt>Inside</dt>
												<dd>The diminished chord on its seventh.</dd>
											</div>
										</dl>
									</div>
								</div>
							</section>
						)}

					</div>
				</div>

				<aside className="fbx-panel" aria-label="Controls">
					{controls}
				</aside>
			</div>

			{/* Below 960px: what is showing, and the panel one press away. */}
			<div className="fbx-dock">
				<div className="fbx-dock-sum">
					<b>
						{keyName}
						{capo > 0 && ` · capo ${capo}`}
						{tune !== 0 && ` · ${TUNING_LABELS[tuning].toLowerCase()}`}
					</b>
					<span>
						{shown ? (
							<>
								<MusicalText text={chordName(shown.sounding)} />
								{shown.numeral && ` · ${shown.numeral}`}
							</>
						) : (
							`${MODES.find((m) => m.value === mode)?.label} mode`
						)}
					</span>
				</div>
				<Button onClick={() => setControlsOpen(true)}>
					<SlidersHorizontal aria-hidden />
					Controls
				</Button>
			</div>
			<Sheet open={controlsOpen} onOpenChange={setControlsOpen} title="Controls">
				<div className="fbx-sheet" data-m="fb">
					{controls}
				</div>
			</Sheet>
		</div>
	);
}
