"use client";

/**
 * The scale + chord-tone view: controls above, one `<Fretboard/>` below.
 *
 * The whole 22-fret neck is always rendered; where it does not fit it scrolls
 * sideways under the fixed string-name column, and "Root" scrolls to the
 * lowest root on the low E.
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";

import Fretboard from "@/components/fretboard/Fretboard";
import ChordPickerModal, { type ConfirmedChord } from "@/components/strum/ChordPickerModal";
import MusicalText from "@/components/MusicalText";
import { GUITAR_OPEN_MIDI, rootPitchClass } from "@/lib/chordVoicingToMidi";
import { chordTonesFromMidi, overlayChordTones } from "@/lib/fretboard/overlay";
import {
	SCALE_LABELS,
	SCALE_ROOTS,
	SCALE_TYPES,
	scaleMarks,
	scaleRootPitchClass,
	type LabelMode,
	type ScaleType,
} from "@/lib/fretboard/scales";
import type { FretMark, FretWindow } from "@/lib/fretboard/types";
import { parseMusicalText } from "@/lib/musicalNotation";

/** A 22-fret neck, the common electric; acoustics simply never use the top frets. */
export const NECK: FretWindow = { fromFret: 0, toFret: 22 };

export interface FretboardExplorerProps {
	initialRoot?: string;
	initialScale?: ScaleType;
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

/** "Bb" → "B♭", "b3" → "♭3": the board prints glyphs, the model keeps ASCII. */
function withGlyphs(label: string): string {
	return parseMusicalText(label)
		.map((seg) => seg.value)
		.join("");
}

/** Lowest fret on the low E that sounds the root, where a player starts the scale. */
function rootFretOnLowE(root: string): number {
	return (scaleRootPitchClass(root) - GUITAR_OPEN_MIDI[0] + 120) % 12;
}

const LABEL_MODES: readonly { value: LabelMode; label: string }[] = [
	{ value: "note", label: "Notes" },
	{ value: "degree", label: "Degrees" },
];

const LEGEND: readonly { emphasis: FretMark["emphasis"]; tone?: FretMark["tone"]; label: string }[] = [
	{ emphasis: "root", label: "Root" },
	{ emphasis: "chordTone", tone: "third", label: "3rd" },
	{ emphasis: "chordTone", tone: "fifth", label: "5th" },
	{ emphasis: "chordTone", tone: "seventh", label: "7th" },
	{ emphasis: "chordTone", tone: "extension", label: "9 / 11 / 13 / sus" },
	{ emphasis: "scaleTone", label: "Scale tone" },
];

export default function FretboardExplorer({
	initialRoot = "A",
	initialScale = "minorPentatonic",
}: FretboardExplorerProps) {
	const [root, setRoot] = useState(initialRoot);
	const [scale, setScale] = useState<ScaleType>(initialScale);
	const [labelMode, setLabelMode] = useState<LabelMode>("note");
	const [chord, setChord] = useState<ConfirmedChord | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [scrollTo, setScrollTo] = useState<{ fret: number } | null>(null);

	const spec = useMemo(() => ({ root, scale }), [root, scale]);

	const marks = useMemo<FretMark[]>(() => {
		const base = scaleMarks(spec, NECK, labelMode);
		const layered = chord
			? overlayChordTones(base, chordTonesFromMidi(chord.pitches, rootPitchClass(chord.root)), spec, NECK, labelMode)
			: base;
		return layered.map((m) => ({ ...m, label: withGlyphs(m.label) }));
	}, [spec, labelMode, chord]);

	const jumpToRoot = () => setScrollTo({ fret: rootFretOnLowE(root) });

	return (
		<div className="flex flex-col gap-4">
			{/* Controls */}
			<div className="flex flex-col gap-3 border border-line bg-panel p-3">
				<div className="flex flex-col gap-1.5">
					<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Root</span>
					<div role="radiogroup" aria-label="Scale root" className="grid grid-cols-6 gap-px border border-line-strong bg-line-strong sm:grid-cols-12">
						{SCALE_ROOTS.map((r) => {
							const on = r === root;
							return (
								<button
									key={r}
									type="button"
									role="radio"
									aria-checked={on}
									onClick={() => setRoot(r)}
									className={`py-2 font-mono text-[12px] transition-colors duration-(--dur-hover) ${
										on ? "bg-denim text-on-denim" : "bg-surface text-ink hover:bg-denim-tint hover:text-denim-accent"
									}`}
								>
									<MusicalText text={r} />
								</button>
							);
						})}
					</div>
				</div>

				<div className="flex flex-wrap items-end gap-3">
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

					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Labels</span>
						<Segmented options={LABEL_MODES} value={labelMode} onChange={setLabelMode} ariaLabel="Label mode" />
					</div>

					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Chord</span>
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
					</div>

					<div className="flex flex-col gap-1.5">
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Go to</span>
						<button
							type="button"
							onClick={jumpToRoot}
							className="border border-line-strong px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim transition-colors duration-(--dur-hover) hover:text-denim-accent"
						>
							Root
						</button>
					</div>
				</div>
			</div>

			{/* The board */}
			<div className="select-none border border-line bg-surface p-3 sm:p-4">
				<Fretboard
					marks={marks}
					fromFret={NECK.fromFret}
					toFret={NECK.toFret}
					scrollTo={scrollTo}
					label={`${root} ${SCALE_LABELS[scale]} on the fretboard`}
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
