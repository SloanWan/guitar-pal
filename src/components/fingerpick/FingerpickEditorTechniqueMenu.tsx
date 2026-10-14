import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EffectKind, FingerpickPattern, LinkKind, NoteEffects, SpanKind } from "@/lib/fingerpickTypes";
import { type Cell } from "@/lib/fingerpickEdit";
import { slotOf, spanCoversSlot, techniqueBlock } from "@/lib/fingerpickTechniqueEdit";
import {
	BEND_HEIGHTS_SEMITONES,
	EFFECT_DEFS,
	LINK_DEFS,
	SPAN_DEFS,
	type TechniqueDef,
} from "@/lib/techniqueRegistry";
import { BEND_HEIGHT_LABEL, BLOCK_TITLE, useIsomorphicLayoutEffect } from "./fingerpickEditorShared";

// The menu is the registry's: every link, every effect the app draws or
// plays, and the spans, in that order. Bend and vibrato have parameters the
// player sets here; the other effects with a parameter get a default and a
// chip to change it.
const LINKS = LINK_DEFS;
const EFFECTS = EFFECT_DEFS.filter((t) => (t.render || t.audio) && t.kind !== "bend" && t.kind !== "vibrato");
const SPANS = SPAN_DEFS.filter((t) => t.render || t.audio);

/** What an effect writes when switched on from the menu. */
const DEFAULT_PARAMS: { [K in EffectKind]?: NoteEffects[K] } = {
	tap: true,
	trill: {},
	tremolo: { speed: "16th" },
	pick: { direction: "down" },
	accent: true,
	staccato: true,
	ghost: true,
};

/** The choices an effect's parameter offers, as chips beside its row. */
const VARIANTS: { [K in EffectKind]?: { label: string; params: NoteEffects[K] }[] } = {
	tremolo: [
		{ label: "8", params: { speed: "8th" } },
		{ label: "16", params: { speed: "16th" } },
		{ label: "32", params: { speed: "32nd" } },
	],
	pick: [
		{ label: "⊓", params: { direction: "down" } },
		{ label: "V", params: { direction: "up" } },
	],
};

function sameParams(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

const OPTION_CLASS =
	"w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors aria-pressed:text-denim aria-pressed:font-semibold";
const CHIP_CLASS = "px-1 py-0.5 text-[10px] leading-none transition-colors";
const chipClass = (on: boolean) =>
	`${CHIP_CLASS} ${on ? "bg-denim text-[var(--btn-on-denim)]" : "text-ink-faint hover:text-denim"}`;

function keyHint(def: TechniqueDef): string {
	return def.key ? ` (${def.key})` : "";
}

export interface FingerpickEditorTechniqueMenuProps {
	working: FingerpickPattern;
	/** The cell the menu was opened on. */
	cell: Cell;
	/** Position inside the scroll region's coordinate space. */
	x: number;
	y: number;
	/** The scroll region the menu is anchored in, nudged to bring the menu into view. */
	scrollRef: React.RefObject<HTMLDivElement | null>;
	/** A link on (or, when the note already has it, off). */
	onLink: (kind: LinkKind) => void;
	/** The `picked` flag of a slide. */
	onSlidePicked: (picked: boolean) => void;
	/** An effect written with these parameters, or removed with null. */
	onEffect: <K extends EffectKind>(kind: K, params: NoteEffects[K] | null) => void;
	/** A span of this kind toggled over the cell's slot. */
	onSpan: (kind: SpanKind) => void;
	/** The note's link and effects cleared. */
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
	onLink,
	onSlidePicked,
	onEffect,
	onSpan,
	onClear,
}: FingerpickEditorTechniqueMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const sf = working.measures[cell.measureIndex]?.slots[cell.slotIndex]?.strings[cell.stringIndex];
	const bend = sf?.effects?.bend;
	// The bend's parameters as the menu holds them: the note's own while it has
	// a bend, otherwise a full bend to start from. The menu is short-lived, so
	// a fresh open starts over.
	const [draftBend, setDraftBend] = useState<NonNullable<NoteEffects["bend"]>>(bend ?? { semitones: 2 });
	const bendParams = bend ?? draftBend;

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
		// With every group the menu is taller than a phone's grid area; cap it to
		// what the scroll region can show (it scrolls inside) so the nudge below
		// can always bring the whole box into view instead of pushing its top out
		// of the region.
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

	const hasMarker = !!sf && (sf.link !== undefined || sf.effects !== undefined);
	const blockOf = (kind: string, semitones?: number) => techniqueBlock(working, cell, kind, semitones);
	const titleOf = (kind: string, semitones?: number) => {
		const block = blockOf(kind, semitones);
		return block ? BLOCK_TITLE[block] : undefined;
	};

	// Bend: the row switches it on with the draft parameters; the chips set a
	// parameter, writing straight to the note when it already has a bend.
	function updateBend(patch: Partial<NonNullable<NoteEffects["bend"]>>) {
		const next = { ...bendParams, ...patch };
		for (const key of ["pre", "release", "hold"] as const) if (!next[key]) delete next[key];
		setDraftBend(next);
		if (bend) onEffect("bend", next);
	}
	const bendBlock = blockOf("bend", bendParams.semitones);
	const slot = slotOf(cell);

	return (
		<div
			ref={menuRef}
			data-technique-menu
			className="fp-thin-scroll absolute z-60 w-56 overflow-y-auto border border-line-strong bg-popover py-1 text-sm"
			style={{ top: y, left: x }}
		>
			<div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">
				From the previous note
			</div>
			{LINKS.map((def) => {
				const on = sf?.link?.kind === def.kind;
				const block = on ? null : blockOf(def.kind);
				return (
					<div key={def.kind} className="flex items-center">
						<button
							disabled={block !== null}
							aria-pressed={on}
							onClick={() => onLink(def.kind as LinkKind)}
							title={block ? BLOCK_TITLE[block] : undefined}
							className={OPTION_CLASS}
						>
							{def.label.en}
							{keyHint(def)}
						</button>
						{def.kind === "slide" && sf?.link?.kind === "slide" && (
							<button
								type="button"
								onClick={() => onSlidePicked(!(sf.link?.kind === "slide" && sf.link.picked))}
								aria-pressed={!!sf.link.picked}
								title="Shift slide: the arriving note is picked again"
								className={`mr-2 ${chipClass(!!sf.link.picked)}`}
							>
								picked
							</button>
						)}
					</div>
				);
			})}
			<div className="border-t border-line my-1" />
			<div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">On this note</div>
			{/* Bend: the row, then its height and shape chips. */}
			<button
				disabled={!bend && bendBlock !== null}
				aria-pressed={!!bend}
				onClick={() => onEffect("bend", bend ? null : bendParams)}
				title={bend ? undefined : titleOf("bend", bendParams.semitones)}
				className={`${OPTION_CLASS} flex items-center justify-between gap-2`}
			>
				<span>Bend (B)</span>
				<span className="text-[10px] text-ink-faint">{BEND_HEIGHT_LABEL[bendParams.semitones]}</span>
			</button>
			<div className="flex flex-wrap items-center gap-0.5 px-3 pb-1" title="Bend height">
				{BEND_HEIGHTS_SEMITONES.map((h) => (
					<button
						key={h}
						type="button"
						onClick={() => updateBend({ semitones: h })}
						aria-pressed={bendParams.semitones === h}
						disabled={blockOf("bend", h) === "off-neck"}
						title={blockOf("bend", h) === "off-neck" ? BLOCK_TITLE["off-neck"] : undefined}
						className={`${chipClass(bendParams.semitones === h)} disabled:text-ink-faint/50`}
					>
						{BEND_HEIGHT_LABEL[h]}
					</button>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-0.5 px-3 pb-1">
				{(
					[
						["pre", "pre-bend", "Pre-bend: bent before it is picked"],
						["release", "release", "Released back after the bend"],
						["hold", "hold", "Held bent into the next note"],
					] as const
				).map(([key, label, title]) => (
					<button
						key={key}
						type="button"
						onClick={() => updateBend({ [key]: !bendParams[key] })}
						aria-pressed={!!bendParams[key]}
						title={title}
						className={chipClass(!!bendParams[key])}
					>
						{label}
					</button>
				))}
			</div>
			{/* Vibrato and its width. */}
			<div className="flex items-center">
				<button
					disabled={!sf?.effects?.vibrato && blockOf("vibrato") !== null}
					aria-pressed={!!sf?.effects?.vibrato}
					onClick={() => onEffect("vibrato", sf?.effects?.vibrato ? null : {})}
					title={sf?.effects?.vibrato ? undefined : titleOf("vibrato")}
					className={OPTION_CLASS}
				>
					Vibrato (V)
				</button>
				{sf?.effects?.vibrato && (
					<button
						type="button"
						onClick={() => onEffect("vibrato", sf.effects?.vibrato?.wide ? {} : { wide: true })}
						aria-pressed={!!sf.effects.vibrato.wide}
						title="Wide vibrato"
						className={`mr-2 ${chipClass(!!sf.effects.vibrato.wide)}`}
					>
						wide
					</button>
				)}
			</div>
			{EFFECTS.map((def) => {
				const kind = def.kind as EffectKind;
				const current = sf?.effects?.[kind];
				const on = current !== undefined;
				const block = on ? null : blockOf(kind);
				const variants = VARIANTS[kind];
				return (
					<div key={kind} className="flex items-center">
						<button
							disabled={block !== null}
							aria-pressed={on}
							onClick={() => onEffect(kind, on ? null : (DEFAULT_PARAMS[kind] as NoteEffects[typeof kind]))}
							title={block ? BLOCK_TITLE[block] : undefined}
							className={OPTION_CLASS}
						>
							{def.label.en}
							{keyHint(def)}
						</button>
						{on && variants && (
							<span className="mr-2 flex items-center gap-0.5">
								{variants.map((v) => (
									<button
										key={v.label}
										type="button"
										onClick={() => onEffect(kind, v.params as NoteEffects[typeof kind])}
										aria-pressed={sameParams(current, v.params)}
										className={chipClass(sameParams(current, v.params))}
									>
										{v.label}
									</button>
								))}
							</span>
						)}
					</div>
				);
			})}
			<div className="border-t border-line my-1" />
			<div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-[0.12em] text-ink-faint">Across notes</div>
			{SPANS.map((def) => {
				const on = spanCoversSlot(working, def.kind as SpanKind, slot);
				return (
					<button
						key={def.kind}
						aria-pressed={on}
						onClick={() => onSpan(def.kind as SpanKind)}
						title={on ? `Take this slot out of the ${def.label.en.toLowerCase()}` : `${def.label.en} over this slot; press again on the next to extend it`}
						className={OPTION_CLASS}
					>
						{def.label.en}
						{keyHint(def)}
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
