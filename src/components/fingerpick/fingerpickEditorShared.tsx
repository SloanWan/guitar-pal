// Constants, tiny helpers and hooks shared by the fingerpick editor modal and
// the pieces split out of it. Nothing here holds state of its own.

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { CircleHelp } from "lucide-react";
import {
	isBrush,
	strokeDirection,
	type Duration,
	type StringFret,
	type Stroke,
} from "@/lib/fingerpickTypes";
import type { Cell, SlotTarget } from "@/lib/fingerpickEdit";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordVoicing } from "@/lib/chordVoicing";

// Short glyphs shown under each slot column so the current rhythmic value is
// visible in the grid. A rest keeps its real duration, so it shows the same glyph
// as the note value it replaces (plus a gray wash on the column, applied below).
export const DURATION_ABBREV: Record<Duration, string> = {
	whole: "W",
	half: "H",
	quarter: "Q",
	"dotted-quarter": "Q.",
	eighth: "E",
	"dotted-eighth": "E.",
	"eighth-triplet": "E³",
	sixteenth: "S",
	"sixteenth-triplet": "S³",
	"32nd": "T",
};

// Duration label for the split/merge/replace controls. Uses the same short text
// abbreviations as the grid (W/H/Q/E/S/T, dotted with a trailing dot) rather than
// Unicode note glyphs — the whole/half/rest musical symbols live in the astral plane
// (U+1D1xx) and render as tofu boxes in almost every UI font, so text is used instead.
export function DurationIcon({ duration }: { duration: Duration }) {
	return (
		<span aria-hidden className="font-mono text-xs font-semibold leading-none">
			{DURATION_ABBREV[duration]}
		</span>
	);
}

// Two-layer hover highlight tints (denim #4A6FA5). Applied via inline
// backgroundColor rather than Tailwind classes so they never collide with the
// selected-cell denim ring/tint classes. L1 is a subtle wash over the whole beat
// group — it reuses the shared --sidebar-hover-bg token (the same denim wash the
// pattern library uses for row hover). L2 is a stronger per-axis tint on the
// hovered slot column and string row (they sum on the hovered cell itself, giving
// a brighter cross centre); its 0.14 alpha has no token equivalent, so it stays a
// raw rgba.
export const HOVER_L1_BG = "var(--sidebar-hover-bg)";
export const HOVER_L2_ALPHA = 0.14;
export const hoverAxisBg = (alpha: number): string => `rgba(74, 111, 165, ${alpha})`;
// Mid-level ("L1.5") wash for the sixteenth-note window containing the hovered
// slot — only meaningful when a beat is subdivided finer than a sixteenth (e.g.
// eight 32nd notes), where each sixteenth spans two slot columns. Sits between the
// whole-beat L1 wash and the per-cell L2 axis tint, so its 0.08 denim alpha is
// weaker than L2's 0.14 but stronger than L1's neutral wash.
export const HOVER_SUBBEAT_BG = hoverAxisBg(0.08);
// Steady denim wash on any slot carrying a roll (arpeggiated) stroke, so rolled
// columns read as such at a glance without a per-cell marker. Reuses the same
// denim base as the hover washes (staying on-theme) at a 0.10 alpha — heavier
// than the transient L1.5 sub-beat wash (0.08) yet lighter than the per-cell L2
// hover tint (0.14), so a hovered rolled column still visibly brightens. Applied
// only when the slot isn't a rest (the gray rest wash wins) and no hover wash is
// active.
// A swept slot's wash runs from a faint alpha at the string the sweep starts on
// to a deeper one at the string it ends on, so the column shows the direction.
// Rolls wash amber and brushes green, so the two kinds read apart at a glance.
const SWEEP_WASH_MIN = 0.08;
const SWEEP_WASH_MAX = 0.34;
export function sweepWashBg(stroke: Stroke, stringIndex: number): string {
	// stringIndex 0 = high e. A down sweep travels low → high, so the high e is deepest.
	const progress = strokeDirection(stroke) === "up" ? stringIndex / 5 : (5 - stringIndex) / 5;
	const alpha = SWEEP_WASH_MIN + (SWEEP_WASH_MAX - SWEEP_WASH_MIN) * progress;
	return isBrush(stroke) ? `rgba(34, 197, 94, ${alpha})` : `rgba(245, 158, 11, ${alpha})`;
}

export type HoveredCell = { measureIndex: number; slotIndex: number; stringIndex: number };

// Desktop dynamic-width geometry (rem). Modal width = cols × (block + gap) + chrome.
export const MEASURE_BLOCK_REM = 19; // per-measure block target width
export const GRID_GAP_REM = 1; // gap-4 between measure blocks
export const MODAL_CHROME_REM = 2; // measure grid's own px-4 (left + right)

export const cellKey = (c: Cell) => `${c.measureIndex}:${c.slotIndex}:${c.stringIndex}`;
export const columnKey = (t: SlotTarget) => `${t.measureIndex}:${t.slotIndex}`;
export const parseColumnKey = (key: string): SlotTarget => {
	const [m, s] = key.split(":").map(Number);
	return { measureIndex: m, slotIndex: s };
};

// Fine-pointer (mouse/trackpad → physical keyboard) capability, read via
// useSyncExternalStore so the editing hint tracks it without a setState-in-effect.
function subscribeFinePointer(callback: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const mq = window.matchMedia("(pointer: fine)");
	mq.addEventListener("change", callback);
	return () => mq.removeEventListener("change", callback);
}
const getFinePointerSnapshot = (): boolean =>
	typeof window !== "undefined" && !!window.matchMedia
		? window.matchMedia("(pointer: fine)").matches
		: true;
// SSR/first paint assumes desktop; hydration corrects it from the real media query.
const getFinePointerServerSnapshot = (): boolean => true;

// True when the device has a fine pointer (mouse/trackpad → physical keyboard
// likely). Drives which editing hint to show and whether row controls need hover.
export function useHasFinePointer(): boolean {
	return useSyncExternalStore(
		subscribeFinePointer,
		getFinePointerSnapshot,
		getFinePointerServerSnapshot,
	);
}

// useLayoutEffect on the client so the popover spring's first frame is the one that
// paints (no flash of the settled state); useEffect on the server to avoid the
// "useLayoutEffect does nothing on the server" warning.
export const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function cellDisplay(sf: StringFret): string {
	if (sf.muted) return "x";
	if (sf.fret !== null) return String(sf.fret);
	return "–";
}

/**
 * A request to open the shape editor: from a chord search that found nothing
 * (`query` seeds the name or the frets), or from the voicing stepper to write
 * another shape for a chord the slot already has (`chord`, starting from `from`).
 */
export type ShapeCreateRequest =
	| { target: SlotTarget; query: string }
	| { target: SlotTarget; chord: ChordRef; from: ChordVoicing | null };

// Column-popup section label. The plain-English explanation lives in a hover
// tooltip rather than inline text, keeping the popup compact; the help-cursor +
// faint question mark signal that hovering reveals more. Uses a CSS group-hover
// bubble instead of the native `title` attribute so it appears instantly — the
// browser's built-in title delay (~0.5–1s) is not configurable.
export function PopupSectionLabel({ label, hint }: { label: string; hint: string }) {
	return (
		<span className="group/hint relative inline-flex w-max items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint cursor-help">
			{label}
			<CircleHelp size={10} className="text-ink-faint/70" aria-hidden />
			<span
				role="tooltip"
				className="pointer-events-none absolute left-0 top-full z-70 mt-1 w-max max-w-52 whitespace-normal border border-line-strong bg-popover px-2 py-1 font-sans text-[10px] normal-case leading-snug tracking-normal text-ink-dim opacity-0 shadow-md transition-opacity duration-75 group-hover/hint:opacity-100"
			>
				{hint}
			</span>
		</span>
	);
}
