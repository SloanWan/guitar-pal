"use client";

import { Minus, Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { Field, Input } from "@/components/ui/input";
import "./chord-shape.css";
import {
	CHORD_SHAPE_WINDOW,
	MAX_FINGER,
	MAX_SHAPE_START_FRET,
	MUTED,
	fretInWindow,
	stringsAtFret,
	suggestFingers,
	validateChordShape,
	type ChordShape,
} from "@/lib/chordShape";
import {
	TAB_STRING_COUNT,
	parseTabSequence,
	tabSequenceToShape,
} from "@/lib/chordTabSequence";

/**
 * A chord shape, edited as the grid it is drawn as: six columns, low E on the
 * left, over the five frets of the window. Controlled — the caller owns the shape.
 */

interface Props {
	shape: ChordShape;
	onChange: (shape: ChordShape) => void;
}

/** Low E first, matching GUITAR_OPEN_MIDI and every frets string in the app. */
const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];

export default function ChordShapeEditor({ shape, onChange }: Props) {
	// Until the player sets a finger, the fingering is re-suggested on every edit.
	const [fingersTouched, setFingersTouched] = useState(false);
	// A way in, not a second view: never rewritten from the grid under the cursor.
	const [tabInput, setTabInput] = useState("");
	const tabParse = parseTabSequence(tabInput);
	// Fewer than six characters is still being typed, not wrong.
	const tabError =
		tabInput.trim().length < TAB_STRING_COUNT ? null : tabParse.error;
	const windowFrets = Array.from(
		{ length: CHORD_SHAPE_WINDOW },
		(_, i) => shape.startFret + i,
	);
	const validation = validateChordShape(shape);

	/**
	 * Hand an edit back: a barre left outside the window or with fewer than two
	 * strings under it is dropped, and the fingering follows the shape until the
	 * player has set a finger themselves.
	 */
	function commit(next: ChordShape) {
		const barre = next.barreFret;
		const barred =
			barre !== null && fretInWindow(barre, next.startFret) && stringsAtFret(next, barre).length >= 2;
		const settled: ChordShape = { ...next, barreFret: barred ? barre : null };
		onChange(fingersTouched ? settled : { ...settled, fingers: suggestFingers(settled) });
	}

	function setString(stringIdx: number, value: ChordShape["frets"][number]) {
		commit({ ...shape, frets: shape.frets.map((f, i) => (i === stringIdx ? value : f)) });
	}

	/** Fingering is optional, so the cycle passes through "none". */
	function cycleFinger(stringIdx: number) {
		setFingersTouched(true);
		const fingers = shape.fingers.map((f, i) =>
			i === stringIdx ? (f >= MAX_FINGER ? 0 : f + 1) : f,
		);
		onChange({ ...shape, fingers });
	}

	function toggleFret(stringIdx: number, fret: number) {
		setString(stringIdx, shape.frets[stringIdx] === fret ? MUTED : fret);
	}

	function toggleOpen(stringIdx: number) {
		setString(stringIdx, shape.frets[stringIdx] === 0 ? MUTED : 0);
	}

	function moveWindow(delta: number) {
		const startFret = Math.min(MAX_SHAPE_START_FRET, Math.max(1, shape.startFret + delta));
		if (startFret === shape.startFret) return;
		// The window moves, the notes do not: a fret that falls outside is released
		// rather than silently transposed.
		const frets = shape.frets.map((f) => (fretInWindow(f, startFret) ? f : MUTED));
		commit({ ...shape, startFret, frets });
	}

	function toggleBarre(fret: number) {
		commit({ ...shape, barreFret: shape.barreFret === fret ? null : fret });
	}

	/** Draw what has been typed, once it reads as a whole shape. */
	function applyTabSequence(value: string) {
		setTabInput(value);
		const { frets } = parseTabSequence(value);
		if (!frets) return;
		// The fingering follows the written shape, the same way it follows a shape
		// clicked out on the grid — a sequence is a way of drawing, not a paste.
		setFingersTouched(false);
		onChange(tabSequenceToShape(frets));
	}

	const held = (stringIdx: number) => {
		const fret = shape.frets[stringIdx];
		return typeof fret === "number" && fret > 0;
	};

	return (
		<div className="cs-editor">
			{/* The constraint on a shape is its span, not its position, so the window slides. */}
			<div className="cs-window">
				<span className="cs-lab">Window</span>
				<button
					type="button"
					className="cs-step gp-focus"
					onClick={() => moveWindow(-1)}
					disabled={shape.startFret <= 1}
					aria-label="Move the window down a fret"
				>
					<Minus aria-hidden />
				</button>
				<span className="cs-window-at">{shape.startFret === 1 ? "Nut" : `${shape.startFret}fr`}</span>
				<button
					type="button"
					className="cs-step gp-focus"
					onClick={() => moveWindow(1)}
					disabled={shape.startFret >= MAX_SHAPE_START_FRET}
					aria-label="Move the window up a fret"
				>
					<Plus aria-hidden />
				</button>
			</div>

			<div className="cs-grid" role="group" aria-label="Chord shape">
				<span />
				{STRING_LABELS.map((name, i) => (
					<span key={i} className="cs-string">
						{name}
					</span>
				))}
				<span />

				<span />
				{shape.frets.map((fret, stringIdx) => (
					<button
						key={stringIdx}
						type="button"
						className="cs-mark gp-focus"
						onClick={() => toggleOpen(stringIdx)}
						aria-label={`String ${STRING_LABELS[stringIdx]}: ${fret === 0 ? "open" : fret === MUTED ? "muted" : "fretted"}`}
						title={fret === 0 ? "Open — tap to mute" : "Tap to ring it open"}
					>
						{fret === 0 ? "o" : fret === MUTED ? "×" : ""}
					</button>
				))}
				<span />

				{windowFrets.map((fret, row) => (
					<Fragment key={fret}>
						<span className="cs-fret">{fret}</span>
						{shape.frets.map((at, stringIdx) => (
							<button
								key={stringIdx}
								type="button"
								className="cs-cell gp-focus"
								data-nut={row === 0 && shape.startFret === 1 ? "" : undefined}
								onClick={() => toggleFret(stringIdx, fret)}
								aria-label={`String ${STRING_LABELS[stringIdx]}, fret ${fret}`}
								aria-pressed={at === fret}
							>
								<i>{at === fret ? shape.fingers[stringIdx] || "" : ""}</i>
							</button>
						))}
						<button
							type="button"
							className="cs-barre gp-focus"
							onClick={() => toggleBarre(fret)}
							disabled={stringsAtFret(shape, fret).length < 2}
							aria-label={`Barre fret ${fret}`}
							aria-pressed={shape.barreFret === fret}
							title={
								stringsAtFret(shape, fret).length < 2
									? "A barre needs two strings held at this fret"
									: "Barre this fret"
							}
						>
							Barre
						</button>
					</Fragment>
				))}

				{/* Kept off the grid: a cell tap already means hold or release. */}
				<span className="cs-lab cs-fingers-lab">Fingers</span>
				<span />
				{shape.frets.map((_, stringIdx) => (
					<button
						key={stringIdx}
						type="button"
						className="cs-finger gp-focus"
						onClick={() => cycleFinger(stringIdx)}
						disabled={!held(stringIdx)}
						aria-label={`Finger on string ${STRING_LABELS[stringIdx]}`}
						title={held(stringIdx) ? "Change the finger" : "Nothing held on this string"}
					>
						{shape.fingers[stringIdx] || "–"}
					</button>
				))}
				<span />
			</div>

			{!validation.ok && (
				<ul className="cs-errors">
					{validation.errors.map((error) => (
						<li key={error}>{error}</li>
					))}
				</ul>
			)}

			<Field
				label="Or type it, first string first"
				help="High e down to low E: 00750x is Em7/A. x mutes a string; space the frets out above the ninth."
				error={tabError ?? undefined}
			>
				{(control) => (
					<Input
						{...control}
						className="cs-tab"
						type="text"
						autoComplete="off"
						spellCheck={false}
						value={tabInput}
						onChange={(e) => applyTabSequence(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== "Enter") return;
							// Inside dialogs that save on Enter: drawing must not also close them.
							e.preventDefault();
							e.stopPropagation();
							applyTabSequence(tabInput);
						}}
						placeholder="00750x"
					/>
				)}
			</Field>
		</div>
	);
}
