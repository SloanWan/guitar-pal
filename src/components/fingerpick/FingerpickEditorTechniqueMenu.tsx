import { useRef } from "react";
import { Trash2 } from "lucide-react";
import type { FingerpickPattern, StringFret } from "@/lib/fingerpickTypes";
import {
	availableTechniques,
	hasPreviousNoteOnString,
	type Cell,
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
	onTied,
	onClear,
}: FingerpickEditorTechniqueMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

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

	return (
		<div
			ref={menuRef}
			data-technique-menu
			className="absolute z-60 w-44 border border-line-strong bg-popover py-1 text-sm"
			style={{ top: y, left: x }}
		>
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
				className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
			>
				Tied (⌒)
			</button>
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
