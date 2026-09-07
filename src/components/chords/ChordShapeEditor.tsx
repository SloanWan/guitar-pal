"use client";

import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import {
	CHORD_SHAPE_WINDOW,
	MAX_FINGER,
	MAX_SHAPE_START_FRET,
	MUTED,
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
 * A chord shape, edited as the grid it is drawn as.
 *
 * Six columns, low E on the left, over the five frets of the diagram window. The
 * editing surface *is* the diagram rather than a form beside a preview: what the
 * player is choosing is a picture, and two representations of it would be two
 * things to keep in step.
 *
 * Controlled: the shape and every edit belong to the caller, so undo, dirty
 * checks and validation live in one place rather than being duplicated here.
 */

interface Props {
	shape: ChordShape;
	onChange: (shape: ChordShape) => void;
}

/** Low E first, matching GUITAR_OPEN_MIDI and every frets string in the app. */
const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];

export default function ChordShapeEditor({ shape, onChange }: Props) {
	/**
	 * Whether the player has set a finger by hand.
	 *
	 * Until they do, the fingering follows the shape: changing a note re-suggests
	 * the whole hand, which is what makes the suggestion useful rather than
	 * something to correct twice. After they do, it stays put — re-deciding for
	 * them would be arguing with an instruction.
	 */
	const [fingersTouched, setFingersTouched] = useState(false);
	/**
	 * The shortcut field: a shape written the way a tab writes it.
	 *
	 * Starts empty and is never written back to from the grid. It is a way in,
	 * not a second view of the shape — a field that re-wrote itself under the
	 * player's cursor every time they clicked a fret would be worse than one that
	 * simply holds what they typed.
	 */
	const [tabInput, setTabInput] = useState("");
	const tabParse = parseTabSequence(tabInput);
	// A sequence too short to be one yet is unfinished, not wrong: telling a
	// player their three characters are not six strings while they are still
	// typing the fourth is an error message about nothing.
	const tabError =
		tabInput.trim().length < TAB_STRING_COUNT ? null : tabParse.error;
	const tabFieldId = useId();
	const windowFrets = Array.from(
		{ length: CHORD_SHAPE_WINDOW },
		(_, i) => shape.startFret + i,
	);
	const validation = validateChordShape(shape);

	function setString(stringIdx: number, value: ChordShape["frets"][number]) {
		const frets = shape.frets.map((f, i) => (i === stringIdx ? value : f));
		// A barre that no longer has two strings under it is not a barre; dropping
		// it here means the editor cannot be left holding an invalid one.
		const next: ChordShape = { ...shape, frets };
		const stillBarred =
			next.barreFret !== null && stringsAtFret(next, next.barreFret).length >= 2;
		const settled: ChordShape = { ...next, barreFret: stillBarred ? next.barreFret : null };
		onChange(fingersTouched ? settled : { ...settled, fingers: suggestFingers(settled) });
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
		const startFret = Math.min(
			MAX_SHAPE_START_FRET,
			Math.max(1, shape.startFret + delta),
		);
		if (startFret === shape.startFret) return;
		// The window moves, the notes do not: a fret that falls outside is released
		// rather than silently transposed, which would rewrite the shape.
		const frets = shape.frets.map((f) =>
			f === MUTED || f === 0 || (f >= startFret && f <= startFret + CHORD_SHAPE_WINDOW - 1)
				? f
				: MUTED,
		);
		const next: ChordShape = { ...shape, startFret, frets };
		const stillBarred =
			next.barreFret !== null &&
			next.barreFret >= startFret &&
			next.barreFret <= startFret + CHORD_SHAPE_WINDOW - 1 &&
			stringsAtFret(next, next.barreFret).length >= 2;
		const settled: ChordShape = { ...next, barreFret: stillBarred ? next.barreFret : null };
		onChange(fingersTouched ? settled : { ...settled, fingers: suggestFingers(settled) });
	}

	function toggleBarre(fret: number) {
		const next: ChordShape = { ...shape, barreFret: shape.barreFret === fret ? null : fret };
		// A barre changes which finger holds what, so the suggestion follows it.
		onChange(fingersTouched ? next : { ...next, fingers: suggestFingers(next) });
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

	const cell =
		"flex h-7 w-7 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-denim hover:text-denim focus-visible:outline-2 focus-visible:outline-denim-accent focus-visible:outline-offset-[-2px]";
	const cellOn = "border-denim bg-denim text-on-denim hover:text-on-denim";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-start gap-3">
				{/* Where the window sits. The constraint on a shape is its span, not
				    its position, so this slides rather than limiting. */}
				<div className="flex flex-col items-center gap-1 pt-7">
					<button
						type="button"
						onClick={() => moveWindow(-1)}
						disabled={shape.startFret <= 1}
						aria-label="Move the window down a fret"
						className="flex h-6 w-7 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
					>
						<Minus size={10} />
					</button>
					<span className="font-mono text-[11px] tracking-[0.04em] text-ink-dim">
						{shape.startFret}
					</span>
					<button
						type="button"
						onClick={() => moveWindow(1)}
						disabled={shape.startFret >= MAX_SHAPE_START_FRET}
						aria-label="Move the window up a fret"
						className="flex h-6 w-7 items-center justify-center border border-line-strong text-ink-faint transition-colors hover:border-denim hover:text-denim disabled:cursor-not-allowed disabled:opacity-30"
					>
						<Plus size={10} />
					</button>
				</div>

				<div className="flex flex-col gap-1">
					{/* Above the nut: open, or not played at all. */}
					<div className="flex gap-1">
						{shape.frets.map((fret, stringIdx) => (
							<button
								key={stringIdx}
								type="button"
								onClick={() => toggleOpen(stringIdx)}
								aria-label={`String ${STRING_LABELS[stringIdx]}: ${fret === 0 ? "open" : "muted"}`}
								title={fret === 0 ? "Open — click to mute" : "Muted — click to open"}
								className={`${cell} font-mono text-[11px] ${fret === 0 ? "text-denim-accent" : ""}`}
							>
								{fret === 0 ? "o" : fret === MUTED ? "x" : "·"}
							</button>
						))}
					</div>

					{windowFrets.map((fret) => (
						<div key={fret} className="flex items-center gap-1">
							{shape.frets.map((held, stringIdx) => (
								<button
									key={stringIdx}
									type="button"
									onClick={() => toggleFret(stringIdx, fret)}
									aria-label={`String ${STRING_LABELS[stringIdx]}, fret ${fret}`}
									aria-pressed={held === fret}
									className={`${cell} ${held === fret ? cellOn : ""}`}
								>
									{held === fret ? (
										<span className="font-mono text-[11px]">
											{shape.fingers[stringIdx] || ""}
										</span>
									) : null}
								</button>
							))}
							<span className="ml-1 w-6 font-mono text-[10px] tracking-[0.04em] text-ink-faint">
								{fret}
							</span>
							<button
								type="button"
								onClick={() => toggleBarre(fret)}
								disabled={stringsAtFret(shape, fret).length < 2}
								aria-label={`Barre fret ${fret}`}
								aria-pressed={shape.barreFret === fret}
								title={
									stringsAtFret(shape, fret).length < 2
										? "A barre needs two strings held at this fret"
										: "Barre this fret"
								}
								className={`h-5 w-8 border font-mono text-[9px] uppercase tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
									shape.barreFret === fret
										? "border-denim bg-denim text-on-denim"
										: "border-line-strong text-ink-faint hover:border-denim hover:text-denim"
								}`}
							>
								Bar
							</button>
						</div>
					))}

					<div className="flex gap-1">
						{STRING_LABELS.map((name, i) => (
							<span
								key={i}
								className="w-7 text-center font-mono text-[10px] tracking-[0.04em] text-ink-faint"
							>
								{name}
							</span>
						))}
					</div>

					{/* Fingering, suggested and then the player's. Kept off the grid: a
					    cell click already means hold or release, and overloading it
					    would make releasing a string a four-click walk. */}
					<div className="mt-1 flex items-center gap-1">
						{shape.frets.map((fret, stringIdx) => {
							const held = typeof fret === "number" && fret > 0;
							return (
								<button
									key={stringIdx}
									type="button"
									onClick={() => cycleFinger(stringIdx)}
									disabled={!held}
									aria-label={`Finger on string ${STRING_LABELS[stringIdx]}`}
									title={held ? "Change the finger" : "Nothing held on this string"}
									className={`h-6 w-7 border font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
										shape.fingers[stringIdx] > 0
											? "border-denim text-denim-accent"
											: "border-line-strong text-ink-faint hover:border-denim hover:text-denim"
									}`}
								>
									{shape.fingers[stringIdx] || "–"}
								</button>
							);
						})}
						<span className="ml-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Fingers
						</span>
					</div>
				</div>
			</div>

			{!validation.ok && (
				<ul className="flex flex-col gap-0.5">
					{validation.errors.map((error) => (
						<li key={error} className="text-xs leading-snug text-destructive">
							{error}
						</li>
					))}
				</ul>
			)}

			<div className="border-t border-line" />

			{/* The written way in, under the drawn one. Reading a shape off a tab is
			    six keystrokes here and a dozen clicks on the grid, and a player
			    copying a chart already has the tab in front of them — but the grid is
			    what this control is, so it stays the thing you meet first. */}
			<div className="flex flex-col gap-1">
				<label
					htmlFor={tabFieldId}
					className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim"
				>
					Or, type in the tab sequence..
				</label>
				<input
					id={tabFieldId}
					type="text"
					inputMode="text"
					autoComplete="off"
					spellCheck={false}
					value={tabInput}
					onChange={(e) => applyTabSequence(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						// The field sits inside dialogs that save on Enter; drawing a shape
						// must not also close the thing being drawn in.
						e.preventDefault();
						e.stopPropagation();
						applyTabSequence(tabInput);
					}}
					placeholder="00750x"
					aria-label="Tab sequence, first string first"
					aria-describedby={`${tabFieldId}-hint`}
					className={`h-(--h-control) w-full border bg-surface px-2 font-mono text-xs tracking-[0.12em] text-ink placeholder:tracking-normal placeholder:text-ink-faint focus-visible:outline-none ${
						tabError ? "border-destructive" : "border-line-strong focus-visible:border-denim"
					}`}
				/>
				<p
					id={`${tabFieldId}-hint`}
					className={`font-mono text-[10px] leading-snug ${
						tabError ? "text-destructive" : "text-ink-faint"
					}`}
				>
					{tabError ??
						"First string first, x for a muted string — 00750x is Em7/A. Space the frets out above the ninth."}
				</p>
			</div>
		</div>
	);
}
