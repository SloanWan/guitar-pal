"use client";

/**
 * The fretboard page: a key, two instruments showing it, and a mode saying
 * what to do with them.
 *
 * Zones, top to bottom. **Key**: the root and scale everything else is derived
 * from, plus the capo — always reachable, in either mode, because they
 * describe the material rather than the activity. **Piano** and **neck**: two
 * displays of the same key, never pickers. A press means one thing per mode.
 * **Mode panel**: what you are doing with the key. **Display**: how it is
 * drawn.
 *
 * Scale mode: the neck shows the scale across the neck, the piano tints its
 * pitch classes, a chord from the picker lays its tones over the scale, and
 * pressing anything sounds that note. Chords mode: the piano's keys become the
 * key's chords, pressing one lights that chord's standard voicing on the neck
 * and sounds it; pressing a note of the shape strums the shape.
 *
 * The chord is held as **semitones above the key's root**, not as a pitch
 * class, so changing key or scale keeps the degree and transposes the chord
 * with it — that is what makes numerals worth showing.
 *
 * Chords mode also carries a **progression**: a strip of bars, each held as an
 * interval like the picked chord, looped one strum per bar. And a **hand
 * position**: a right-press raises a five-fret frame on the neck and the
 * panel lists the key's chords with a shape inside it — pressing one lights
 * that shape, and the frame's play button walks them once through.
 *
 * A capo follows the strum page's rule: a chord names the shape the player
 * holds, so the neck shows the fingered chord and the piano the heard one.
 * It also shortens the neck: nothing behind the capo can be played, so the
 * scale's marks start at the capo fret, which becomes the new open string.
 * Marks above it keep the pitch they had — a capo does not transpose them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Guitar, Piano, Play, Square, Volume2, X } from "lucide-react";
import { toast } from "sonner";

import Fretboard, { type FretboardHandle } from "@/components/fretboard/Fretboard";
import PianoKeyboard, { type PianoKeyboardHandle } from "@/components/fretboard/PianoKeyboard";
import { useNoteSound, type NoteVoice } from "@/components/fretboard/useNoteSound";
import { useSequencePlayer } from "@/components/fretboard/useSequencePlayer";
import MusicalText from "@/components/MusicalText";
import Fader from "@/components/ui/Fader";
import Rocker from "@/components/ui/Rocker";
import { loadVoicings, peekVoicings } from "@/lib/chordVoicingCache";
import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { chordModeView, inShape, shapeSlots, type ChordModeView } from "@/lib/fretboard/chordMode";
import { keyChord, keyChords, shapeMarks, shapePitches, type KeyChord } from "@/lib/fretboard/chords";
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

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

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

const SELECT_CLASS = "h-[30px] border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink";

/**
 * An instrument's heading: its name on the left, its own fader on the right.
 * The fader belongs to the instrument it controls rather than to the page, so
 * it sits in the corner of that instrument's block.
 */
function InstrumentHeader({
	icon,
	name,
	label,
	value,
	onChange,
	disabled,
	children,
}: {
	icon: React.ReactNode;
	name: string;
	label: string;
	value: number;
	onChange: (level: number) => void;
	disabled?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
			<span className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
				<span className="flex items-center gap-1.5">
					<span aria-hidden="true">{icon}</span>
					{name}
				</span>
				{children}
			</span>
			<div className="w-28 shrink-0">
				<Fader
					min={0}
					max={100}
					step={1}
					value={Math.round(value * 100)}
					onValue={(v) => onChange(v / 100)}
					disabled={disabled}
					ariaLabel={label}
				/>
			</div>
		</div>
	);
}

/** "Bb" → "B♭", "b3" → "♭3": the board prints glyphs, the model keeps ASCII. */
function withGlyphs(label: string): string {
	return parseMusicalText(label)
		.map((seg) => seg.value)
		.join("");
}

/** The voicing library's key for a chord. */
const chordKey = (c: KeyChord): string => `${c.root} ${c.suffix}`;

/** "Em", "C#dim": a key chord the way a chart writes it. */
function chordName(chord: KeyChord): string {
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

/** The frets a capo actually lands on, for one-press access. */
/** Where a capo lands when it is switched on: the first fret, then drag it. */
const DEFAULT_CAPO = 1;

/** Slow enough to learn a shape, fast enough to hear it as a line. */
const DEFAULT_BPM = 90;
/** A run's fixed tempo and voice, now that neither has a control. */
const RUN_BPM = DEFAULT_BPM;
const RUN_VOICE: NoteVoice = "guitar";

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
	const [labelChoice, setLabelChoice] = useState<LabelChoice>("note");
	const [mode, setMode] = useState<ExplorerMode>(initialMode);
	const [capo, setCapo] = useState(0);
	/** Scale mode: what a run plays — the whole neck, a hand position, or one string. */
	const [runChoice, setRunChoice] = useState("neck");
	/** Chords mode: semitones above the key's root; 0 (the tonic) until a key is pressed. */
	const [chordInterval, setChordInterval] = useState(0);
	/** Chords mode: the fingered chord's voicing, or null while loading / when the library has none. */
	const [voicing, setVoicing] = useState<{ chord: KeyChord; voicing: ChordVoicing | null } | null>(null);
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
	const handleRunStep = useCallback((step: SequenceStep) => {
		const first = step.slots[0];
		if (first) fretboard.current?.revealFret(first.fret);
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
	const activeInterval = playingBar ? mod12(playingBar.sounding.rootPitchClass - rootPc) : chordInterval;

	const view = useMemo<ChordModeView | null>(
		() => (inChords ? chordModeView(spec, capo, rootPc + activeInterval) : null),
		[inChords, spec, capo, rootPc, activeInterval],
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
	// A sounding bar brings its own voicing, resolved before play began; a
	// shape picked from a position stands in while it is that chord's.
	const sameChord = (a: KeyChord, b: KeyChord) => a.root === b.root && a.suffix === b.suffix;
	const shapeVoicing = playingBar
		? playingBar.voicing
		: view && pinned && sameChord(pinned.chord, view.shape)
			? pinned.voicing
			: view && voicing && sameChord(voicing.chord, view.shape)
				? voicing.voicing
				: null;

	// Behind a capo there is no neck left to play, so the scale starts at the
	// capo fret; the pitches above it are what they always were.
	const playable = useMemo<FretWindow>(() => ({ fromFret: capo, toFret: NECK.toFret }), [capo]);

	const noteName = useMemo(() => createLabeler(spec, "note"), [spec]);
	const labelMode: LabelMode = labelChoice === "degree" ? "degree" : "note";
	const showLabels = labelChoice !== "none";

	const marks = useMemo<FretMark[]>(() => {
		const label = createLabeler(spec, labelMode);
		let raw: FretMark[];
		if (view) {
			raw = shapeVoicing ? shapeMarks(shapeVoicing, capo, view.shape.rootPitchClass, label) : [];
		} else {
			raw = scaleMarks(spec, playable, labelMode);
		}
		return raw.map((m) => ({ ...m, label: showLabels ? withGlyphs(m.label) : "" }));
	}, [spec, labelMode, showLabels, view, shapeVoicing, capo, playable]);

	// ── Playing the scale ─────────────────────────────────────────────────────
	const boxes = useMemo(() => (inChords ? [] : scalePositions(spec, playable)), [inChords, spec, playable]);
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
		() => (inChords ? [] : scaleRun(spec, playable, runTarget)),
		[inChords, spec, playable, runTarget],
	);
	/**
	 * The box outlined on the neck: whichever tag the pointer is over, else the
	 * one a run would play, so hovering previews without committing.
	 */
	const runBox = inChords ? null : runTarget.kind === "box" ? runTarget.box : null;

	/**
	 * The chord as it actually sounds: every note of the shape, low to high,
	 * named with its octave and with which degree of the chord it is. Without a
	 * voicing there is only the triad to show, so its three tones stand in.
	 */
	const chordTones = useMemo(() => {
		if (!view) return [];
		const root = view.sounding.rootPitchClass;
		const describe = (midi: number, withOctave: boolean) => ({
			name: `${noteName(((midi % 12) + 12) % 12)}${withOctave ? Math.floor(midi / 12) - 1 : ""}`,
			degree: degreeLabel(midi - root),
		});
		if (shapeVoicing) return shapePitches(shapeVoicing, capo).map((midi) => describe(midi, true));
		return view.sounding.pitchClasses.map((pc) => describe(pc, false));
	}, [view, shapeVoicing, capo, noteName]);

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
	useEffect(() => stopPlayback, [stopPlayback, root, scale, capo, mode, soundOn, progression]);

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
		() => (inChords ? resolveProgression(progression, spec, capo, () => null) : []),
		[inChords, progression, spec, capo],
	);

	/**
	 * Load every shape the strip needs, then loop it. A strip, key or capo that
	 * changed while the shapes loaded has stopped this press already, so its
	 * bars are dropped rather than played over the new state.
	 */
	const startProgression = useCallback(() => {
		if (!soundOn || progression.length === 0) return;
		const token = ++playToken.current;
		const shapes = new Map<string, KeyChord>();
		for (const bar of resolveProgression(progression, spec, capo, () => null)) shapes.set(chordKey(bar.shape), bar.shape);
		const table = new Map<string, ChordVoicing | null>();
		void Promise.all(
			[...shapes].map(async ([key, shape]) => {
				table.set(key, await standardVoicing(shape).catch(() => null));
			}),
		)
			.then(() => prepare(RUN_VOICE))
			.then((ready) => {
				if (!ready || token !== playToken.current) return;
				const bars = resolveProgression(progression, spec, capo, (c) => table.get(chordKey(c)) ?? null);
				setPlaying({ bars, source: "strip" });
				player.play(progressionSteps(bars), barSeconds(progressionBpm), RUN_VOICE, { loop: true });
			})
			.catch(() => undefined);
	}, [soundOn, progression, spec, capo, prepare, player, progressionBpm]);

	/** A new tempo while the strip plays restarts it at that tempo; between runs it just waits. */
	const tempoDragging = useRef(false);
	const applyTempo = useCallback(
		(bpm: number) => {
			if (playing?.source !== "strip" || !player.isPlaying) return;
			player.play(progressionSteps(playing.bars), barSeconds(bpm), RUN_VOICE, { loop: true });
		},
		[playing, player],
	);
	const handleTempo = useCallback(
		(bpm: number) => {
			setProgressionBpm(bpm);
			// A drag restarts once, when it lets go, rather than on every step.
			if (!tempoDragging.current) applyTempo(bpm);
		},
		[applyTempo],
	);

	/** Selecting a run from the board plays it straight away — that is the gesture. */
	const runChoiceSelected = useCallback(
		(choice: string) => {
			setRunChoice(choice);
			startRun(scaleRun(spec, playable, targetFor(choice)));
		},
		[startRun, spec, playable, targetFor],
	);
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
				fretboard.current?.strike(slotsSounding(midi, NECK));
				void play(midi, "piano").catch(() => undefined);
				return;
			}
			const interval = mod12(pc - rootPc);
			setChordInterval(interval);
			setPinned(null);
			if (!soundOn) return;
			const next = chordModeView(spec, capo, rootPc + interval);
			void standardVoicing(next.shape)
				.catch(() => null)
				.then((v) => {
					// The marks land on the next frame; strike after them so lit notes pulse.
					if (v) requestAnimationFrame(() => soundShape(v, "piano"));
				});
		},
		[inChords, soundOn, play, spec, capo, rootPc, soundShape],
	);

	/** The chord this key sounds, for the numerals and the dimming. */
	const chordsByPc = useMemo(() => Array.from({ length: 12 }, (_, pc) => keyChord(spec, pc)), [spec]);
	const chordKeyLabel = useCallback(
		(key: PianoKey, selected: boolean) => {
			const c = chordsByPc[key.pitchClass];
			return c.diatonic || selected ? c.numeral : "";
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
	const shapeKeyRoot = view?.shapeKeyRoot ?? root;
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
			setChordInterval(mod12(r.chord.rootPitchClass + capo - rootPc));
			setPinned(r);
			if (!soundOn) return;
			// The marks land on the next frame; strike after them so lit notes pulse.
			requestAnimationFrame(() => soundShape(r.voicing, "guitar"));
		},
		[capo, rootPc, soundOn, soundShape],
	);
	/** Walk the position's chords in degree order, one bar each, once through. */
	const walkPosition = useCallback(() => {
		if (!soundOn || reachable.length === 0) return;
		const token = ++playToken.current;
		const table = new Map(reachable.map((r) => [chordKey(r.chord), r.voicing]));
		const steps = reachable.map((r) => ({ interval: mod12(r.chord.rootPitchClass + capo - rootPc) }));
		void prepare(RUN_VOICE)
			.then((ready) => {
				if (!ready || token !== playToken.current) return;
				const bars = resolveProgression(steps, spec, capo, (c) => table.get(chordKey(c)) ?? null);
				setPlaying({ bars, source: "position" });
				player.play(progressionSteps(bars), barSeconds(progressionBpm), RUN_VOICE);
			})
			.catch(() => undefined);
	}, [soundOn, reachable, capo, rootPc, prepare, spec, player, progressionBpm]);

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

	const keyName = `${withGlyphs(root)} ${SCALE_LABELS[scale].toLowerCase()}`;
	const boardLabel = view ? `${chordName(view.shape)} shape on the fretboard` : `${root} ${SCALE_LABELS[scale]} on the fretboard`;

	return (
		<div className="flex flex-col gap-3">
			{/* Title: what you are looking at, and the one switch that silences it. */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-mono text-[13px] text-ink" data-testid="view-title">
					<MusicalText text={keyName} />
					{capo > 0 && <span className="text-ink-dim"> · capo {capo}</span>}
					{view && (
						<span className="text-denim-accent">
							{" · "}
							<MusicalText text={chordName(view.sounding)} /> ({view.sounding.numeral})
						</span>
					)}
				</h2>
			</div>

			{/* Key and capo: what both modes work on, always reachable. */}
			<div className="flex flex-wrap items-end gap-3 border border-line bg-panel p-3">
				<Field label="Key">
					<div role="radiogroup" aria-label="Key" className="flex flex-wrap border border-line-strong">
						{SCALE_ROOTS.map((r, i) => {
							const on = r === root;
							return (
								<button
									key={r}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => setRoot(r)}
									className={`min-w-9 px-2 py-1.5 font-mono text-[12px] transition-colors duration-(--dur-hover) ${
										i > 0 ? "border-l border-line-strong" : ""
									} ${on ? "bg-denim text-on-denim" : "text-ink hover:bg-denim-tint hover:text-denim-accent"}`}
								>
									<MusicalText text={r} />
								</button>
							);
						})}
					</div>
				</Field>

				<Field label="Scale">
					<select
						aria-label="Scale"
						value={scale}
						onChange={(e) => setScale(e.target.value as ScaleType)}
						className={SELECT_CLASS}
					>
						{SCALE_TYPES.map((t) => (
							<option key={t} value={t}>
								{SCALE_LABELS[t]}
							</option>
						))}
					</select>
				</Field>

				<Field label="Mode">
					<Segmented
						options={MODES}
						value={mode}
						onChange={(m) => {
							setMode(m);
							clearChordBox();
						}}
						ariaLabel="Mode"
					/>
				</Field>
			</div>

			{/* The two instruments, adjacent: the same key seen twice. */}
			<div className="flex flex-col gap-3 border border-line bg-surface p-3 sm:p-4">
				{/* The card's own switch: everything below it is what makes sound. */}
				<div className="flex items-center justify-end gap-2">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Sound</span>
					<Volume2 className="size-3.5 shrink-0 text-ink-dim" strokeWidth={1.5} />
					{/* The wait is announced in a toast; the rocker only breathes. */}
					<Rocker checked={soundOn} onChange={setSoundOn} loading={soundLoading} ariaLabel="Sound" />
				</div>

				{/* In Chords mode the keyboard is the chord picker, so the chord it
				    is picking is named over it. */}
				{view && (
					<div className="text-center" data-testid="chord-readout">
						<div className="font-mono text-[13px] text-ink">
							<MusicalText text={chordName(view.sounding)} />
							<span className="mx-1.5 text-ink-faint">·</span>
							<span className="text-denim-accent">{view.sounding.numeral}</span>
							{capo > 0 && (
								<span className="ml-2 text-ink-dim">
									· <MusicalText text={chordName(view.shape)} /> shape
								</span>
							)}
							{shapeVoicing === null && voicing?.chord === view.shape && (
								<span className="ml-2 text-ink-faint">· no voicing</span>
							)}
						</div>
						{/* What the chord is made of: each note the shape sounds, in the
						    key's spelling, with which degree of the chord it is. */}
						<div className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-faint">
							{chordTones.map((tone, i) => (
								<span key={`${tone.name}-${i}`}>
									{i > 0 && <span className="mx-1">·</span>}
									<MusicalText text={tone.name} />
									<span className="text-denim-accent">
										{" ("}
										<MusicalText text={tone.degree} />
										{")"}
									</span>
								</span>
							))}
						</div>
					</div>
				)}

				<InstrumentHeader
					icon={<Piano className="size-3.5" strokeWidth={1.5} />}
					name="Piano"
					label="Piano volume"
					value={volumes.piano}
					onChange={(v) => setVolume("piano", v)}
					disabled={!soundOn}
				/>
				<PianoKeyboard
					ref={piano}
					keys={PIANO_61}
					selectedPitchClass={view ? view.sounding.rootPitchClass : rootPc}
					// A scale is a set of names, uncovered one octave at a time under
					// the pointer; a chord is the six notes its shape actually sounds.
					tonePitchClasses={view ? undefined : scalePcs}
					toneMidis={view && shapeVoicing ? shapePitches(shapeVoicing, capo) : undefined}
					range={GUITAR_RANGE}
					onSelect={handleKeySelect}
					labelFor={inChords ? chordKeyLabel : scaleKeyLabel}
					dimmed={inChords ? keyDimmed : undefined}
					ariaLabel={inChords ? "Chord" : "Piano"}
				/>

				<InstrumentHeader
					icon={<Guitar className="size-3.5" strokeWidth={1.5} />}
					name="Guitar"
					label="Guitar volume"
					value={volumes.guitar}
					onChange={(v) => setVolume("guitar", v)}
					disabled={!soundOn}
				>
					{/* Both belong to the neck rather than to the key: where the capo
					    is, and what the dots say. */}
					<span className="flex items-center gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Capo</span>
						<Rocker checked={capo > 0} onChange={(on) => setCapo(on ? DEFAULT_CAPO : 0)} ariaLabel="Capo" />
					</span>
					<Segmented options={LABEL_MODES} value={labelChoice} onChange={setLabelChoice} ariaLabel="Labels" />
				</InstrumentHeader>
				<div className="select-none">
					<Fretboard
						ref={fretboard}
						marks={marks}
						fromFret={NECK.fromFret}
						toFret={NECK.toFret}
						capo={capo}
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
									? () => (player.isPlaying ? player.stop() : startRun(scaleRun(spec, playable, runTarget)))
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
					<ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-hidden="true">
						{LEGEND.map(({ emphasis, tone, label }) => (
							<li
								key={label}
								className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim"
							>
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
			</div>

			{/* Mode panel — Chords: a progression written in degrees over the key.
			    The strip stores intervals, so a key change transposes every bar
			    and leaves the numerals where they are. */}
			{inChords && (
				<div className="flex flex-col gap-3 border border-line bg-panel p-3" data-testid="progression-panel">
					{/* The hand position: which of the key's chords have a shape inside
					    the frame. Pressing one lights that shape and strums it. */}
					{chordBox && (
						<Field label={`Position ${chordBox.fromFret}–${chordBox.toFret}`}>
							<div className="flex flex-wrap items-center gap-2" data-testid="position-chords">
								{!voicingsLoaded ? (
									<span className="font-mono text-[11px] text-ink-faint">Looking for shapes…</span>
								) : (
									<>
										{reachable.length < MIN_REACHABLE && (
											<span className="font-mono text-[11px] text-ink-faint" data-testid="position-note">
												{reachable.length === 0
													? "Nothing fits here."
													: `Only ${reachable[0].chord.numeral} fits here.`}
											</span>
										)}
										{reachable.map((r) => {
											const on = !playingBar && pinned?.voicing.id === r.voicing.id;
											const heard = chordsByPc[mod12(r.chord.rootPitchClass + capo)];
											return (
												<button
													key={r.chord.numeral}
													type="button"
													aria-label={`Play ${r.chord.numeral} here`}
													aria-pressed={on}
													onClick={() => pickReachable(r)}
													className={`flex flex-col items-center border px-2.5 py-1 font-mono transition-colors duration-(--dur-hover) ${
														on
															? "border-denim bg-denim-tint text-denim-accent"
															: "border-line-strong text-ink hover:bg-denim-tint hover:text-denim-accent"
													}`}
												>
													<span className="text-[12px]">{r.chord.numeral}</span>
													<span className="text-[10px] text-ink-dim">
														<MusicalText text={chordName(heard)} />
													</span>
												</button>
											);
										})}
									</>
								)}
							</div>
						</Field>
					)}

					<div className="flex flex-wrap items-end gap-x-5 gap-y-3">
						<Field label="Add a bar">
							<div className="flex flex-wrap items-center gap-1" role="group" aria-label="Degrees">
								{degreeChords.map((c) => (
									<button
										key={c.numeral}
										type="button"
										aria-label={`Add ${c.numeral}`}
										disabled={progression.length >= MAX_BARS}
										onClick={() => setProgression((p) => appendStep(p, c.rootPitchClass - rootPc))}
										className="min-w-9 border border-line-strong px-2 py-1.5 font-mono text-[12px] text-ink transition-colors duration-(--dur-hover) hover:bg-denim-tint hover:text-denim-accent disabled:opacity-40"
									>
										{c.numeral}
									</button>
								))}
								<span className="mx-1 text-ink-faint" aria-hidden="true">
									·
								</span>
								{chromaticChords.map((c) => (
									<button
										key={c.numeral}
										type="button"
										aria-label={`Add ${c.numeral}`}
										disabled={progression.length >= MAX_BARS}
										onClick={() => setProgression((p) => appendStep(p, c.rootPitchClass - rootPc))}
										className="min-w-8 border border-line px-1.5 py-1.5 font-mono text-[11px] text-ink-dim transition-colors duration-(--dur-hover) hover:bg-denim-tint hover:text-denim-accent disabled:opacity-40"
									>
										{c.numeral}
									</button>
								))}
							</div>
						</Field>
						<Field label="Presets">
							<div className="flex flex-wrap gap-1" role="group" aria-label="Presets">
								{PROGRESSION_PRESETS.map((preset) => (
									<button
										key={preset.name}
										type="button"
										onClick={() => setProgression(presetSteps(preset, spec))}
										// Not uppercased: the case of a numeral is its quality.
										className="border border-line-strong px-2 py-1.5 font-mono text-[11px] tracking-[0.04em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent"
									>
										{preset.name}
									</button>
								))}
							</div>
						</Field>
					</div>

					{/* The strip: numerals over chord names, the sounding bar lit. */}
					<div className="flex flex-wrap items-center gap-2" data-testid="progression-strip">
						{stripBars.length === 0 ? (
							<span className="font-mono text-[11px] text-ink-faint">Press a degree to add a bar.</span>
						) : (
							stripBars.map((bar, i) => {
								const current = progressionPlaying && player.currentIndex === i;
								return (
									<div
										key={i}
										data-bar={i}
										data-current={current || undefined}
										className={`flex items-stretch border transition-colors duration-(--dur-hover) ${
											current ? "border-denim bg-denim-tint" : "border-line-strong"
										}`}
									>
										<div className="flex flex-col items-center px-2.5 py-1 font-mono">
											<span className={`text-[12px] ${current ? "text-denim-accent" : "text-ink"}`}>
												{bar.sounding.numeral}
											</span>
											<span className="text-[10px] text-ink-dim">
												<MusicalText text={chordName(bar.sounding)} />
											</span>
										</div>
										<button
											type="button"
											aria-label={`Remove bar ${i + 1}`}
											onClick={() => setProgression((p) => removeStep(p, i))}
											className="border-l border-line-strong px-1 text-ink-faint transition-colors duration-(--dur-hover) hover:text-denim-accent"
										>
											<X className="size-3" strokeWidth={1.5} />
										</button>
									</div>
								);
							})
						)}
					</div>

					{/* Transport: play or stop the loop, and its tempo. */}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
						<button
							type="button"
							aria-label={progressionPlaying ? "Stop progression" : "Play progression"}
							disabled={!soundOn || progression.length === 0}
							onClick={() => (progressionPlaying ? stopPlayback() : startProgression())}
							className="flex h-[30px] items-center gap-1.5 border border-denim bg-denim px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-on-denim transition-colors duration-(--dur-hover) hover:bg-denim-accent disabled:opacity-40"
						>
							{progressionPlaying ? (
								<Square className="size-3" strokeWidth={2.5} />
							) : (
								<Play className="size-3" strokeWidth={2.5} />
							)}
							{progressionPlaying ? "Stop" : "Play"}
						</button>
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Tempo</span>
							<div className="w-36">
								<Fader
									min={PROGRESSION_BPM.min}
									max={PROGRESSION_BPM.max}
									step={1}
									value={progressionBpm}
									onValue={handleTempo}
									onDragStart={() => {
										tempoDragging.current = true;
									}}
									onDragEnd={() => {
										tempoDragging.current = false;
										applyTempo(progressionBpm);
									}}
									disabled={!soundOn}
									ariaLabel="Tempo"
								/>
							</div>
							<span className="font-mono text-[12px] tabular-nums text-ink" data-testid="tempo-readout">
								{progressionBpm} BPM
							</span>
						</div>
						{progression.length > 0 && (
							<button
								type="button"
								onClick={() => setProgression([])}
								className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent"
							>
								Clear
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
