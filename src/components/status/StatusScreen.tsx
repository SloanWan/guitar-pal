import type { ReactNode } from "react";

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

/**
 * A short TAB staff for the status pages: fret numbers on strings, and
 * optionally one string drawn snapped — the 404's "4 0 4", the error page's
 * broken string. Decorative; the heading beside it says the same in words.
 */
export function StatusTab({
	notes,
	snapped,
}: {
	/** [x, string 1–6 from the top, label] */
	notes: readonly (readonly [number, number, string])[];
	/** The string (1–6) drawn broken in the middle, if any. */
	snapped?: number;
}) {
	const y = (s: number) => TOP + (s - 1) * GAP;
	const height = TOP * 2 + (STRINGS - 1) * GAP;
	return (
		<svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-[236px] max-w-full text-gp-ink" aria-hidden="true">
			<g fill="none" stroke="var(--gp-edge)" strokeWidth="1.5" strokeLinecap="round">
				{Array.from({ length: STRINGS }, (_, i) => {
					const s = i + 1;
					const sy = y(s);
					const gaps = [
						CLEF,
						...notes.filter((n) => n[1] === s).map(([x]) => [x - NOTE_HALF, x + NOTE_HALF] as const),
						...(s === snapped ? [BREAK] : []),
					];
					return (
						<g key={s}>
							{cut(LEFT, RIGHT, gaps).map(([a, b]) => (
								<path key={a} d={`M ${a} ${sy} H ${b}`} />
							))}
							{s === snapped && (
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
				>
					{ch}
				</text>
			))}
			{notes.map(([x, s, label]) => (
				<text
					key={`${x}-${s}`}
					x={x}
					y={y(s) + 1}
					textAnchor="middle"
					dominantBaseline="central"
					fill="currentColor"
					style={{ font: "800 20px var(--gp-f-disp)" }}
				>
					{label}
				</text>
			))}
		</svg>
	);
}

/**
 * The frame the 404 and error pages share: a picture, a heading, a sentence,
 * then whatever the page offers (a video, the buttons). One centred column;
 * the shell around it keeps the way out.
 */
export default function StatusScreen({
	art,
	title,
	lead,
	children,
}: {
	art: ReactNode;
	title: string;
	lead: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-full flex-col justify-center py-12 max-sm:py-8">
			<div className="w-full px-(--gp-gutter-phone) min-[720px]:px-(--gp-gutter-tablet) min-[960px]:px-(--gp-gutter-desktop)">
				<div className="mx-auto flex max-w-140 flex-col items-center text-center">
					{art}
					<h1 className="mt-7 font-gp-display text-(length:--gp-t-xl) leading-(--gp-lh-head) font-bold tracking-[-0.015em] text-balance text-gp-ink min-[960px]:text-(length:--gp-t-xl-lg)">
						{title}
					</h1>
					<p className="mt-2 text-(length:--gp-t-body) leading-(--gp-lh-body) text-pretty text-gp-ink-2">
						{lead}
					</p>
					<div className="mt-7 flex w-full flex-col items-center gap-6">{children}</div>
				</div>
			</div>
		</div>
	);
}
