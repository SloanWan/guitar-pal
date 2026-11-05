"use client";

import { useState } from "react";
import type { Duration, EffectKind, FingerpickPattern, NoteEffects, PercussionKind, Stroke } from "@/lib/fingerpickTypes";
import {
	MAX_FRET,
	STRING_LABELS,
	deleteSlots,
	duplicateSlots,
	insertSlots,
	remapMeasure,
	resetMeasure,
	setFret,
	setInactive,
	setSlotsRest,
	toggleMuted,
	withMeasures,
	type Cell,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { clearNoteMarks, setLink, setPercussion, toggleSpanOver } from "@/lib/fingerpickTechniqueEdit";
import { effectOnNotes, linkOnNotes, type NotesEdit } from "@/lib/tabEditorCursor";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import {
	clearString,
	measureDiffersFromHints,
	patternCapo,
	replaceMeasureWithHints,
	replaceRowWithHints,
	rowDiffersFromHints,
} from "@/lib/fingerpickChords";
import { isCompound } from "@/lib/strumMeter";
import { BEND_HEIGHTS_SEMITONES } from "@/lib/techniqueRegistry";
import { BEND_HEIGHT_LABEL, DEFAULT_PARAMS, VARIANTS } from "@/lib/techniqueEditDefaults";
import {
	INSPECTOR_HITS,
	applyPick,
	applySweep,
	replaceWithShape,
	effectOptions,
	hitOf,
	linkOptions,
	pickOf,
	runSounds,
	sectionsFor,
	spanOptions,
	strokeOf,
	type InspectorOption,
	type InspectorTab,
	type PickDirection,
} from "@/lib/tabEditorInspector";
import { barFill } from "@/lib/tabEditorTools";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import InspectorChord from "./InspectorChord";
import InspectorPick from "./InspectorPick";
import type { ChordTools } from "./useChordTools";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	cursor: Cell;
	/** The run edits act on: the selection, or the cursor's slot. */
	slots: readonly SlotTarget[];
	/** The notes a note's edit goes on: a block's notes (#437), or the cursor's cell. */
	notes: readonly Cell[];
	/** Some of the notes could not take an edit: said where the player sees it. */
	onSkipped: (message: string) => void;
	/** The cursor to another string, or to a slot an edit made. */
	onCursor: (cell: Cell) => void;
	/** The chords in effect, their shapes and the search's index. */
	chordTools: ChordTools;
	/** Beside the tab every section shows; in the phone's sheet one tab at a time. */
	only?: InspectorTab;
}

const STROKES: readonly { value: Stroke | "none"; label: string }[] = [
	{ value: "none", label: "Off" },
	{ value: "roll-down", label: "Roll ↓" },
	{ value: "roll-up", label: "Roll ↑" },
	{ value: "brush-down", label: "Brush ↓" },
	{ value: "brush-up", label: "Brush ↑" },
];

// The pick stroke printed over a column: ⊓ down, V up (#440).
const PICKS: readonly { value: PickDirection | "none"; label: string }[] = [
	{ value: "none", label: "Off" },
	{ value: "down", label: "Down ⊓" },
	{ value: "up", label: "Up V" },
];

const SIMPLE_FILLS: readonly { value: Duration; label: string }[] = [
	{ value: "quarter", label: "¼" },
	{ value: "eighth", label: "⅛" },
	{ value: "eighth-triplet", label: "⅛³" },
	{ value: "sixteenth", label: "1/16" },
	{ value: "32nd", label: "1/32" },
];
const COMPOUND_FILLS: readonly { value: Duration; label: string }[] = [
	{ value: "dotted-quarter", label: "¼." },
	{ value: "eighth", label: "⅛" },
	{ value: "sixteenth", label: "1/16" },
];

/** Blocked options' reasons, as text: one line a reason, naming every option it blocks. */
function Reasons<K extends string>({ options }: { options: readonly InspectorOption<K>[] }) {
	const byReason = new Map<string, string[]>();
	for (const o of options) if (o.reason) byReason.set(o.reason, [...(byReason.get(o.reason) ?? []), o.label]);
	return (
		<p className="te-why">
			{[...byReason].map(([reason, labels]) => (
				<span key={reason}>
					{labels.join(", ")}: {reason}.{" "}
				</span>
			))}
		</p>
	);
}

/**
 * The inspector (#361): the note at the cursor, its link and effects, the spans
 * over the run, the slot's sweep, hit and column, and the bar — every list the
 * technique registry's, every blocked choice disabled with its reason written
 * out. Writes go through the lib's edits and `commit`, so each is one undo.
 */
export default function EditorInspector({ working, commit, cursor, slots, notes, onSkipped, onCursor, chordTools, only }: Props) {
	const [fillAsk, setFillAsk] = useState<{ duration: Duration; cleared: FingerpickPattern } | null>(null);
	const [wholeAsk, setWholeAsk] = useState<FingerpickPattern | null>(null);
	// Swept slots holding notes outside the shape: replace them with it?
	const [sweepAsk, setSweepAsk] = useState<SlotTarget[] | null>(null);
	const shown = (tab: InspectorTab) => only === undefined || only === tab;
	const can = sectionsFor(slots.length);
	const m = cursor.measureIndex;
	const measure = working.measures[m];
	const note = measure?.slots[cursor.slotIndex]?.strings[cursor.stringIndex];
	const capo = patternCapo(working);
	const fret = note?.fret ?? null;
	// A block's edits follow its lead note: the cursor's, else the block's first.
	const sfAt = (c: Cell) => working.measures[c.measureIndex]?.slots[c.slotIndex]?.strings[c.stringIndex];
	const lead = notes.find((c) => c.measureIndex === cursor.measureIndex && c.slotIndex === cursor.slotIndex && c.stringIndex === cursor.stringIndex) ?? notes[0] ?? cursor;
	const leadNote = sfAt(lead);
	const links = linkOptions(working, lead);
	const effects = effectOptions(working, lead);
	const spans = spanOptions(working, slots);
	const stroke = strokeOf(working, slots);
	const { hit, accent } = hitOf(working, slots);
	const pick = pickOf(working, slots);
	const pickable = runSounds(working, slots);
	const restAll = slots.length > 0 && slots.every((t) => working.measures[t.measureIndex]?.slots[t.slotIndex]?.isRest === true);
	const fill = measure ? barFill(measure, working.timeSignature) : null;
	// The shape's frets under each slot of the cursor's bar, for snapping to them.
	const hintFor = (slotIndex: number) => chordTools.hintsAt(m, slotIndex);
	const rowOff = measure ? rowDiffersFromHints(measure, cursor.stringIndex, hintFor) : false;
	const rowHasNotes = measure?.slots.some((slot) => slot.strings[cursor.stringIndex].fret !== null || slot.strings[cursor.stringIndex].muted) ?? false;
	const barOff = measure ? measureDiffersFromHints(measure, hintFor) : false;
	const stringName = STRING_LABELS[cursor.stringIndex];
	const where = slots.length > 1 ? `${slots.length} slots` : notes.length > 1 ? `${notes.length} notes` : `bar ${m + 1} · slot ${cursor.slotIndex + 1}`;

	// A note's edit goes on every note of a block; the ones that cannot take it are counted.
	function onNotes(done: NotesEdit) {
		commit(() => done.pattern);
		if (done.skipped) onSkipped(`${done.skipped} of the ${notes.length} selected notes could not take it`);
	}
	const having = (kind: EffectKind) => notes.filter((c) => sfAt(c)?.effects?.[kind] !== undefined);
	function toggleEffect(kind: EffectKind, on: boolean) {
		onNotes(effectOnNotes(working, on ? having(kind) : notes, kind, on ? null : (DEFAULT_PARAMS[kind] as NoteEffects[typeof kind])));
	}
	function setBend(next: Partial<NonNullable<NoteEffects["bend"]>>) {
		const bend = leadNote?.effects?.bend;
		if (bend) onNotes(effectOnNotes(working, having("bend"), "bend", { ...bend, ...next }));
	}
	function forNotes(edit: (p: FingerpickPattern, c: Cell) => FingerpickPattern) {
		commit((p) => notes.reduce(edit, p));
	}
	function forRun(edit: (p: FingerpickPattern, t: SlotTarget) => FingerpickPattern) {
		commit((p) => slots.reduce(edit, p));
	}
	function fillBar(duration: Duration) {
		const reset = resetMeasure(working.measures, m, duration, working.timeSignature);
		const cleared = withMeasures(working, reset.measures);
		if (reset.type === "confirm") setFillAsk({ duration, cleared });
		else {
			commit(() => cleared);
			onCursor({ ...cursor, slotIndex: 0 });
		}
	}

	return (
		<div className="te-insp-in" data-m="tab">
			{shown("note") && (
				<section className="te-grp" aria-label="Note">
					<h2>
						Note <span className="pb-lab pb-num">{where}</span>
					</h2>
					{!can.note ? (
						<p className="te-why">A run is selected: pick one slot to edit its note.</p>
					) : (
						<>
							<div className="te-irow">
								<span className="te-rl">String</span>
								<Segmented
									label="String"
									dense
									full
									options={STRING_LABELS.map((s, i) => ({ value: String(i), label: s }))}
									value={String(cursor.stringIndex)}
									onChange={(v) => onCursor({ ...cursor, stringIndex: Number(v) })}
								/>
							</div>
							<div className="te-irow">
								<span className="te-rl">Fret</span>
								<span className="te-stp">
									<button
										type="button"
										className="te-chip"
										aria-label="Fret down"
										disabled={fret === null || fret <= 0}
										onClick={() => fret !== null && commit((p) => setFret(p, cursor, fret - 1))}
									>
										−
									</button>
									<output className="pb-num">{note?.muted ? "x" : (fret ?? "–")}</output>
									<button
										type="button"
										className="te-chip"
										aria-label="Fret up"
										disabled={fret !== null && fret >= MAX_FRET}
										onClick={() => commit((p) => setFret(p, cursor, fret === null ? 0 : fret + 1))}
									>
										+
									</button>
								</span>
								<span className="te-why">
									{fret !== null
										? `Sounds ${pitchLabel(soundingMidi(cursor.stringIndex, fret, capo), "scientific")}${capo ? ` with the capo at ${capo}` : ""}`
										: note?.muted
											? "An x: a dead note — a slap under the slot's S hit"
											: "No note on this string"}
								</span>
							</div>
							<div className="te-ib3">
								<button
									type="button"
									className="te-chip"
									aria-pressed={leadNote?.muted === true}
									onClick={() => {
										const allX = notes.every((c) => sfAt(c)?.muted === true);
										forNotes((p, c) => (allX ? setInactive(p, c) : sfAt(c)?.muted ? p : toggleMuted(p, c)));
									}}
								>
									x dead note
								</button>
								<button
									type="button"
									className="te-chip"
									disabled={fret === null && !note?.muted && notes.length <= 1}
									onClick={() => forNotes(setInactive)}
								>
									Clear
								</button>
								<button
									type="button"
									className="te-chip"
									disabled={notes.every((c) => !sfAt(c)?.link && !sfAt(c)?.effects)}
									onClick={() => forNotes(clearNoteMarks)}
								>
									No marks
								</button>
							</div>
							<h3>
								The {stringName} string in bar {m + 1}
							</h3>
							<div className="te-chips">
								<button
									type="button"
									className="te-chip"
									disabled={!rowOff}
									title={rowOff ? undefined : "Every note on it already plays the chord's shape"}
									onClick={() => commit((p) => replaceRowWithHints(p, m, cursor.stringIndex, hintFor))}
								>
									Snap to the shape
								</button>
								<button
									type="button"
									className="te-chip"
									disabled={!rowHasNotes}
									onClick={() => commit((p) => clearString(p, cursor.stringIndex, m))}
								>
									Clear the string
								</button>
							</div>
							{!rowOff && rowHasNotes && <p className="te-why">Its notes already play the chord&apos;s shape.</p>}
							<h3>Link from the note before</h3>
							<div className="te-chips">
								<button
									type="button"
									className="te-chip"
									aria-pressed={!leadNote?.link}
									onClick={() => onNotes(linkOnNotes(working, notes, null))}
								>
									None
								</button>
								{links.map((o) => (
									<button
										key={o.kind}
										type="button"
										className="te-chip"
										aria-pressed={o.on}
										disabled={o.reason !== null}
										onClick={() =>
											onNotes(
												o.on
													? linkOnNotes(working, notes.filter((c) => sfAt(c)?.link?.kind === o.kind), null)
													: linkOnNotes(working, notes, { kind: o.kind }),
											)
										}
									>
										{o.label}
										{o.key && <kbd>{o.key}</kbd>}
									</button>
								))}
							</div>
							<Reasons options={links} />
							<Switch
								label="Shift slide: pick the second note again"
								checked={leadNote?.link?.kind === "slide" && leadNote.link.picked === true}
								disabled={leadNote?.link?.kind !== "slide"}
								onCheckedChange={(on) =>
									commit((p) =>
										notes
											.filter((c) => sfAt(c)?.link?.kind === "slide")
											.reduce((q, c) => setLink(q, c, { kind: "slide", ...(on ? { picked: true } : {}) }), p),
									)
								}
							/>
						</>
					)}
				</section>
			)}

			{shown("effects") && (
				<section className="te-grp" aria-label="Effects">
					<h2>
						Effects <span className="pb-lab">on this note</span>
					</h2>
					{can.effects ? (
						<>
							<div className="te-chips">
								{effects.map((o) => (
									<button
										key={o.kind}
										type="button"
										className="te-chip"
										aria-pressed={o.on}
										disabled={o.reason !== null}
										onClick={() => toggleEffect(o.kind, o.on)}
									>
										{o.label}
										{o.key && <kbd>{o.key}</kbd>}
									</button>
								))}
							</div>
							<Reasons options={effects} />
							{leadNote?.effects?.bend && (
								<>
									<div className="te-irow">
										<span className="te-rl">Bend</span>
										<div className="te-chips">
											{BEND_HEIGHTS_SEMITONES.map((h) => (
												<button
													key={h}
													type="button"
													className="te-chip"
													aria-pressed={leadNote.effects?.bend?.semitones === h}
													disabled={fret !== null && fret + Math.ceil(h) > MAX_FRET}
													onClick={() => setBend({ semitones: h })}
												>
													{BEND_HEIGHT_LABEL[h]}
												</button>
											))}
										</div>
									</div>
									<div className="te-chips te-indent">
										{(["pre", "release", "hold"] as const).map((flag) => (
											<button
												key={flag}
												type="button"
												className="te-chip"
												aria-pressed={leadNote.effects?.bend?.[flag] === true}
												onClick={() => setBend({ [flag]: !leadNote.effects?.bend?.[flag] })}
											>
												{flag === "pre" ? "Pre-bend" : flag === "release" ? "Release" : "Hold"}
											</button>
										))}
									</div>
								</>
							)}
							{leadNote?.effects?.vibrato && (
								<div className="te-irow">
									<span className="te-rl">Vibrato</span>
									<Segmented
										label="Vibrato width"
										dense
										options={[
											{ value: "normal", label: "Normal" },
											{ value: "wide", label: "Wide" },
										]}
										value={leadNote.effects.vibrato.wide ? "wide" : "normal"}
										onChange={(v) => onNotes(effectOnNotes(working, having("vibrato"), "vibrato", v === "wide" ? { wide: true } : {}))}
									/>
								</div>
							)}
							{effects
								.filter((o) => o.on && VARIANTS[o.kind])
								.map((o) => (
									<div key={o.kind} className="te-irow">
										<span className="te-rl">{o.label}</span>
										<div className="te-chips">
											{(VARIANTS[o.kind] ?? []).map((v) => (
												<button
													key={v.label}
													type="button"
													className="te-chip"
													title={v.title}
													aria-pressed={JSON.stringify(leadNote?.effects?.[o.kind]) === JSON.stringify(v.params)}
													onClick={() => onNotes(effectOnNotes(working, having(o.kind), o.kind, v.params as NoteEffects[typeof o.kind]))}
												>
													{v.label}
												</button>
											))}
										</div>
									</div>
								))}
						</>
					) : (
						<p className="te-why">A run is selected: pick one slot to shape its note.</p>
					)}
					<h3>
						Spans <span className="pb-lab">over {slots.length > 1 ? `the ${slots.length} slots` : "this slot"}</span>
					</h3>
					<div className="te-chips">
						{spans.map((o) => (
							<button
								key={o.kind}
								type="button"
								className="te-chip"
								aria-pressed={o.on}
								onClick={() => commit((p) => toggleSpanOver(p, o.kind, slots))}
							>
								{o.label}
								{o.key && <kbd>{o.key}</kbd>}
							</button>
						))}
					</div>
				</section>
			)}

			{shown("slot") && (
				<section className="te-grp" aria-label="Slot">
					<h2>
						Slot <span className="pb-lab pb-num">{where}</span>
					</h2>
					<InspectorChord working={working} commit={commit} slots={slots} tools={chordTools} />
					<h3>Sweep {stroke.kind === "mixed" && <span className="pb-lab">mixed</span>}</h3>
					<div className="te-chips" role="group" aria-label="Sweep">
						{STROKES.map((o) => (
							<button
								key={o.value}
								type="button"
								className="te-chip"
								aria-pressed={stroke.kind === "one" && stroke.value === o.value}
								onClick={() => {
									const swept = applySweep(working, slots, o.value === "none" ? undefined : o.value, chordTools.voicingAt);
									commit(() => swept.pattern);
									setSweepAsk(swept.offShape.length > 0 ? swept.offShape : null);
								}}
							>
								{o.label}
							</button>
						))}
					</div>
					{sweepAsk && (
						<div className="te-ask" role="alertdialog" aria-label="Overwrite with the shape">
							<span>
								{sweepAsk.length === 1 ? "This slot has" : `${sweepAsk.length} slots have`} notes outside the chord&apos;s
								shape. Overwrite {sweepAsk.length === 1 ? "it" : "them"} with the shape?
							</span>
							<div className="te-ask-row">
								<Button
									size="xs"
									onClick={() => {
										commit((p) => replaceWithShape(p, sweepAsk, chordTools.voicingAt));
										setSweepAsk(null);
									}}
								>
									Overwrite
								</Button>
								<Button size="xs" variant="ghost" onClick={() => setSweepAsk(null)}>
									Keep the notes
								</Button>
							</div>
						</div>
					)}
					<h3>Pick stroke {pick.kind === "mixed" && <span className="pb-lab">mixed</span>}</h3>
					<div className="te-chips" role="group" aria-label="Pick stroke">
						{PICKS.map((o) => (
							<button
								key={o.value}
								type="button"
								className="te-chip"
								disabled={!pickable}
								aria-pressed={pickable && pick.kind === "one" && pick.value === o.value}
								onClick={() => commit((p) => applyPick(p, slots, o.value === "none" ? null : o.value))}
							>
								{o.label}
							</button>
						))}
					</div>
					<h3>Hit {hit.kind === "mixed" && <span className="pb-lab">mixed</span>}</h3>
					<div className="te-chips" role="group" aria-label="Hit">
						{[{ kind: "none", label: "Off" }, ...INSPECTOR_HITS.map((t) => ({ kind: t.kind, label: t.label.en }))].map((o) => (
							<button
								key={o.kind}
								type="button"
								className="te-chip"
								aria-pressed={hit.kind === "one" && hit.value === o.kind}
								onClick={() =>
									forRun((p, t) => setPercussion(p, t, o.kind === "none" ? undefined : { kind: o.kind as PercussionKind }))
								}
							>
								{o.label}
							</button>
						))}
					</div>
					<div className="te-irow">
						<Switch
							label="Accent"
							checked={accent.kind === "one" && accent.value}
							disabled={hit.kind === "one" && hit.value === "none"}
							onCheckedChange={(on) =>
								forRun((p, t) => {
									const current = p.measures[t.measureIndex]?.slots[t.slotIndex]?.percussion;
									return current ? setPercussion(p, t, { kind: current.kind, ...(on ? { accent: true } : {}) }) : p;
								})
							}
						/>
					</div>
					<h3>This slot</h3>
					<div className="te-ib2">
						<button
							type="button"
							className="te-chip"
							onClick={() => commit((p) => insertSlots(p, [...slots], "before"))}
						>
							Insert before
						</button>
						<button
							type="button"
							className="te-chip"
							onClick={() => {
								commit((p) => insertSlots(p, [...slots], "after"));
								onCursor({ ...cursor, slotIndex: cursor.slotIndex + 1 });
							}}
						>
							Insert after
						</button>
						<button type="button" className="te-chip" onClick={() => commit((p) => duplicateSlots(p, [...slots]))}>
							Duplicate
						</button>
						<button type="button" className="te-chip" data-bad="" onClick={() => commit((p) => deleteSlots(p, [...slots]))}>
							Delete
						</button>
						<button
							type="button"
							className="te-chip"
							onClick={() => {
								const reset = resetMeasure(working.measures, m, "whole", working.timeSignature);
								const next = withMeasures(working, reset.measures);
								if (reset.type === "confirm") setWholeAsk(next);
								else commit(() => next);
							}}
						>
							One whole note
						</button>
						<button
							type="button"
							className="te-chip"
							aria-pressed={restAll}
							title="Rest: keeps the length, clears the notes"
							onClick={() => commit((p) => setSlotsRest(p, [...slots], !restAll))}
						>
							Rest
							<kbd>R</kbd>
						</button>
					</div>
					{wholeAsk && (
						<div className="te-ask" role="alertdialog" aria-label="Replace the bar">
							<span>Bar {m + 1} has notes. Replace it with one whole note and lose them?</span>
							<div className="te-ask-row">
								<Button
									size="xs"
									variant="danger"
									onClick={() => {
										commit(() => wholeAsk);
										setWholeAsk(null);
										onCursor({ ...cursor, slotIndex: 0 });
									}}
								>
									Replace
								</Button>
								<Button size="xs" variant="ghost" onClick={() => setWholeAsk(null)}>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</section>
			)}

			{shown("bar") && (
				<section className="te-grp" aria-label="Bar">
					<h2>
						Bar {m + 1}{" "}
						{fill && (
							<span className="te-fillnote" data-kind={fill.kind}>
								{fill.text}
							</span>
						)}
					</h2>
					<div className="te-chips">
						<button
							type="button"
							className="te-chip"
							disabled={!barOff}
							onClick={() => commit((p) => replaceMeasureWithHints(p, m, hintFor))}
						>
							Snap the bar to its chord shapes
						</button>
					</div>
					{!barOff && <p className="te-why">Every fretted note already plays the shape of its chord.</p>}
					<h3>Fill the bar with</h3>
					<div className="te-chips">
						{(isCompound(working.timeSignature) ? COMPOUND_FILLS : SIMPLE_FILLS).map((f) => (
							<button key={f.value} type="button" className="te-chip" onClick={() => fillBar(f.value)}>
								{f.label}
							</button>
						))}
					</div>
					{fillAsk && (
						<div className="te-ask" role="alertdialog" aria-label="Fill the bar">
							<span>Bar {m + 1} has notes. Move them onto the new slots, or clear them?</span>
							<div className="te-ask-row">
								<Button
									size="xs"
									onClick={() => {
										commit((p) => withMeasures(p, remapMeasure(p.measures, m, fillAsk.duration, p.timeSignature)));
										setFillAsk(null);
										onCursor({ ...cursor, slotIndex: 0 });
									}}
								>
									Remap
								</Button>
								<Button
									size="xs"
									variant="secondary"
									onClick={() => {
										commit(() => fillAsk.cleared);
										setFillAsk(null);
										onCursor({ ...cursor, slotIndex: 0 });
									}}
								>
									Clear
								</Button>
								<Button size="xs" variant="ghost" onClick={() => setFillAsk(null)}>
									Cancel
								</Button>
							</div>
						</div>
					)}
					<InspectorPick working={working} commit={commit} measureIndex={m} tools={chordTools} />
				</section>
			)}
		</div>
	);
}
