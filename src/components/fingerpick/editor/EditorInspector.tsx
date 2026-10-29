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
	setStroke,
	toggleMuted,
	withMeasures,
	type Cell,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { clearNoteMarks, setEffect, setLink, setPercussion, toggleLink, toggleSpanOver } from "@/lib/fingerpickTechniqueEdit";
import { pitchLabel, soundingMidi } from "@/lib/fingerpickPitch";
import { patternCapo } from "@/lib/fingerpickChords";
import { isCompound } from "@/lib/strumMeter";
import { BEND_HEIGHTS_SEMITONES } from "@/lib/techniqueRegistry";
import { BEND_HEIGHT_LABEL, DEFAULT_PARAMS, VARIANTS } from "@/lib/techniqueEditDefaults";
import {
	INSPECTOR_HITS,
	effectOptions,
	hitOf,
	linkOptions,
	sectionsFor,
	spanOptions,
	strokeOf,
	type InspectorOption,
	type InspectorTab,
} from "@/lib/tabEditorInspector";
import { barFill } from "@/lib/tabEditorTools";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	cursor: Cell;
	/** The run edits act on: the selection, or the cursor's slot. */
	slots: readonly SlotTarget[];
	/** The cursor to another string, or to a slot an edit made. */
	onCursor: (cell: Cell) => void;
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
export default function EditorInspector({ working, commit, cursor, slots, onCursor, only }: Props) {
	const [fillAsk, setFillAsk] = useState<{ duration: Duration; cleared: FingerpickPattern } | null>(null);
	const [wholeAsk, setWholeAsk] = useState<FingerpickPattern | null>(null);
	const shown = (tab: InspectorTab) => only === undefined || only === tab;
	const can = sectionsFor(slots.length);
	const m = cursor.measureIndex;
	const measure = working.measures[m];
	const note = measure?.slots[cursor.slotIndex]?.strings[cursor.stringIndex];
	const capo = patternCapo(working);
	const fret = note?.fret ?? null;
	const links = linkOptions(working, cursor);
	const effects = effectOptions(working, cursor);
	const spans = spanOptions(working, slots);
	const stroke = strokeOf(working, slots);
	const { hit, accent } = hitOf(working, slots);
	const fill = measure ? barFill(measure, working.timeSignature) : null;
	const where = slots.length > 1 ? `${slots.length} slots` : `bar ${m + 1} · slot ${cursor.slotIndex + 1}`;

	function toggleEffect(kind: EffectKind, on: boolean) {
		commit((p) => setEffect(p, cursor, kind, on ? null : (DEFAULT_PARAMS[kind] as NoteEffects[typeof kind])));
	}
	function setBend(next: Partial<NonNullable<NoteEffects["bend"]>>) {
		const bend = note?.effects?.bend;
		if (bend) commit((p) => setEffect(p, cursor, "bend", { ...bend, ...next }));
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
											? "An x: a slap on the string"
											: "No note on this string"}
								</span>
							</div>
							<div className="te-ib3">
								<button type="button" className="te-chip" aria-pressed={note?.muted === true} onClick={() => commit((p) => toggleMuted(p, cursor))}>
									x slap
								</button>
								<button
									type="button"
									className="te-chip"
									disabled={fret === null && !note?.muted}
									onClick={() => commit((p) => setInactive(p, cursor))}
								>
									Clear
								</button>
								<button
									type="button"
									className="te-chip"
									disabled={!note?.link && !note?.effects}
									onClick={() => commit((p) => clearNoteMarks(p, cursor))}
								>
									No marks
								</button>
							</div>
							<h3>Link from the note before</h3>
							<div className="te-chips">
								<button
									type="button"
									className="te-chip"
									aria-pressed={!note?.link}
									onClick={() => commit((p) => setLink(p, cursor, null))}
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
										onClick={() => commit((p) => toggleLink(p, cursor, o.kind))}
									>
										{o.label}
										{o.key && <kbd>{o.key}</kbd>}
									</button>
								))}
							</div>
							<Reasons options={links} />
							<Switch
								label="Shift slide: pick the second note again"
								checked={note?.link?.kind === "slide" && note.link.picked === true}
								disabled={note?.link?.kind !== "slide"}
								onCheckedChange={(on) => commit((p) => setLink(p, cursor, { kind: "slide", ...(on ? { picked: true } : {}) }))}
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
							{note?.effects?.bend && (
								<>
									<div className="te-irow">
										<span className="te-rl">Bend</span>
										<div className="te-chips">
											{BEND_HEIGHTS_SEMITONES.map((h) => (
												<button
													key={h}
													type="button"
													className="te-chip"
													aria-pressed={note.effects?.bend?.semitones === h}
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
												aria-pressed={note.effects?.bend?.[flag] === true}
												onClick={() => setBend({ [flag]: !note.effects?.bend?.[flag] })}
											>
												{flag === "pre" ? "Pre-bend" : flag === "release" ? "Release" : "Hold"}
											</button>
										))}
									</div>
								</>
							)}
							{note?.effects?.vibrato && (
								<div className="te-irow">
									<span className="te-rl">Vibrato</span>
									<Segmented
										label="Vibrato width"
										dense
										options={[
											{ value: "normal", label: "Normal" },
											{ value: "wide", label: "Wide" },
										]}
										value={note.effects.vibrato.wide ? "wide" : "normal"}
										onChange={(v) => commit((p) => setEffect(p, cursor, "vibrato", v === "wide" ? { wide: true } : {}))}
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
													aria-pressed={JSON.stringify(note?.effects?.[o.kind]) === JSON.stringify(v.params)}
													onClick={() => commit((p) => setEffect(p, cursor, o.kind, v.params as NoteEffects[typeof o.kind]))}
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
					<h3>Sweep {stroke.kind === "mixed" && <span className="pb-lab">mixed</span>}</h3>
					<div className="te-chips" role="group" aria-label="Sweep">
						{STROKES.map((o) => (
							<button
								key={o.value}
								type="button"
								className="te-chip"
								aria-pressed={stroke.kind === "one" && stroke.value === o.value}
								onClick={() => forRun((p, t) => setStroke(p, t, o.value === "none" ? undefined : o.value))}
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
				</section>
			)}
		</div>
	);
}
