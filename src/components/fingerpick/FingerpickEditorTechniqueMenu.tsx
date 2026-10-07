import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import {
	availableNoteTechniques,
	availableTechniques,
	bendHeightFor,
	hasPreviousNoteOnString,
	BEND_HEIGHTS,
	DEFAULT_BEND_HEIGHT,
	type Cell,
	type NoteTechnique,
	type NoteTechniqueBlock,
	type TechniqueAvailability,
} from "@/lib/fingerpickEdit";
import { useIsomorphicLayoutEffect } from "./fingerpickEditorShared";

// Only the direction-bearing techniques are offered in the context menu; each
// value must be a key of TechniqueAvailability so per-option enablement type-checks.
const TECHNIQUE_OPTIONS: {
	label: string;
	value: Exclude<keyof TechniqueAvailability, "tied">;
}[] = [
	{ label: "Hammer-on (H)", value: "hammer-on" },
	{ label: "Pull-off (P)", value: "pull-off" },
	{ label: "Slide up (↑)", value: "slide-up" },
	{ label: "Slide down (↓)", value: "slide-down" },
];

// Techniques done on the note itself. The release and pre-bend variants take
// the height picked in the menu; the named bends carry their own.
const NOTE_TECHNIQUE_OPTIONS: { label: string; value: NoteTechnique; usesHeight: boolean }[] = [
	{ label: "Bend ¼", value: "bend-quarter", usesHeight: false },
	{ label: "Bend ½", value: "bend-half", usesHeight: false },
	{ label: "Bend full", value: "bend-full", usesHeight: false },
	{ label: "Bend & release", value: "bend-release", usesHeight: true },
	{ label: "Pre-bend", value: "pre-bend", usesHeight: true },
	{ label: "Pre-bend & release", value: "pre-bend-release", usesHeight: true },
	{ label: "Vibrato (V)", value: "vibrato", usesHeight: false },
	{ label: "Wide vibrato", value: "vibrato-wide", usesHeight: false },
];

const HEIGHT_LABEL: Record<number, string> = { 0.5: "¼", 1: "½", 2: "Full" };

const BLOCK_TITLE: Record<NoteTechniqueBlock, string> = {
	"no-note": "Needs a fretted note",
	muted: "A muted note has no pitch to shape",
	"open-string": "An open string cannot be bent or shaken",
	"off-neck": "The bend would run off the neck",
};

const OPTION_CLASS =
	"w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors";

export interface FingerpickEditorTechniqueMenuProps {
	working: FingerpickPattern;
	/** The cell the menu was opened on. */
	cell: Cell;
	/** Position inside the scroll region's coordinate space. */
	x: number;
	y: number;
	/** The scroll region the menu is anchored in, nudged to bring the menu into view. */
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onTechnique: (technique: NonNullable<StringFret["technique"]>) => void;
	/** A bend or vibrato on the note itself, with the bend height in semitones. */
	onNoteTechnique: (technique: NoteTechnique, bendSemitones: number) => void;
	onTied: () => void;
	onClear: () => void;
}

// Technique context menu (right-click, or long-press on touch), absolutely
// positioned inside the scroll region. Rendered only while open; the parent
// dismisses it on any pointer press outside `[data-technique-menu]`.
export default function FingerpickEditorTechniqueMenu({
	working,
	cell,
	x,
	y,
	scrollRef,
	onTechnique,
	onNoteTechnique,
	onTied,
	onClear,
}: FingerpickEditorTechniqueMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	// Height for the release / pre-bend variants; the menu is short-lived, so a
	// fresh open starts from a full bend again.
	const [bendHeight, setBendHeight] = useState<number>(DEFAULT_BEND_HEIGHT);

	// When the menu opens near the grid's edge (e.g. right-clicking the last cell
	// in a row), it's clipped by the scroll area. Nudge the scroll area just
	// enough to bring the whole menu into view — so the user never has to scroll
	// manually to reach its options. Runs after layout so the menu has its real
	// size; a fresh open (new cell / position) re-measures.
	useIsomorphicLayoutEffect(() => {
		const menu = menuRef.current;
		const scroller = scrollRef.current;
		if (!menu || !scroller) return;
		const PAD = 8;
		// With both technique groups the menu is taller than a phone's grid area;
		// cap it to what the scroll region can show (it scrolls inside) so the
		// nudge below can always bring the whole box into view instead of pushing
		// its top out of the region.
		menu.style.maxHeight = `${Math.max(120, scroller.clientHeight - PAD * 2)}px`;
		const menuRect = menu.getBoundingClientRect();
		const viewRect = scroller.getBoundingClientRect();
		let dx = 0;
		let dy = 0;
		if (menuRect.right > viewRect.right - PAD) dx = menuRect.right - (viewRect.right - PAD);
		else if (menuRect.left < viewRect.left + PAD) dx = menuRect.left - (viewRect.left + PAD);
		if (menuRect.bottom > viewRect.bottom - PAD) dy = menuRect.bottom - (viewRect.bottom - PAD);
		else if (menuRect.top < viewRect.top + PAD) dy = menuRect.top - (viewRect.top + PAD);
		if (dx !== 0 || dy !== 0) scroller.scrollBy({ left: dx, top: dy, behavior: "smooth" });
	}, [cell, x, y, scrollRef]);

	const hasPrev = hasPreviousNoteOnString(working, cell);
	const avail = availableTechniques(working, cell);
	// When a previous note exists but a marker is still off, it's the fret
	// movement that rules it out (not a missing note).
	const disabledTitle = (ok: boolean) =>
		ok ? undefined : hasPrev ? "Not valid for this fret movement" : "No previous note on this string";
	// Clear only makes sense when the target note actually carries a marker
	// (technique or tie) to remove.
	const sf = working.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex];
	const hasMarker = !!sf && (sf.technique !== null || sf.tied);
	// Each bend is checked against the height it would write, so a 7th-fret note
	// can still take a ¼ bend when a full one would leave the neck.
	const noteAvail = (opt: (typeof NOTE_TECHNIQUE_OPTIONS)[number]) => {
		const height = bendHeightFor(opt.value, bendHeight) ?? DEFAULT_BEND_HEIGHT;
		const a = availableNoteTechniques(working, cell, height);
		const ok = opt.value.startsWith("vibrato") ? a.vibrato : a.bend;
		return { ok, title: ok ? undefined : BLOCK_TITLE[a.blocked ?? "no-note"] };
	};

	return (
		<div
			ref={menuRef}
			data-technique-menu
			className="fp-thin-scroll absolute z-60 w-52 overflow-y-auto border border-line-strong bg-popover py-1 text-sm"
			style={{ top: y, left: x }}
		>
			<div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
				From the previous note
			</div>
			{TECHNIQUE_OPTIONS.map((opt) => (
				<button
					key={opt.value}
					disabled={!avail[opt.value]}
					onClick={() => onTechnique(opt.value)}
					title={disabledTitle(avail[opt.value])}
					className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
				>
					{opt.label}
				</button>
			))}
			<button
				disabled={!avail.tied}
				onClick={onTied}
				title={disabledTitle(avail.tied)}
				className={OPTION_CLASS}
			>
				Tied (⌒)
			</button>
			<div className="border-t border-line my-1" />
			<div className="flex items-center justify-between px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
				<span>On this note</span>
				<span className="flex items-center gap-0.5 normal-case tracking-normal" title="Height for release and pre-bend">
					{BEND_HEIGHTS.map((h) => (
						<button
							key={h}
							type="button"
							onClick={() => setBendHeight(h)}
							aria-pressed={bendHeight === h}
							className={`px-1 py-0.5 text-[10px] leading-none transition-colors ${
								bendHeight === h ? "bg-denim text-[var(--btn-on-denim)]" : "text-ink-faint hover:text-denim"
							}`}
						>
							{HEIGHT_LABEL[h]}
						</button>
					))}
				</span>
			</div>
			{NOTE_TECHNIQUE_OPTIONS.map((opt) => {
				const { ok, title } = noteAvail(opt);
				return (
					<button
						key={opt.value}
						disabled={!ok}
						onClick={() => onNoteTechnique(opt.value, bendHeight)}
						title={title}
						className={`${OPTION_CLASS} flex items-center justify-between gap-2`}
					>
						<span>{opt.label}</span>
						{opt.usesHeight && !opt.value.startsWith("vibrato") && (
							<span className="text-[10px] text-ink-faint">{HEIGHT_LABEL[bendHeight]}</span>
						)}
					</button>
				);
			})}
			<div className="border-t border-line my-1" />
			<button
				disabled={!hasMarker}
				onClick={onClear}
				title={hasMarker ? undefined : "No technique to clear"}
				className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-ink-dim hover:bg-destructive/10 hover:text-destructive disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
			>
				Clear technique
				<Trash2 size={13} className="shrink-0" />
			</button>
		</div>
	);
}
