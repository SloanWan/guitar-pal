"use client";

import { useState } from "react";
import { ChevronDown, Keyboard } from "lucide-react";
import type { Duration, FingerpickPattern } from "@/lib/fingerpickTypes";
import {
	canShiftMeasureStrings,
	cloneMeasureInPattern,
	addMeasure,
	deleteMeasure,
	setSlotsRest,
	shiftMeasureStrings,
	swapMeasures,
	withMeasures,
	type Cell,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { techniqueBlock } from "@/lib/fingerpickTechniqueEdit";
import { DEFAULT_REPEAT_TIMES } from "@/lib/fingerpickRepeats";
import { BLOCK_REASON, applyNoteEdit, type NoteEdit } from "@/lib/tabEditorCursor";
import { applyDuration, barFill, durationChoices, tripletChoice } from "@/lib/tabEditorTools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CommitPattern } from "@/components/fingerpick/useEditHistory";
import NoteGlyph from "./NoteGlyph";

interface Props {
	working: FingerpickPattern;
	commit: CommitPattern;
	cursor: Cell;
	/** The slots a run edit acts on: the selection, or the cursor's slot. */
	slots: readonly SlotTarget[];
	onBlocked: (reason: string) => void;
	/** A bar was added, copied or moved: the cursor goes to its first slot. */
	onBar: (measureIndex: number) => void;
}

const VALUE_NAMES: Record<Duration, string> = {
	whole: "Whole",
	half: "Half",
	"dotted-quarter": "Dotted quarter",
	quarter: "Quarter",
	"dotted-eighth": "Dotted eighth",
	eighth: "Eighth",
	"eighth-triplet": "Eighth triplet",
	sixteenth: "Sixteenth",
	"sixteenth-triplet": "Sixteenth triplet",
	"32nd": "Thirty-second",
};

/** The toolbar's quick marks: the registry's keys, on the note at the cursor. */
const QUICK: readonly { label: string; name: string; edit: NoteEdit; kind?: string }[] = [
	{ label: "H", name: "Hammer-on", edit: { kind: "link", link: "hammer" }, kind: "hammer" },
	{ label: "P", name: "Pull-off", edit: { kind: "link", link: "pull" }, kind: "pull" },
	{ label: "/", name: "Slide", edit: { kind: "link", link: "slide" }, kind: "slide" },
	{ label: "B", name: "Bend", edit: { kind: "bend" }, kind: "bend" },
	{ label: "V", name: "Vibrato", edit: { kind: "vibrato" }, kind: "vibrato" },
	{ label: "x", name: "x (a slap on the string)", edit: { kind: "mute" } },
];

const REPEAT_TIMES_MAX = 16;

/**
 * The editor's toolbar (#361), over the tab: the cursor's note value (split or
 * merged, so the bar still adds up), triplet and rest; the quick marks; the
 * cursor's bar and what can be done to it; and the keys. Everything is a commit.
 */
export default function EditorToolbar({ working, commit, cursor, slots, onBlocked, onBar }: Props) {
	const [mergeAsk, setMergeAsk] = useState<{ pattern: FingerpickPattern; dropped: number } | null>(null);
	const [barOpen, setBarOpen] = useState(false);
	const choices = durationChoices(working, cursor);
	const triplet = tripletChoice(working, cursor);
	const measure = working.measures[cursor.measureIndex];
	const slot = measure?.slots[cursor.slotIndex];
	const note = slot?.strings[cursor.stringIndex];
	const fill = measure ? barFill(measure, working.timeSignature) : null;
	const bars = working.measures.length;
	const m = cursor.measureIndex;

	function setValue(duration: Duration, kind: "split" | "merge") {
		const edit = applyDuration(working, cursor, duration, kind);
		if (edit.type === "confirm") setMergeAsk(edit);
		else commit(() => edit.pattern);
	}

	function bar(edit: (p: FingerpickPattern) => FingerpickPattern, landOn?: number) {
		commit(edit);
		setBarOpen(false);
		if (landOn !== undefined) onBar(landOn);
	}

	const isRest = slot?.isRest === true;
	return (
		<div
			className="te-tool"
			role="toolbar"
			aria-label="Edit tools"
			// A press keeps focus where it was (the tab), so typing goes on there.
			onMouseDown={(e) => {
				if ((e.target as HTMLElement).closest("button")) e.preventDefault();
			}}
		>
			<span className="te-seg" role="group" aria-label="Note value">
				{choices.map((c) => (
					<button
						key={c.duration}
						type="button"
						aria-label={VALUE_NAMES[c.duration]}
						title={
							c.kind === "off"
								? `${VALUE_NAMES[c.duration]}: ${c.reason}`
								: c.kind === "split"
									? `Split into ${c.count} ${VALUE_NAMES[c.duration].toLowerCase()}s`
									: c.kind === "merge"
										? `Merge ${c.count} notes into a ${VALUE_NAMES[c.duration].toLowerCase()}`
										: VALUE_NAMES[c.duration]
						}
						aria-pressed={c.kind === "current"}
						disabled={c.kind === "off"}
						onClick={() => c.kind !== "current" && c.kind !== "off" && setValue(c.duration, c.kind)}
					>
						<NoteGlyph duration={c.duration} />
					</button>
				))}
			</span>
			{triplet.kind !== "hidden" && (
				<button
					type="button"
					className="te-tbtn"
					aria-label="Triplet"
					aria-pressed={triplet.kind === "off"}
					disabled={triplet.kind === "blocked"}
					title={triplet.kind === "blocked" ? `Triplet: ${triplet.reason}` : "Triplet: three in the time of two"}
					onClick={() =>
						triplet.kind === "on"
							? setValue(triplet.duration, "split")
							: triplet.kind === "off" && setValue(triplet.duration, "merge")
					}
				>
					3
				</button>
			)}
			<button
				type="button"
				className="te-tbtn"
				aria-label="Rest"
				aria-pressed={isRest}
				title="Rest: keeps the length, clears the notes"
				onClick={() => commit((p) => setSlotsRest(p, [...slots], !isRest))}
			>
				<svg viewBox="0 0 24 24" aria-hidden>
					<path d="M10 3.5l4 4.5-3.2 3.6 3.8 4.2c-2.6-.9-4.6.1-3.8 3.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</button>
			<span className="te-vsep te-mid-up" aria-hidden />
			{QUICK.map((q) => {
				const block = q.kind ? techniqueBlock(working, cursor, q.kind) : note ? null : "no-note";
				const on =
					q.edit.kind === "link"
						? note?.link?.kind === q.edit.link
						: q.edit.kind === "bend"
							? note?.effects?.bend !== undefined
							: q.edit.kind === "vibrato"
								? note?.effects?.vibrato !== undefined
								: note?.muted === true;
				return (
					<button
						key={q.label}
						type="button"
						className="te-tbtn te-mid-up"
						aria-label={q.name}
						aria-pressed={on}
						disabled={!on && block !== null}
						title={!on && block ? `${q.name}: ${BLOCK_REASON[block]}` : `${q.name} (${q.label})`}
						onClick={() => {
							const result = applyNoteEdit(working, cursor, slots, q.edit);
							if ("blocked" in result) onBlocked(result.blocked);
							else commit(() => result.pattern);
						}}
					>
						{q.label}
					</button>
				);
			})}
			<span className="tb-grow" />
			{fill && fill.kind !== "full" && (
				<span className="te-fill te-mid-up" data-kind={fill.kind}>
					Bar {m + 1}: {fill.text.toLowerCase()}
				</span>
			)}
			<Popover open={barOpen} onOpenChange={setBarOpen}>
				<PopoverTrigger asChild>
					<button type="button" className="te-barbtn" aria-label={`Bar ${m + 1} actions`}>
						Bar {m + 1}
						<ChevronDown aria-hidden />
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="te-menu w-60" data-m="tab" role="menu" aria-label={`Bar ${m + 1}`}>
					<button type="button" role="menuitem" onClick={() => bar(addMeasure, bars)}>
						Add a bar at the end
					</button>
					<button type="button" role="menuitem" onClick={() => bar((p) => cloneMeasureInPattern(p, m), m + 1)}>
						Copy this bar
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={m === 0}
						onClick={() => bar((p) => withMeasures(p, swapMeasures(p.measures, m, m - 1)), m - 1)}
					>
						Move left
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={m === bars - 1}
						onClick={() => bar((p) => withMeasures(p, swapMeasures(p.measures, m, m + 1)), m + 1)}
					>
						Move right
					</button>
					<span className="te-menu-sep" role="separator" />
					<button
						type="button"
						role="menuitem"
						disabled={!measure || !canShiftMeasureStrings(measure, -1)}
						title={measure && !canShiftMeasureStrings(measure, -1) ? "A note is already on the high e" : undefined}
						onClick={() => bar((p) => shiftMeasureStrings(p, m, -1))}
					>
						Every note up a string
					</button>
					<button
						type="button"
						role="menuitem"
						disabled={!measure || !canShiftMeasureStrings(measure, 1)}
						title={measure && !canShiftMeasureStrings(measure, 1) ? "A note is already on the low E" : undefined}
						onClick={() => bar((p) => shiftMeasureStrings(p, m, 1))}
					>
						Every note down a string
					</button>
					<span className="te-menu-sep" role="separator" />
					<div className="te-menu-row">
						<button
							type="button"
							className="te-chip"
							aria-pressed={measure?.repeatStart === true}
							onClick={() => commit((p) => withMeasures(p, p.measures.map((x, i) => (i === m ? { ...x, repeatStart: !x.repeatStart } : x))))}
						>
							|: Start
						</button>
						<button
							type="button"
							className="te-chip"
							aria-pressed={measure?.repeatEnd === true}
							onClick={() => commit((p) => withMeasures(p, p.measures.map((x, i) => (i === m ? { ...x, repeatEnd: !x.repeatEnd } : x))))}
						>
							:| End
						</button>
						<span className="tb-grow" />
						<button
							type="button"
							className="pb-icon"
							aria-label="Fewer times"
							disabled={!measure?.repeatEnd || (measure.repeatTimes ?? DEFAULT_REPEAT_TIMES) <= DEFAULT_REPEAT_TIMES}
							onClick={() => commit((p) => withMeasures(p, p.measures.map((x, i) => (i === m ? { ...x, repeatTimes: (x.repeatTimes ?? DEFAULT_REPEAT_TIMES) - 1 } : x))))}
						>
							−
						</button>
						<output className="pb-num te-times">×{measure?.repeatTimes ?? DEFAULT_REPEAT_TIMES}</output>
						<button
							type="button"
							className="pb-icon"
							aria-label="More times"
							disabled={!measure?.repeatEnd || (measure.repeatTimes ?? DEFAULT_REPEAT_TIMES) >= REPEAT_TIMES_MAX}
							onClick={() => commit((p) => withMeasures(p, p.measures.map((x, i) => (i === m ? { ...x, repeatTimes: (x.repeatTimes ?? DEFAULT_REPEAT_TIMES) + 1 } : x))))}
						>
							+
						</button>
					</div>
					<span className="te-menu-sep" role="separator" />
					<button
						type="button"
						role="menuitem"
						data-bad=""
						disabled={bars <= 1}
						title={bars <= 1 ? "A tab keeps at least one bar" : undefined}
						onClick={() => bar((p) => deleteMeasure(p, m), Math.max(0, m - 1))}
					>
						Delete this bar
					</button>
				</PopoverContent>
			</Popover>
			<Popover>
				<PopoverTrigger asChild>
					<button type="button" className="pb-icon te-mid-up" aria-label="Editing keys" title="Editing keys">
						<Keyboard aria-hidden />
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" className="te-keys w-85" data-m="tab" aria-label="Editing keys">
					<h3>Keyboard</h3>
					<dl>
						<dt>0–24</dt>
						<dd>Type a fret. Two digits within a moment make one number up to 24.</dd>
						<dt>← →</dt>
						<dd>Previous / next slot, across bars. Shift selects a run.</dd>
						<dt>↑ ↓</dt>
						<dd>String up / down.</dd>
						<dt>Tab</dt>
						<dd>Next slot (Shift+Tab: previous).</dd>
						<dt>⌫</dt>
						<dd>Clear the note (a run: every note in it).</dd>
						<dt>X</dt>
						<dd>An x: a slap on that string.</dd>
						<dt>H P /</dt>
						<dd>Hammer-on, pull-off, slide from the note before.</dd>
						<dt>B V</dt>
						<dd>Cycle a bend · cycle vibrato.</dd>
						<dt>M L S</dt>
						<dd>Palm mute · let ring over the run · slap the slot.</dd>
						<dt>⌘Z</dt>
						<dd>Undo (⌘⇧Z redo).</dd>
						<dt>Space</dt>
						<dd>Play from the cursor.</dd>
					</dl>
					<h3>Touch</h3>
					<p>Tap a slot on the tab, then a fret on the fretboard. With Auto-advance on, the cursor moves on by itself.</p>
				</PopoverContent>
			</Popover>

			<Dialog open={mergeAsk !== null} onOpenChange={(open) => (open ? undefined : setMergeAsk(null))}>
				<DialogContent role="alertdialog" data-m="tab" showCloseButton={false} className="te-leave sm:max-w-90">
					<DialogTitle>Merge and drop notes?</DialogTitle>
					<DialogDescription>
						{mergeAsk?.dropped === 1 ? "A slot being merged has notes" : `${mergeAsk?.dropped} slots being merged have notes`}. The longer
						note keeps only the first slot&apos;s.
					</DialogDescription>
					<div className="te-leave-row">
						<Button variant="secondary" size="sm" onClick={() => setMergeAsk(null)}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={() => {
								if (mergeAsk) commit(() => mergeAsk.pattern);
								setMergeAsk(null);
							}}
						>
							Merge
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
