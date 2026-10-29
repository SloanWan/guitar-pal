"use client";

/**
 * The fretboard page's own small pieces, shared by the page and its parts gallery
 * (/dev/fretboard-parts), so what is reviewed there is what the page draws.
 */
import "./fretboard-page.css";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

import MusicalText from "@/components/MusicalText";
import { usePress } from "@/components/ui/press";
import { Chip } from "@/components/ui/chip";
import { Segmented } from "@/components/ui/segmented";
import { scaleSteps, stepName, type ScaleType } from "@/lib/fretboard/scales";
import { TUNINGS, type Tuning } from "@/lib/fretboard/tuning";
import { cn } from "@/lib/utils";

/** One choice of a single-choice chip group (the key): flat until chosen, like a toggle chip. */
export function ChoiceChip({ on, onChoose, children }: { on: boolean; onChoose: () => void; children: ReactNode }) {
	const ref = usePress<HTMLButtonElement>();
	return (
		<button
			ref={ref}
			type="button"
			role="radio"
			aria-checked={on}
			className={cn("gp-chip gp-press fbx-choice", on ? "gp-tone-primary" : "gp-tone-neutral")}
			onClick={onChoose}
		>
			{children}
		</button>
	);
}

/**
 * A card's heading: its icon and name, a line on what a press does, an optional control
 * of the card's own (the neck's tuning) and an optional close.
 */
export function CardHead({
	icon,
	title,
	hint,
	control,
	onClose,
	closeLabel,
}: {
	icon: ReactNode;
	title: string;
	hint?: ReactNode;
	control?: ReactNode;
	onClose?: () => void;
	closeLabel?: string;
}) {
	return (
		<div className="fbx-chead">
			<span className="fbx-chead-icon" aria-hidden="true">
				{icon}
			</span>
			<h2 className="fbx-h">{title}</h2>
			{hint && <span className="fbx-meta fbx-chead-hint">{hint}</span>}
			{control && <div className="fbx-chead-control">{control}</div>}
			{onClose && (
				<button type="button" className="fbx-x gp-focus" aria-label={closeLabel} onClick={onClose}>
					<X aria-hidden />
				</button>
			)}
		</div>
	);
}

/**
 * Brings a card back, or puts it away: its icon, raised while the card is away and filled
 * in the module colour while it is shown, beside the page's title.
 */
export function CardToggle({
	icon,
	label,
	on,
	onChange,
}: {
	icon: ReactNode;
	label: string;
	on: boolean;
	onChange: (on: boolean) => void;
}) {
	return (
		<Chip pressed={on} onPressedChange={onChange} aria-label={label} title={label} className="fbx-cardtoggle">
			{icon}
		</Chip>
	);
}

/** The tuning choices as the neck's heading writes them: short enough for three across. */
export const TUNING_SHORT: Readonly<Record<Tuning, string>> = {
	standard: "Standard",
	halfDown: "½ down",
	wholeDown: "1 down",
};

/** The whole guitar's tuning, on the neck it retunes. */
export function TuningPicker({ value, onChange }: { value: Tuning; onChange: (tuning: Tuning) => void }) {
	return (
		<Segmented
			options={TUNINGS.map((t) => ({ value: t, label: TUNING_SHORT[t] }))}
			value={value}
			onChange={onChange}
			label="Tuning"
			dense
		/>
	);
}

/** The scale's formula: one block a step, as wide as the step, half steps tinted. */
export function ScaleSteps({ scale }: { scale: ScaleType }) {
	return (
		<ol className="fbx-steps" aria-label="Steps between the notes" data-testid="scale-steps">
			{scaleSteps(scale).map((n, i) => (
				<li
					key={i}
					title={`${n} semitone${n === 1 ? "" : "s"}`}
					data-half={n === 1 || undefined}
					style={{ "--n": n } as CSSProperties}
				>
					{stepName(n)}
				</li>
			))}
		</ol>
	);
}

export interface Tone {
	/** ASCII spelling, drawn with glyphs: "C3", "Bb". */
	name: string;
	/** Its degree, "1", "b3". */
	degree: string;
}

/** Notes as chips, each with its degree; the root filled. */
export function ToneList({ tones, label, testId }: { tones: readonly Tone[]; label: string; testId?: string }) {
	return (
		<ul className="fbx-tones" aria-label={label} data-testid={testId}>
			{tones.map((tone, i) => (
				<li key={`${tone.name}-${i}`} data-root={tone.degree === "1" || undefined}>
					<b>
						<MusicalText text={tone.name} />
					</b>
					<span>
						<MusicalText text={tone.degree} />
					</span>
				</li>
			))}
		</ul>
	);
}

/** One bar of the progression strip: its numeral over its chord, lit while it sounds. */
export function StripBar({
	index,
	numeral,
	chord,
	current,
	onRemove,
}: {
	index: number;
	numeral: string;
	/** ASCII chord name, drawn with glyphs. */
	chord: string;
	current: boolean;
	onRemove: () => void;
}) {
	return (
		<div className="fbx-bar" data-bar={index} data-current={current || undefined}>
			<div className="fbx-bar-n">
				<b>{numeral}</b>
				<span>
					<MusicalText text={chord} />
				</span>
			</div>
			<button type="button" className="fbx-bar-x gp-focus" aria-label={`Remove bar ${index + 1}`} onClick={onRemove}>
				<X aria-hidden />
			</button>
		</div>
	);
}
