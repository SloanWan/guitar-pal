"use client";

import { useMemo, type CSSProperties } from "react";
import type { PageShape } from "@/lib/chordPage";
import type { ChordTone } from "@/lib/chordFormulas";
import {
	NECK_FRETS,
	NECK_FRET_NUMBERS,
	NECK_INLAYS,
	fretNoteX,
	fretWireX,
	neckDots,
	neckTones,
	shapeBox,
	shapeCentreX,
	spreadMarkers,
	stringY,
} from "@/lib/chordNeck";

/** Markers under the neck stay this far apart (% of its width), about a marker's width at its narrowest. */
const MARKER_GAP = 4.6;

interface Props {
	symbol: string;
	rootPc: number;
	tones: readonly ChordTone[] | null;
	shapes: readonly PageShape[];
	at: number;
	onSelect: (index: number) => void;
}

const pct = (n: number) => `${n}%`;

/** Every tone of the chord up to the 15th fret, the shape shown boxed, a marker per shape to jump to it. */
export default function ChordNeck({ symbol, rootPc, tones, shapes, at, onSelect }: Props) {
	const frets = shapes[at].def.frets;
	const dots = useMemo(() => neckDots(neckTones(rootPc, tones, frets), frets), [rootPc, tones, frets]);
	const box = shapeBox(frets);
	const markers = useMemo(() => spreadMarkers(shapes.map((s) => shapeCentreX(s.def.frets)), MARKER_GAP), [shapes]);

	return (
		<div className="ch-neck-scroll">
			<div className="ch-neck-in">
				<div className="ch-neck-nums" aria-hidden>
					{NECK_FRET_NUMBERS.map((n) => (
						<span key={n} style={{ left: pct(fretNoteX(n)) }}>
							{n}
						</span>
					))}
				</div>
				<div className="ch-neck" role="img" aria-label={`Fretboard with the tones of ${symbol}, shape ${at + 1} boxed`}>
					{NECK_INLAYS.map((f) => (
						<span key={f} className="ch-neck-inlay" style={{ left: pct(fretNoteX(f)) }} />
					))}
					<span className="ch-neck-inlay" style={{ left: pct(fretNoteX(12)), top: "30%" }} />
					<span className="ch-neck-inlay" style={{ left: pct(fretNoteX(12)), top: "70%" }} />
					{Array.from({ length: NECK_FRETS }, (_, k) => (
						<span key={k} className="ch-neck-fret" style={{ left: pct(fretWireX(k + 1)) }} />
					))}
					<span className="ch-neck-nut" style={{ left: pct(fretWireX(0)) }} />
					{[0, 1, 2, 3, 4, 5].map((s) => (
						<span key={s} className="ch-neck-string" style={{ top: pct(stringY(s)), left: pct(fretWireX(0)) }} />
					))}
					<span className="ch-neck-box" style={{ left: pct(box.left), width: pct(box.width) }} />
					{dots.map((d) => (
						<span
							key={`${d.string}-${d.fret}`}
							className="ch-neck-dot"
							data-root={d.root ? "" : undefined}
							data-held={d.held ? "" : undefined}
							style={{ left: pct(fretNoteX(d.fret)), top: pct(stringY(d.string)) } as CSSProperties}
						>
							{d.label}
						</span>
					))}
				</div>
				<div className="ch-neck-picks" role="group" aria-label="Jump to a shape on the neck">
					{shapes.map((s, i) => (
						<button
							key={s.id}
							type="button"
							className="gp-focus"
							aria-pressed={i === at}
							aria-label={`Shape ${i + 1}: ${s.label}`}
							data-mine={s.mine ? "" : undefined}
							style={{ left: pct(markers[i]) }}
							onClick={() => onSelect(i)}
						>
							{i + 1}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
