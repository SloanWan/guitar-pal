"use client";

import { useState } from "react";
import { useNoteSound } from "@/components/fretboard/useNoteSound";
import "./status.css";

const STRINGS = 6;
const GAP = 14;
const TOP = 10;
const WIDTH = 236;
const LEFT = 2;
const RIGHT = WIDTH - 2;
/** Half the gap a fret number cuts in its string. */
const NOTE_HALF = 10;
/** The gap the clef sits in, the way a TAB clef is printed. */
const CLEF: readonly [number, number] = [8, 26];
/** Where a snapped string breaks. */
const BREAK: readonly [number, number] = [104, 132];
/** Each string's open note (MIDI), string 1 (high E) first — the way TAB numbers them. */
const OPEN_MIDI = [64, 59, 55, 50, 45, 40] as const;
const STRING_NAMES = ["high E", "B", "G", "D", "A", "low E"] as const;

/** [from, to] with the gaps cut out. Gaps are cut from the drawing rather than
 *  covered with a page-coloured box, so the art sits on any background. */
function cut(from: number, to: number, gaps: readonly (readonly [number, number])[]): [number, number][] {
	const out: [number, number][] = [];
	let at = from;
	for (const [a, b] of [...gaps].sort((x, y) => x[0] - y[0])) {
		if (b <= at || a >= to) continue;
		if (a > at) out.push([at, a]);
		at = Math.max(at, b);
	}
	if (at < to) out.push([at, to]);
	return out;
}

/** Enter and Space press an SVG part the way they press a button. */
function onActivate(run: () => void) {
	return (e: React.KeyboardEvent) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		run();
	};
}

/**
 * A short TAB staff for the status pages: fret numbers on strings, and
 * optionally one string drawn snapped — the 404's "4 0 4", the error page's
 * broken string.
 *
 * Easter egg: it plays. A fret number sounds its note when pressed, and the
 * snapped string, pressed, is mended — drawn whole again — and rings open.
 */
export function StatusTab({
	notes,
	snapped,
}: {
	/** [x, string 1–6 from the top, label]; a number is a fret, anything else (an "x") is drawn only */
	notes: readonly (readonly [number, number, string])[];
	/** The string (1–6) drawn broken in the middle, if any. */
	snapped?: number;
}) {
	const { play } = useNoteSound();
	const [mended, setMended] = useState(false);
	// One counter per press, keyed into the pressed part so its animation runs again.
	const [pressed, setPressed] = useState<{ key: string; run: number } | null>(null);
	const broken = snapped !== undefined && !mended ? snapped : undefined;

	const y = (s: number) => TOP + (s - 1) * GAP;
	const height = TOP * 2 + (STRINGS - 1) * GAP;

	function sound(key: string, midi: number) {
		setPressed((p) => ({ key, run: (p?.run ?? 0) + 1 }));
		void play(midi);
	}

	return (
		<svg
			viewBox={`0 0 ${WIDTH} ${height}`}
			className="status-tab h-auto w-[236px] max-w-full text-gp-ink"
			role="group"
			aria-label="A short TAB staff"
		>
			<g fill="none" stroke="var(--gp-edge)" strokeWidth="1.5" strokeLinecap="round">
				{Array.from({ length: STRINGS }, (_, i) => {
					const s = i + 1;
					const sy = y(s);
					const gaps = [
						CLEF,
						...notes.filter((n) => n[1] === s).map(([x]) => [x - NOTE_HALF, x + NOTE_HALF] as const),
						...(s === broken ? [BREAK] : []),
					];
					return (
						<g
							key={`${s}-${s === snapped && mended ? "whole" : "drawn"}`}
							className={s === snapped && mended ? "status-mended" : undefined}
						>
							{cut(LEFT, RIGHT, gaps).map(([a, b]) => (
								<path key={a} d={`M ${a} ${sy} H ${b}`} />
							))}
							{s === broken && (
								// Two loose ends curling away from the break.
								<>
									<path d={`M ${BREAK[0]} ${sy} q 8 0 10 -8`} />
									<path d={`M ${BREAK[1]} ${sy} q -8 0 -10 9`} />
								</>
							)}
						</g>
					);
				})}
				<path d={`M ${LEFT} ${y(1)} V ${y(STRINGS)} M ${RIGHT} ${y(1)} V ${y(STRINGS)}`} />
			</g>
			{["T", "A", "B"].map((ch, i) => (
				<text
					key={ch}
					x={(CLEF[0] + CLEF[1]) / 2}
					y={y(1) + 13 + i * 22}
					textAnchor="middle"
					dominantBaseline="central"
					fill="var(--gp-ink-3)"
					style={{ font: "700 15px var(--gp-f-disp)" }}
					aria-hidden
				>
					{ch}
				</text>
			))}
			{broken !== undefined && (
				<g
					role="button"
					tabIndex={0}
					aria-label={`Mend the snapped ${STRING_NAMES[broken - 1]} string`}
					className="status-press"
					onClick={() => {
						setMended(true);
						void play(OPEN_MIDI[broken - 1]);
					}}
					onKeyDown={onActivate(() => {
						setMended(true);
						void play(OPEN_MIDI[broken - 1]);
					})}
				>
					<rect x={BREAK[0] - 6} y={y(broken) - 11} width={BREAK[1] - BREAK[0] + 12} height={22} fill="transparent" />
				</g>
			)}
			{notes.map(([x, s, label]) => {
				const key = `${x}-${s}`;
				const fret = Number.parseInt(label, 10);
				const text = (
					<text
						key={pressed?.key === key ? `${key}-${pressed.run}` : key}
						x={x}
						y={y(s) + 1}
						textAnchor="middle"
						dominantBaseline="central"
						fill="currentColor"
						className={pressed?.key === key ? "status-pop" : undefined}
						style={{ font: "800 20px var(--gp-f-disp)" }}
					>
						{label}
					</text>
				);
				if (Number.isNaN(fret)) return <g key={key} aria-hidden>{text}</g>;
				const midi = OPEN_MIDI[s - 1] + fret;
				return (
					<g
						key={key}
						role="button"
						tabIndex={0}
						aria-label={`Play fret ${fret} on the ${STRING_NAMES[s - 1]} string`}
						className="status-press"
						onClick={() => sound(key, midi)}
						onKeyDown={onActivate(() => sound(key, midi))}
					>
						<rect x={x - 12} y={y(s) - 12} width={24} height={24} rx={6} fill="transparent" />
						{text}
					</g>
				);
			})}
		</svg>
	);
}
