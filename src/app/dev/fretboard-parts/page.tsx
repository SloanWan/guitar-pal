"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CircleDot, Guitar, Piano } from "lucide-react";

import CircleOfFifths from "@/components/fretboard/CircleOfFifths";
import { CardHead, CardToggle, ChoiceChip, ScaleSteps, StripBar, ToneList, TuningPicker } from "@/components/fretboard/parts";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import AppLink from "@/components/AppLink";
import MusicalText from "@/components/MusicalText";
import { Segmented } from "@/components/ui/segmented";
import { getChordIndex } from "@/lib/chords";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { keyChord } from "@/lib/fretboard/chords";
import { keyFromCircle } from "@/lib/fretboard/circleOfFifths";
import { SCALE_LABELS, SCALE_ROOTS, SCALE_TYPES, type ScaleSpec } from "@/lib/fretboard/scales";
import type { Tuning } from "@/lib/fretboard/tuning";
import type { ChordRef } from "@/lib/strumPatterns";
import { parseMusicalText } from "@/lib/musicalNotation";
import { chordAbbreviation } from "@/lib/strumProgressions";

// The fretboard page's own pieces (src/components/fretboard/parts.tsx, CircleOfFifths, the
// candy ChordSearchSelect) in every state, at the widths the page gives them. The Candy
// primitives they are built from are on /dev/primitives.

const THEMES = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
] as const;

/** The panel's inner width from 960px (356px column, 24px margin, 20px padding each side). */
const PANEL_W = 292;

const BARS: readonly { numeral: string; chord: string }[] = [
	{ numeral: "I", chord: "C" },
	{ numeral: "V", chord: "G" },
	{ numeral: "vi", chord: "Am" },
	{ numeral: "IV", chord: "F" },
	{ numeral: "ii", chord: "Dm" },
	{ numeral: "vii°", chord: "Bdim" },
	{ numeral: "♭VII", chord: "Bb" },
];

export default function FretboardPartsPage() {
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const [index, setIndex] = useState<ChordIndexEntry[]>([]);
	const [heard, setHeard] = useState<ChordRef | null>({ root: "A", suffix: "minor" });
	const [shape, setShape] = useState<ChordRef | null>({ root: "C", suffix: "major" });
	const [empty, setEmpty] = useState<ChordRef | null>(null);
	const [key, setKey] = useState("C");
	const [tuning, setTuning] = useState<Tuning>("standard");
	const [bars, setBars] = useState(BARS.slice(0, 6));
	const [current, setCurrent] = useState(1);
	const [scaleSpec, setScaleSpec] = useState<ScaleSpec>({ root: "A", scale: "minorPentatonic" });
	const [chordsSpec, setChordsSpec] = useState<ScaleSpec>({ root: "C", scale: "major" });
	const [picked, setPicked] = useState({ rootPitchClass: 2, suffix: "minor" });
	const [cards, setCards] = useState({ piano: false, circle: true });
	const [currentCard, setCurrentCard] = useState<string | null>("Guitar");

	useEffect(() => {
		const root = document.documentElement;
		const before = root.dataset.theme;
		root.dataset.theme = theme;
		return () => {
			if (before) root.dataset.theme = before;
		};
	}, [theme]);
	useEffect(() => {
		let live = true;
		getChordIndex()
			.then((i) => {
				if (live) setIndex(i);
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, []);

	// The page writes its fields' chords the same way: "C♯m7♭5", not "C#m7b5".
	const name = (root: string, suffix: string) =>
		parseMusicalText(chordAbbreviation({ root, suffix }))
			.map((seg) => seg.value)
			.join("");

	return (
		<div data-m="fb" className="fbx" style={{ height: "auto", minHeight: "100vh" }}>
			<div className="mx-auto flex w-full max-w-240 flex-col gap-10 px-4 py-8 sm:px-8">
				<header className="flex flex-col gap-3">
					<h1 className="fbx-title">Fretboard parts</h1>
					<p className="fbx-meta">
						The fretboard page&apos;s own pieces in every state. Buttons, chips, switches and sliders are on{" "}
						<AppLink href="/dev/primitives" className="underline">
							/dev/primitives
						</AppLink>
						.
					</p>
					<div>
						<Segmented label="Theme" options={THEMES} value={theme} onChange={setTheme} dense />
					</div>
				</header>

				<Part title="Chord search field" note="Skin candy. Type a name (am7, dmaj7) or a grip (x32010).">
					<Row label="Empty">
						<ChordSearchSelect chord={empty} onChange={setEmpty} index={index} ariaLabel="Empty chord" />
					</Row>
					<Row label="Holding a chord">
						<ChordSearchSelect
							chord={heard}
							onChange={setHeard}
							index={index}
							ariaLabel="Chord"
							format={name}
						/>
					</Row>
					<Row label="Long name">
						<ChordSearchSelect
							chord={{ root: "C#", suffix: "m7b5" }}
							onChange={() => undefined}
							index={index}
							ariaLabel="Long chord"
							format={name}
						/>
					</Row>
					<Row label="Not in the library">
						<ChordSearchSelect
							chord={null}
							unknownLabel="Cmaj13#11"
							onChange={() => undefined}
							index={index}
							ariaLabel="Unknown chord"
						/>
					</Row>
					<Row label="Readout row">
						<div className="fbx-readout">
							<div className="fbx-readout-row">
								<ChordSearchSelect
									chord={heard}
									onChange={setHeard}
									index={index}
									ariaLabel="Heard"
									format={name}
								/>
								<span className="fbx-num">vi</span>
								<span className="fbx-shape">
									<ChordSearchSelect
										chord={shape}
										onChange={setShape}
										index={index}
										ariaLabel="Shape"
										format={name}
									/>
									<span className="fbx-meta">shape</span>
								</span>
							</div>
						</div>
					</Row>
				</Part>

				<Part title="Tones" note="Scale tones and chord tones: name and degree, the root filled.">
					<ToneList
						label="Scale tones"
						tones={[
							{ name: "A", degree: "1" },
							{ name: "C", degree: "b3" },
							{ name: "D", degree: "4" },
							{ name: "E", degree: "5" },
							{ name: "G", degree: "b7" },
						]}
					/>
					<ToneList
						label="Chord tones"
						tones={[
							{ name: "C3", degree: "1" },
							{ name: "E3", degree: "3" },
							{ name: "G3", degree: "5" },
							{ name: "Bb3", degree: "b7" },
							{ name: "E4", degree: "3" },
						]}
					/>
				</Part>

				<Part title="Step formula" note="One block a step, as wide as the step; half steps tinted.">
					{SCALE_TYPES.map((scale) => (
						<Row key={scale} label={SCALE_LABELS[scale]}>
							<ScaleSteps scale={scale} />
						</Row>
					))}
				</Part>

				<Part title="Key chips" note="Single choice, flat until chosen.">
					<div className="fbx-keys" role="radiogroup" aria-label="Key" style={{ maxWidth: PANEL_W }}>
						{SCALE_ROOTS.map((r) => (
							<ChoiceChip key={r} on={r === key} onChoose={() => setKey(r)}>
								<MusicalText text={r} />
							</ChoiceChip>
						))}
					</div>
				</Part>

				<Part title="Card toggles" note="Beside the page title: raised while the card is away, filled while it shows.">
					<div className="fbx-cardtoggles" style={{ marginLeft: 0 }}>
						<CardToggle
							icon={<Piano />}
							label="Show the piano"
							on={cards.piano}
							onChange={(on) => setCards((c) => ({ ...c, piano: on }))}
						/>
						<CardToggle
							icon={<CircleDot />}
							label="Show the circle of fifths"
							on={cards.circle}
							onChange={(on) => setCards((c) => ({ ...c, circle: on }))}
						/>
					</div>
				</Part>

				<Part title="Card headings" note="Name, hint, a control of the card's own, close. Press a card to make it the one in use.">
					{["Guitar", "Piano"].map((title) => (
						<div
							key={title}
							className="fbx-card"
							data-current={currentCard === title || undefined}
							onPointerDown={() => setCurrentCard(title)}
						>
							<CardHead icon={title === "Guitar" ? <Guitar /> : <Piano />} title={`${title} (press me)`} />
						</div>
					))}
					<div className="fbx-card">
						<CardHead
							icon={<Piano />}
							title="Piano"
							hint="A key sounds its note and finds it on the neck"
							onClose={() => undefined}
							closeLabel="Hide the piano"
						/>
					</div>
					<div className="fbx-card">
						<CardHead
							icon={<Guitar />}
							title="Guitar"
							hint="A dot sounds its note · drag the capo along the neck"
							control={<TuningPicker value={tuning} onChange={setTuning} />}
						/>
					</div>
					<div className="fbx-card" style={{ maxWidth: 358 }}>
						<CardHead
							icon={<Guitar />}
							title="Guitar"
							hint="Phone width: the hint gives way"
							control={<TuningPicker value={tuning} onChange={setTuning} />}
						/>
					</div>
				</Part>

				<Part title="Progression strip" note={`At the panel's width (${PANEL_W}px): four bars a row.`}>
					<div className="flex flex-wrap gap-6">
						<Frame width={PANEL_W} label="Empty">
							<div className="fbx-strip">
								<span className="fbx-meta">Add a degree below to start a strip.</span>
							</div>
						</Frame>
						<Frame width={PANEL_W} label="Playing (press a bar's number to move the playhead)">
							<div className="fbx-strip">
								{bars.map((b, i) => (
									<StripBar
										key={i}
										index={i}
										numeral={b.numeral}
										chord={b.chord}
										current={i === current}
										onRemove={() => setBars((all) => all.filter((_, j) => j !== i))}
									/>
								))}
							</div>
							<div className="mt-3 flex flex-wrap gap-2">
								{bars.map((_, i) => (
									<button key={i} type="button" className="fbx-meta underline" onClick={() => setCurrent(i)}>
										{i + 1}
									</button>
								))}
								<button type="button" className="fbx-meta underline" onClick={() => setBars(BARS.slice(0, 6))}>
									reset
								</button>
							</div>
						</Frame>
						<Frame width={PANEL_W} label="Long names">
							<div className="fbx-strip">
								<StripBar index={0} numeral="ii" chord="C#m7b5" current={false} onRemove={() => undefined} />
								<StripBar index={1} numeral="V" chord="F#7sus4" current={false} onRemove={() => undefined} />
								<StripBar index={2} numeral="I" chord="Bbmaj7" current={false} onRemove={() => undefined} />
								<StripBar index={3} numeral="♭VII" chord="Ab" current={false} onRemove={() => undefined} />
							</div>
						</Frame>
					</div>
				</Part>

				<Part title="Circle of fifths" note="Scale mode moves the key; Chords mode picks the wedge's chords.">
					<div className="fbx-cof-body" style={{ gridTemplateColumns: "repeat(2, minmax(0, 360px))" }}>
						<div className="flex flex-col gap-2">
							<span className="fbx-lbl">
								Scale mode · {scaleSpec.root} {SCALE_LABELS[scaleSpec.scale].toLowerCase()}
							</span>
							<CircleOfFifths
								spec={scaleSpec}
								chord={null}
								picking={false}
								onKey={(ring, i) => setScaleSpec(keyFromCircle(scaleSpec, ring, i))}
								onChord={() => undefined}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<span className="fbx-lbl">
								Chords mode · {chordsSpec.root} {SCALE_LABELS[chordsSpec.scale].toLowerCase()}
							</span>
							<CircleOfFifths
								spec={chordsSpec}
								chord={picked}
								picking
								onKey={(ring, i) => setChordsSpec(keyFromCircle(chordsSpec, ring, i))}
								onChord={(pc) => setPicked({ rootPitchClass: pc, suffix: keyChord(chordsSpec, pc).suffix })}
							/>
						</div>
					</div>
				</Part>
			</div>
		</div>
	);
}

function Part({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h2 className="fbx-h" style={{ fontSize: 20 }}>
					{title}
				</h2>
				{note && <p className="fbx-meta">{note}</p>}
			</div>
			<div className="flex flex-col gap-4">{children}</div>
		</section>
	);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-4">
			<span className="fbx-lbl w-36 flex-none">{label}</span>
			{children}
		</div>
	);
}

/** A box the width the page gives a piece, on the panel's card. */
function Frame({ width, label, children }: { width: number; label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<span className="fbx-lbl">{label}</span>
			<div className="fbx-card" style={{ width: width + 40, padding: 20 }}>
				{children}
			</div>
		</div>
	);
}
