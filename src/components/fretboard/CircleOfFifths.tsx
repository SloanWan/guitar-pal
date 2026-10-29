"use client";

/**
 * The circle of fifths (#158) as a control: majors outside, their relative minors inside
 * them, each key's diminished chord innermost. A wedge shades the key's seven chords and
 * turns, the short way round, when the key moves.
 *
 * A press means one thing per mode, like the instruments. Scale mode: any major or minor
 * moves the page to that key. Chords mode: a chord in the wedge is picked (and sounds);
 * anything outside it still moves the key. The diminished ring is only pressable where it
 * holds a chord of the key in Chords mode — elsewhere it is a label.
 */
import { useState, type CSSProperties } from "react";

import MusicalText from "@/components/MusicalText";
import { usePress } from "@/components/ui/press";
import {
	circleCells,
	keyCell,
	keyIndex,
	ringOfSuffix,
	type CircleCell,
	type CircleRing,
} from "@/lib/fretboard/circleOfFifths";
import type { ScaleSpec } from "@/lib/fretboard/scales";
import { cn } from "@/lib/utils";

export interface CircleOfFifthsProps {
	spec: ScaleSpec;
	/** Chords mode: the chord on show, by sounding root and library suffix. Null in Scale mode. */
	chord: { rootPitchClass: number; suffix: string } | null;
	/** Chords mode: the wedge's chords are picked here rather than moving the key. */
	picking: boolean;
	onKey: (ring: "major" | "minor", index: number) => void;
	onChord: (pitchClass: number) => void;
}

/** Each ring's distance from the centre, as a share of the circle's radius. */
const RADIUS: Readonly<Record<CircleRing, number>> = { major: 0.845, minor: 0.585, dim: 0.32 };
/** The wedge spans the two outer rings; the inner disc holds the diminished ring. */
const WEDGE_INNER = 45;
const WEDGE_OUTER = 99;

function place(ring: CircleRing, index: number): CSSProperties {
	const a = (index * 30 * Math.PI) / 180;
	const r = RADIUS[ring] * 50;
	return { left: `${(50 + r * Math.sin(a)).toFixed(3)}%`, top: `${(50 - r * Math.cos(a)).toFixed(3)}%` };
}

/** An annular sector centred on the top, ±45° (three keys), in a ±100 viewBox. */
function wedgePath(inner: number, outer: number): string {
	const p = (r: number, deg: number) => {
		const a = (deg * Math.PI) / 180;
		return `${(r * Math.sin(a)).toFixed(3)} ${(-r * Math.cos(a)).toFixed(3)}`;
	};
	return `M${p(outer, -45)}A${outer} ${outer} 0 0 1 ${p(outer, 45)}L${p(inner, 45)}A${inner} ${inner} 0 0 0 ${p(inner, -45)}Z`;
}
const WEDGE = wedgePath(WEDGE_INNER, WEDGE_OUTER);

const RING_NAME: Readonly<Record<"major" | "minor", string>> = { major: "major", minor: "minor" };

export default function CircleOfFifths({ spec, chord, picking, onKey, onChord }: CircleOfFifthsProps) {
	const cells = circleCells(spec);
	const key = keyIndex(spec);
	const tonic = keyCell(spec);
	const chordRing = chord ? ringOfSuffix(chord.suffix) : null;

	// The wedge turns by the shortest way to the new key, so C → F steps back a place
	// rather than spinning nearly all the way round.
	const [turn, setTurn] = useState({ key, deg: key * 30 });
	if (turn.key !== key) {
		const step = ((key - turn.key + 18) % 12) - 6;
		setTurn({ key, deg: turn.deg + step * 30 });
	}

	const chosen = (c: CircleCell): boolean =>
		chord
			? chordRing === c.ring && chord.rootPitchClass === c.pitchClass
			: c.ring === tonic.ring && c.index === tonic.index;

	return (
		<div className="fbx-cof" role="group" aria-label="Circle of fifths">
			<svg
				className="fbx-cof-wedge"
				viewBox="-100 -100 200 200"
				aria-hidden="true"
				style={{ transform: `rotate(${turn.deg}deg)` }}
			>
				<path d={WEDGE} />
			</svg>
			<span className="fbx-cof-hub" aria-hidden="true" />
			{cells.map((c) => {
				const picks = picking && c.inKey;
				if (c.ring === "dim" && !picks) {
					return (
						<span
							key={`${c.ring}-${c.index}`}
							className="fbx-cof-cell"
							data-ring="dim"
							data-in={c.inKey || undefined}
							style={place(c.ring, c.index)}
							aria-hidden="true"
						>
							<MusicalText text={c.label} />
						</span>
					);
				}
				const ring = c.ring;
				return (
					<CircleButton
						key={`${c.ring}-${c.index}`}
						cell={c}
						on={chosen(c)}
						label={
							picks
								? `Chord ${c.label}`
								: `Key of ${c.label.replace(/m$/, "")} ${RING_NAME[ring as "major" | "minor"]}`
						}
						onPress={() => (picks ? onChord(c.pitchClass) : onKey(ring as "major" | "minor", c.index))}
					/>
				);
			})}
		</div>
	);
}

function CircleButton({
	cell,
	on,
	label,
	onPress,
}: {
	cell: CircleCell;
	on: boolean;
	label: string;
	onPress: () => void;
}) {
	const ref = usePress<HTMLButtonElement>();
	return (
		<button
			ref={ref}
			type="button"
			className={cn("fbx-cof-cell gp-press", on ? "gp-tone-primary" : "gp-tone-neutral")}
			data-ring={cell.ring}
			data-in={cell.inKey || undefined}
			aria-label={label}
			aria-pressed={on}
			style={place(cell.ring, cell.index)}
			onClick={onPress}
		>
			<MusicalText text={cell.label} />
		</button>
	);
}
