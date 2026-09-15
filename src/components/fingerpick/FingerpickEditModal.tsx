"use client";

import {
	useState,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useCallback,
	useSyncExternalStore,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Plus,
	Copy,
	Trash2,
	ArrowLeft,
	ArrowRight,
	ArrowLeftToLine,
	ArrowRightToLine,
	ArrowDown,
	ArrowUp,
	Check,
	ChevronLeft,
	ChevronRight,
	CornerDownLeft,
	Merge,
	RotateCcw,
	Undo2,
	Redo2,
	CircleHelp,
	X as XIcon,
} from "lucide-react";
import type {
	Duration,
	FingerpickPattern,
	Measure,
	StringFret,
	Stroke,
} from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	clonePatternForEdit,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	setTied,
	setStroke,
	moveCell,
	hasPreviousNoteOnString,
	availableTechniques,
	type TechniqueAvailability,
	setSlotsRest,
	insertSlots,
	duplicateSlots,
	deleteSlots,
	addMeasure,
	deleteMeasure,
	cloneMeasure,
	swapMeasures,
	computeBeatLabels,
	computeBeatGroups,
	computeSubBeatGroups,
	splitSlot,
	mergeSlots,
	splitTargetsForSlot,
	mergeTargetsForSlot,
	resetMeasure,
	remapMeasure,
	slotHasStringData,
	STRING_LABELS,
	MAX_FRET,
	type Cell,
	type Direction,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { deriveRepeatDirectives, DEFAULT_REPEAT_TIMES } from "@/lib/fingerpickRepeats";
import {
	chordFretHints,
	chordSymbolLabel,
	clearLeftOutStrings,
	clearString,
	effectiveChords,
	fillColumnFromChord,
	patternCapo,
	patternHasChords,
	measureDiffersFromHints,
	offShapeStrings,
	replaceMeasureWithHints,
	replaceRowWithHints,
	rowDiffersFromHints,
	setChordOnSlots,
	setPatternCapo,
	setSlotChord,
	type FretHint,
} from "@/lib/fingerpickChords";
import { STRUM_CAPO_MAX } from "@/lib/strumPatterns";
import {
	applyPickSequence,
	parsePickSequence,
	type PickSequenceParse,
} from "@/lib/fingerpickPickSequence";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { getChordIndex } from "@/lib/chords";
import { chordIndexWithUser } from "@/lib/userChordVoicings";
import { selectRefVoicing } from "@/lib/strumBars";
import { chordVoicingToVexChords, type ChordVoicing } from "@/lib/chordVoicingToVexChords";
import { useUser } from "@/hooks/useUser";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import ChordDiagram from "@/components/chords/ChordDiagram";
import ChordSearchSelect from "@/components/strum/ChordSearchSelect";
import ChordShapeModal from "@/components/chords/ChordShapeModal";
import type { UserChordVoicing } from "@/lib/userChordVoicings";
import { parseTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { chordShapeToVoicing } from "@/lib/chordShape";
import { useChordVoicings } from "./useChordVoicings";

export interface FingerpickEditModalProps {
	open: boolean;
	pattern: FingerpickPattern | null; // null = new pattern from scratch
	onClose: () => void;
	onSave: (pattern: FingerpickPattern) => void;
}

// Short glyphs shown under each slot column so the current rhythmic value is
// visible in the grid. A rest keeps its real duration, so it shows the same glyph
// as the note value it replaces (plus a gray wash on the column, applied below).
const DURATION_ABBREV: Record<Duration, string> = {
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
function DurationIcon({ duration }: { duration: Duration }) {
	return (
		<span aria-hidden className="font-mono text-xs font-semibold leading-none">
			{DURATION_ABBREV[duration]}
		</span>
	);
}

// Slot-level roll (arpeggiated chord) options for the column popup. "none" clears
// the field; "roll-down"/"roll-up" are the domain Stroke values. Roll ↓ = hand moves
// down = low→high pitch; Roll ↑ = hand moves up = high→low pitch (see fingerpickTypes).
const STROKE_PICKER: { label: string; value: "none" | Stroke }[] = [
	{ label: "Off", value: "none" },
	{ label: "Down", value: "roll-down" },
	{ label: "Up", value: "roll-up" },
];

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

const TECHNIQUE_GLYPH: Partial<Record<NonNullable<StringFret["technique"]>, string>> = {
	"hammer-on": "h",
	"pull-off": "p",
	"slide-up": "↑",
	"slide-down": "↓",
};

const ARROW_DIRECTIONS: Record<string, Direction> = {
	ArrowUp: "up",
	ArrowDown: "down",
	ArrowLeft: "left",
	ArrowRight: "right",
};

const MIN_BPM = 40;
const MAX_BPM = 220;

// Two-layer hover highlight tints (denim #4A6FA5). Applied via inline
// backgroundColor rather than Tailwind classes so they never collide with the
// selected-cell denim ring/tint classes. L1 is a subtle wash over the whole beat
// group — it reuses the shared --sidebar-hover-bg token (the same denim wash the
// pattern library uses for row hover). L2 is a stronger per-axis tint on the
// hovered slot column and string row (they sum on the hovered cell itself, giving
// a brighter cross centre); its 0.14 alpha has no token equivalent, so it stays a
// raw rgba.
const HOVER_L1_BG = "var(--sidebar-hover-bg)";
const HOVER_L2_ALPHA = 0.14;
const hoverAxisBg = (alpha: number): string => `rgba(74, 111, 165, ${alpha})`;
// Mid-level ("L1.5") wash for the sixteenth-note window containing the hovered
// slot — only meaningful when a beat is subdivided finer than a sixteenth (e.g.
// eight 32nd notes), where each sixteenth spans two slot columns. Sits between the
// whole-beat L1 wash and the per-cell L2 axis tint, so its 0.08 denim alpha is
// weaker than L2's 0.14 but stronger than L1's neutral wash.
const HOVER_SUBBEAT_BG = hoverAxisBg(0.08);
// Steady denim wash on any slot carrying a roll (arpeggiated) stroke, so rolled
// columns read as such at a glance without a per-cell marker. Reuses the same
// denim base as the hover washes (staying on-theme) at a 0.10 alpha — heavier
// than the transient L1.5 sub-beat wash (0.08) yet lighter than the per-cell L2
// hover tint (0.14), so a hovered rolled column still visibly brightens. Applied
// only when the slot isn't a rest (the gray rest wash wins) and no hover wash is
// active.
// A rolled slot's wash runs from this alpha at the string the roll starts on to
// the deeper one at the string it ends on, so the column shows the direction.
const ROLL_WASH_MIN = 0.05;
const ROLL_WASH_MAX = 0.24;
function rollWashAlpha(stroke: Stroke | undefined, stringIndex: number): number {
	// stringIndex 0 = high e. roll-down travels low → high, so the high e is deepest.
	const progress = stroke === "roll-up" ? stringIndex / 5 : (5 - stringIndex) / 5;
	return ROLL_WASH_MIN + (ROLL_WASH_MAX - ROLL_WASH_MIN) * progress;
}

type HoveredCell = { measureIndex: number; slotIndex: number; stringIndex: number };

// Desktop dynamic-width geometry (rem). Modal width = cols × (block + gap) + chrome.
const MEASURE_BLOCK_REM = 19; // per-measure block target width
const GRID_GAP_REM = 1; // gap-4 between measure blocks
const MODAL_CHROME_REM = 2; // measure grid's own px-4 (left + right)
const TWO_DIGIT_WINDOW_MS = 800;
const LONG_PRESS_MS = 500;
// Maximum number of pattern snapshots retained for undo/redo. Older snapshots
// are dropped from the front once this is exceeded.
const HISTORY_LIMIT = 50;
// Upper bound for the repeat play-count stepper (kept well under the lib's hard cap).
const REPEAT_TIMES_MAX = 16;

const cellKey = (c: Cell) => `${c.measureIndex}:${c.slotIndex}:${c.stringIndex}`;
const columnKey = (t: SlotTarget) => `${t.measureIndex}:${t.slotIndex}`;
const parseColumnKey = (key: string): SlotTarget => {
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

// iMessage-style spring "pop": an easeOutBack overshoot curve that scales past the
// target before settling. Driven via the Web Animations API for the Save press and
// the hint-popover entrance. Read prefers-reduced-motion at call time so both
// effects can fall back to an instant, animation-free state change (§6.7).
// Both now live in src/lib/motion.ts — the strum editors want the same spring.

// useLayoutEffect on the client so the popover spring's first frame is the one that
// paints (no flash of the settled state); useEffect on the server to avoid the
// "useLayoutEffect does nothing on the server" warning.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function cellDisplay(sf: StringFret): string {
	if (sf.muted) return "x";
	if (sf.fret !== null) return String(sf.fret);
	return "–";
}

export default function FingerpickEditModal({
	open,
	pattern: initialPattern,
	onClose,
	onSave,
}: FingerpickEditModalProps) {
	const [working, setWorking] = useState<FingerpickPattern>(makeDefaultPattern);
	const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
	const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
	const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
	const [techMenu, setTechMenu] = useState<{ cell: Cell; x: number; y: number } | null>(null);
	// Inline confirmation inside the column popup (merge / replace-with-whole).
	const [popupConfirm, setPopupConfirm] = useState<
		| { kind: "merge"; affectedSlotCount: number; pendingMeasures: Measure[] }
		| { kind: "whole"; pendingMeasures: Measure[] }
		// Rolling slots that hold notes outside the chord shape: overwrite them?
		| { kind: "roll"; targets: SlotTarget[] }
		| null
	>(null);
	// Inline confirmation for a measure's quick-preset row.
	const [presetConfirm, setPresetConfirm] = useState<{
		measureIndex: number;
		targetDuration: Duration;
	} | null>(null);
	// The right-hand sequence typed into each measure's Pick field, by measure id
	// (ids, not indices, so a moved measure keeps its draft).
	const [pickInputs, setPickInputs] = useState<Record<string, string>>({});
	// What the last Pick apply had to say for one measure: a parse error, or the
	// notes it could not write as asked. Cleared by the next keystroke there.
	const [pickNotice, setPickNotice] = useState<{
		measureId: string;
		kind: "error" | "warning";
		lines: string[];
	} | null>(null);
	// A sequence waiting on "overwrite this measure?" — the measure already has notes.
	const [pickConfirm, setPickConfirm] = useState<{
		measureIndex: number;
		parsed: Extract<PickSequenceParse, { ok: true }>;
	} | null>(null);
	// Inline "Discard changes?" confirmation shown when the user tries to close
	// with unsaved edits. Rendered in the header in place of the close button.
	const [discardConfirm, setDiscardConfirm] = useState(false);
	// Repeat-markup validation message; set when Save is blocked by unclosed/dangling
	// repeat barlines, cleared on the next successful save attempt.
	const [repeatError, setRepeatError] = useState<string | null>(null);
	// True when the device has a fine pointer (mouse/trackpad → physical keyboard
	// likely). Drives which editing hint to show.
	const hasFinePointer = useSyncExternalStore(
		subscribeFinePointer,
		getFinePointerSnapshot,
		getFinePointerServerSnapshot,
	);
	// Content-relative position of the touch mute button, set when a cell is tapped
	// on a touch device. Rendered only while a cell is selected; gives touch users a
	// way to mute a string (there is no "x" key on the native numeric keyboard).
	const [touchMute, setTouchMute] = useState<{ top: number; left: number } | null>(null);
	// True while the hidden numeric input holds focus (i.e. the native fret-entry
	// keyboard is up). The touch mute button belongs to that same "keyboard active"
	// interaction, so it is shown only while this is true and hidden on blur.
	const [isFretInputFocused, setIsFretInputFocused] = useState(false);
	// Whether the editing-help popover (anchored to the footer "?" button) is open.
	const [hintOpen, setHintOpen] = useState(false);
	// Id of the measure most recently copied or moved. That box gets a denim glow
	// so the user can see which one just changed; it clears on the next outside
	// pointer press (clicking the grid background or anywhere else).
	const [highlightedMeasureId, setHighlightedMeasureId] = useState<string | null>(null);
	// The measure that just moved and the direction it travelled, so its landed
	// cell can play a short directional slide-in. Cleared on the next outside
	// pointer press (same lifecycle as the highlight) — the clear-then-reset on a
	// repeated move toggles the class off/on, which re-fires the CSS animation.
	const [moveNudge, setMoveNudge] = useState<{
		id: string;
		dir: "left" | "right";
	} | null>(null);

	// Undo/redo history. `history` holds every committed pattern snapshot (the
	// initial state plus one entry per edit); `historyIndex` points at the entry
	// currently shown in `working`. Undo/redo move the index and restore that
	// snapshot; a fresh edit truncates any redo tail before appending.
	const [history, setHistory] = useState<FingerpickPattern[]>([]);
	const [historyIndex, setHistoryIndex] = useState(0);

	// Latest working pattern for keyboard handlers (avoids stale-closure nav).
	const workingRef = useRef(working);
	// Ref mirrors of the history state so commit/undo/redo can read the latest
	// values without stale closures (and without re-creating the callbacks).
	const historyRef = useRef<FingerpickPattern[]>([]);
	const historyIndexRef = useRef(0);
	// Serialized snapshot of the pattern taken when the modal opened. Comparing
	// the live pattern against this detects unsaved edits (see isDirty) without
	// having to flag every individual mutation site.
	const pristineRef = useRef<string>("");
	// Two-digit fret entry buffer.
	const pendingDigitRef = useRef<{ key: string; digit: number; time: number } | null>(null);
	// Focusable cell buttons, keyed by cellKey.
	const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const popupRef = useRef<HTMLDivElement>(null);
	// The popup's Chord section (single- or multi-slot — one renders at a time).
	// Its height sets the least the popup may be capped to, and it is scrolled
	// into view inside the popup whenever the chord is being worked on.
	const chordSectionRef = useRef<HTMLDivElement>(null);
	// Bumped by every chord edit made from the popup, so the section is revealed
	// after the edit re-renders it (a new shape card, a longer result list …).
	const [revealChordTick, setRevealChordTick] = useState(0);
	// When the chord was last edited from the popup. Growth of the section soon
	// after (the shape card arriving for the chord just picked) is revealed too,
	// even though picking took the focus out of the section.
	const lastChordEditRef = useRef(0);
	const bumpRevealChord = useCallback(() => {
		lastChordEditRef.current = Date.now();
		setRevealChordTick((t) => t + 1);
	}, []);
	// The selected column's DOM box, used to anchor the column popup below it inside
	// the scroll region's coordinate space.
	const popupAnchorRef = useRef<HTMLDivElement | null>(null);
	// Scroll-region-relative coordinates for the column popup (null until measured).
	const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
	// Height the popup may take before scrolling inside itself; set by the nudge.
	const [popupMaxHeight, setPopupMaxHeight] = useState<number | null>(null);

	// ── Chords ───────────────────────────────────────────────────────────────

	// The player's own shapes are only fetched while the editor is open: the modal
	// stays mounted behind the library, and a closed editor has no use for them.
	const { user, loading: userLoading } = useUser();
	const { voicings: userVoicings, saveVoicing } = useUserChordVoicings(
		open ? user : null,
		userLoading || !open,
	);
	// Browsable (root, suffix) pairs for the chord search, fetched once per open.
	const [chordIndex, setChordIndex] = useState<readonly ChordIndexEntry[]>([]);
	const searchIndex = useMemo(
		() => chordIndexWithUser(chordIndex, userVoicings),
		[chordIndex, userVoicings],
	);
	// Frets typed into the chord field are matched against every voicing there is.
	const shapeCorpus = useChordShapeCorpus(open);
	useEffect(() => {
		if (!open || chordIndex.length > 0) return;
		let cancelled = false;
		getChordIndex()
			.then((index) => {
				if (!cancelled) setChordIndex(index);
			})
			.catch((e: unknown) => console.error("[FingerpickEditModal] chord index:", e));
		return () => {
			cancelled = true;
		};
	}, [open, chordIndex.length]);
	// The chord under every slot, and the distinct chords whose shapes are needed.
	const chordsInEffect = useMemo(() => effectiveChords(working.measures), [working.measures]);
	const hasChords = patternHasChords(working.measures);
	const chordRefs = useMemo(
		() => working.measures.flatMap((m) => m.slots.flatMap((slot) => (slot.chord ? [slot.chord] : []))),
		[working.measures],
	);
	const voicingsFor = useChordVoicings(chordRefs, userVoicings);
	// What each string plays in the shape under every slot (null where no chord
	// is in effect or its shapes are not here yet), for the hover hints and the
	// column fill. One lookup per slot from the cache; nothing is fetched here.
	const hintsBySlot = useMemo<(FretHint[] | null)[][]>(
		() =>
			chordsInEffect.map((row) =>
				row.map((ref) => {
					if (!ref) return null;
					const state = voicingsFor(ref);
					if (state.status !== "ready") return null;
					const voicing = selectRefVoicing(ref, state.voicings);
					return voicing ? chordFretHints(voicing) : null;
				}),
			),
		[chordsInEffect, voicingsFor],
	);
	const techMenuRef = useRef<HTMLDivElement>(null);
	// The shape editor: opened from a chord search that found nothing (`query`
	// seeds the name or the frets), or from the voicing stepper to write another
	// shape for a chord the slot already has (`chord`, starting from `from`).
	// The slot is captured here because the column popup closes under the editor.
	const [shapeCreate, setShapeCreate] = useState<
		| { target: SlotTarget; query: string }
		| { target: SlotTarget; chord: ChordRef; from: ChordVoicing | null }
		| null
	>(null);
	// The middle (measure-grid) scroll area. Only this region scrolls — the
	// header/metadata/footer stay pinned — and it's the coordinate space the
	// absolute popups (technique menu, touch-mute, hidden input) are anchored in.
	const scrollRef = useRef<HTMLDivElement>(null);
	const hintRef = useRef<HTMLDivElement>(null);
	// Save button node, for the spring-pop press feedback.
	const saveButtonRef = useRef<HTMLButtonElement>(null);
	// Previous hintOpen value, so the entrance spring fires only on false→true.
	const prevHintOpenRef = useRef(false);
	// Long-press timer for the mobile technique menu.
	const longPressRef = useRef<number | null>(null);
	// Set true when the long-press timer opens the technique menu, so the tap's
	// trailing pointerup/click doesn't also select the cell and pop the keyboard.
	const longPressFiredRef = useRef(false);
	// Pointer type of the most recent cell pointerdown. Drives whether selecting a
	// cell focuses the button (desktop keyboard nav) or the hidden numeric input
	// (touch → native numeric keyboard).
	const lastPointerTypeRef = useRef<string>("mouse");
	// Shared off-screen numeric input, focused on a touch tap so mobile devices can
	// type a fret — there is no physical keyboard to drive handleCellKeyDown.
	const hiddenInputRef = useRef<HTMLInputElement>(null);

	// Keep the nav ref pointing at the latest working pattern.
	useEffect(() => {
		workingRef.current = working;
	}, [working]);

	// Keep the history refs in step with their state.
	useEffect(() => {
		historyRef.current = history;
	}, [history]);
	useEffect(() => {
		historyIndexRef.current = historyIndex;
	}, [historyIndex]);

	// Apply a draft mutation and record it for undo/redo. Every draft-mutating
	// operation goes through here: it derives the next pattern from the current
	// one, drops any redo tail, appends the snapshot (capped at HISTORY_LIMIT),
	// and advances the index.
	const commit = useCallback((updater: (prev: FingerpickPattern) => FingerpickPattern) => {
		const prev = workingRef.current;
		const next = updater(prev);
		if (next === prev) return;
		setWorking(next);
		const idx = historyIndexRef.current;
		setHistory((h) => {
			const base = h.slice(0, idx + 1);
			base.push(next);
			return base.length > HISTORY_LIMIT ? base.slice(base.length - HISTORY_LIMIT) : base;
		});
		setHistoryIndex((i) => Math.min(i + 1, HISTORY_LIMIT - 1));
	}, []);

	const undo = useCallback(() => {
		const i = historyIndexRef.current;
		if (i <= 0) return;
		const ni = i - 1;
		setHistoryIndex(ni);
		setWorking(historyRef.current[ni]);
	}, []);

	const redo = useCallback(() => {
		const i = historyIndexRef.current;
		if (i >= historyRef.current.length - 1) return;
		const ni = i + 1;
		setHistoryIndex(ni);
		setWorking(historyRef.current[ni]);
	}, []);

	const canUndo = historyIndex > 0;
	const canRedo = historyIndex < history.length - 1;

	// Clear any pending long-press timer on unmount.
	useEffect(() => {
		return () => {
			if (longPressRef.current !== null) clearTimeout(longPressRef.current);
		};
	}, []);

	// Initialise the working copy whenever the modal opens.
	useEffect(() => {
		if (!open) return;
		queueMicrotask(() => {
			const next = initialPattern
				? clonePatternForEdit(initialPattern)
				: makeDefaultPattern();
			setWorking(next);
			setHistory([next]);
			setHistoryIndex(0);
			pristineRef.current = JSON.stringify(next);
			setSelectedCell(null);
			setHoveredCell(null);
			setTouchMute(null);
			setSelectedColumns(new Set());
			setTechMenu(null);
			setShapeCreate(null);
			setPopupConfirm(null);
			setPresetConfirm(null);
			setPickInputs({});
			setPickNotice(null);
			setPickConfirm(null);
			setDiscardConfirm(false);
			setRepeatError(null);
			setHintOpen(false);
			setHighlightedMeasureId(null);
			pendingDigitRef.current = null;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// Move DOM focus to the selected cell so keyboard navigation stays live. On
	// touch, focus the hidden numeric input instead so the native numeric keyboard
	// opens and the cell button doesn't steal focus back.
	useEffect(() => {
		if (!selectedCell) return;
		if (lastPointerTypeRef.current === "touch") {
			hiddenInputRef.current?.focus();
		} else {
			cellRefs.current.get(cellKey(selectedCell))?.focus();
		}
	}, [selectedCell]);

	// Close popups on any outside pointer press.
	useEffect(() => {
		if (selectedColumns.size === 0 && !techMenu && !hintOpen) return;
		function handlePointerDown(e: PointerEvent) {
			const target = e.target as HTMLElement;
			if (techMenu && !techMenuRef.current?.contains(target)) {
				setTechMenu(null);
			}
			if (
				selectedColumns.size > 0 &&
				!popupRef.current?.contains(target) &&
				!target.closest("[data-column-selector]")
			) {
				setSelectedColumns(new Set());
				setPopupConfirm(null);
			}
			// Dismiss the hint popover, except when the "?" trigger is pressed — its
			// own click handler toggles it (so pressing it while open closes it).
			if (
				hintOpen &&
				!hintRef.current?.contains(target) &&
				!target.closest("[data-hint-trigger]")
			) {
				setHintOpen(false);
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [selectedColumns, techMenu, hintOpen]);

	// Clear the copy/move highlight on the next pointer press anywhere. A press on
	// a copy/move control clears here first, then that control's click re-sets the
	// highlight to its own measure — so re-copying or re-moving still lands the glow
	// on the freshly changed box.
	useEffect(() => {
		if (!highlightedMeasureId) return;
		function handlePointerDown(e: PointerEvent) {
			// A press inside the focused block keeps its focus — clearing and
			// re-setting it on the click would blink the glow.
			const block = (e.target as HTMLElement).closest<HTMLElement>("[data-measure-id]");
			if (block?.dataset.measureId === highlightedMeasureId) return;
			setHighlightedMeasureId(null);
			setMoveNudge(null);
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [highlightedMeasureId]);

	// Hint popover entrance: spring-pop (scale in from 0.85 with overshoot past 1.0,
	// plus the opacity fade) only on the false→true transition. Closing keeps the
	// plain CSS fade/shrink from the element's transition classes. Skipped entirely
	// for prefers-reduced-motion, leaving the instant class-driven toggle.
	useIsomorphicLayoutEffect(() => {
		const wasOpen = prevHintOpenRef.current;
		prevHintOpenRef.current = hintOpen;
		if (!hintOpen || wasOpen) return;
		if (prefersReducedMotion()) return;
		hintRef.current?.animate(
			[
				{ opacity: 0, transform: "scale(0.85)" },
				{ opacity: 1, transform: "scale(1)" },
			],
			{ duration: 250, easing: SPRING_POP_EASING },
		);
	}, [hintOpen]);

	// ── Cell keyboard editing ──────────────────────────────────────────────────

	// Apply a single typed digit to a cell's fret, honouring the two-digit entry
	// window: a second digit within TWO_DIGIT_WINDOW_MS combines with the first
	// when the result is ≤ MAX_FRET, otherwise it starts a fresh single-digit
	// entry. Shared by physical-keyboard editing (handleCellKeyDown) and the touch
	// numeric input so both paths behave identically.
	const applyFretDigit = useCallback(
		(cell: Cell, digit: number) => {
			const ck = cellKey(cell);
			const now = Date.now();
			const pend = pendingDigitRef.current;
			if (pend && pend.key === ck && now - pend.time < TWO_DIGIT_WINDOW_MS) {
				const combined = pend.digit * 10 + digit;
				if (combined <= MAX_FRET) {
					commit((prev) => setFret(prev, cell, combined));
					pendingDigitRef.current = null;
					return;
				}
			}
			commit((prev) => setFret(prev, cell, digit));
			pendingDigitRef.current = { key: ck, digit, time: now };
		},
		[commit],
	);

	// Hover the whole slot column without a specific string row — used by the
	// duration label, column selector and beat label beneath each column so the
	// L1 beat-group wash and L2 column tint activate there too, not only inside
	// the string cells. stringIndex -1 is a sentinel that never matches a real
	// row (0–5), so the per-axis row tint stays off while the column lights up.
	const hoverColumn = useCallback((measureIndex: number, slotIndex: number) => {
		setHoveredCell({ measureIndex, slotIndex, stringIndex: -1 });
	}, []);

	const handleCellKeyDown = useCallback(
		(e: React.KeyboardEvent, cell: Cell) => {
			const key = e.key;
			const dir = ARROW_DIRECTIONS[key];
			if (dir) {
				e.preventDefault();
				setSelectedCell(moveCell(workingRef.current, cell, dir));
				pendingDigitRef.current = null;
				return;
			}
			if (key === "Backspace" || key === "Delete") {
				e.preventDefault();
				commit((prev) => setInactive(prev, cell));
				pendingDigitRef.current = null;
				return;
			}
			if (key === "x" || key === "X") {
				e.preventDefault();
				commit((prev) => toggleMuted(prev, cell));
				pendingDigitRef.current = null;
				return;
			}
			if (/^[0-9]$/.test(key)) {
				e.preventDefault();
				applyFretDigit(cell, Number(key));
			}
		},
		[commit, applyFretDigit],
	);

	// ── Technique context menu ───────────────────────────────────────────────

	// Position the menu relative to the (scrollable, transformed) dialog content
	// box so it stays correctly anchored regardless of viewport scroll/transform.
	function openTechMenu(cell: Cell, clientX: number, clientY: number, anchorEl: HTMLElement) {
		const content = anchorEl.closest<HTMLElement>("[data-fp-scroll]");
		if (!content) return;
		const rect = content.getBoundingClientRect();
		setTechMenu({
			cell,
			x: clientX - rect.left + content.scrollLeft,
			y: clientY - rect.top + content.scrollTop,
		});
	}

	function handleCellPointerDown(cell: Cell, e: React.PointerEvent) {
		lastPointerTypeRef.current = e.pointerType;
		if (e.pointerType !== "touch") return;
		// Suppress the OS long-press text/element selection before our long-press
		// timer opens the technique menu. touch-action: manipulation on the button
		// still lets scroll gestures through, so this doesn't block page scroll.
		e.preventDefault();
		longPressFiredRef.current = false;
		const x = e.clientX;
		const y = e.clientY;
		const anchorEl = e.currentTarget as HTMLElement;
		longPressRef.current = window.setTimeout(() => {
			longPressFiredRef.current = true;
			openTechMenu(cell, x, y, anchorEl);
		}, LONG_PRESS_MS);
	}

	// Position the touch mute button just below the given cell. Anchored to the
	// cell button's own bounding rect (via cellRefs), converted into the dialog
	// content box's coordinate space with the same getBoundingClientRect + scroll
	// offset maths as openTechMenu — so it stays centred beneath the cell rather
	// than tracking the tap point. Clears the anchor if the cell has no live ref.
	function positionTouchMute(cell: Cell, content: HTMLElement) {
		const cellEl = cellRefs.current.get(cellKey(cell));
		if (!cellEl) {
			setTouchMute(null);
			return;
		}
		const contentRect = content.getBoundingClientRect();
		const cellRect = cellEl.getBoundingClientRect();
		setTouchMute({
			top: cellRect.bottom - contentRect.top + content.scrollTop,
			left: cellRect.left + cellRect.width / 2 - contentRect.left + content.scrollLeft,
		});
	}

	// Touch tap release: select the cell and open the native numeric keyboard by
	// focusing the shared hidden input. Skipped when the long-press already opened
	// the technique menu. Focus must happen here (inside the tap gesture) — iOS
	// Safari ignores a focus() deferred to a later effect.
	function handleCellPointerUp(cell: Cell, e: React.PointerEvent) {
		cancelLongPress();
		if (e.pointerType !== "touch") return;
		if (longPressFiredRef.current) {
			longPressFiredRef.current = false;
			return;
		}
		setSelectedCell(cell);
		// Touch has no hover, so drive the same L1/L2 row/column highlight off the
		// tapped cell. Only on touch — desktop keeps hover and selection independent.
		setHoveredCell({
			measureIndex: cell.measureIndex,
			slotIndex: cell.slotIndex,
			stringIndex: cell.stringIndex,
		});
		const input = hiddenInputRef.current;
		if (!input) return;
		// Park the invisible input over the tapped cell (same content-relative maths
		// as openTechMenu) so focusing it doesn't jump-scroll the dialog.
		const content = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-fp-scroll]");
		if (content) {
			const rect = content.getBoundingClientRect();
			const top = e.clientY - rect.top + content.scrollTop;
			const left = e.clientX - rect.left + content.scrollLeft;
			input.style.top = `${top}px`;
			input.style.left = `${left}px`;
			// Anchor the touch mute button to the tapped cell's own box (centred just
			// below it), not the tap point, so it always lands in the same spot.
			positionTouchMute(cell, content);
		}
		input.focus();
	}

	// Native numeric keyboard input (touch). Each keystroke arrives as an onChange;
	// take the last typed character, route it through the shared digit logic, and
	// reset the field so the next keystroke starts fresh.
	function handleHiddenNumericInput(e: React.ChangeEvent<HTMLInputElement>) {
		const cell = selectedCell;
		const raw = e.currentTarget.value;
		e.currentTarget.value = "";
		if (!cell) return;
		const lastChar = raw.slice(-1);
		if (!/^[0-9]$/.test(lastChar)) return;
		applyFretDigit(cell, Number(lastChar));
	}

	// Reset the hidden input and pending two-digit buffer (on blur / Enter / Done).
	function resetHiddenNumericInput() {
		pendingDigitRef.current = null;
		if (hiddenInputRef.current) hiddenInputRef.current.value = "";
	}

	function cancelLongPress() {
		if (longPressRef.current !== null) {
			clearTimeout(longPressRef.current);
			longPressRef.current = null;
		}
	}

	function applyTechnique(technique: NonNullable<StringFret["technique"]>) {
		if (!techMenu) return;
		const cell = techMenu.cell;
		commit((prev) => setTechnique(prev, cell, technique));
		setTechMenu(null);
	}

	function applyTied() {
		if (!techMenu) return;
		const cell = techMenu.cell;
		commit((prev) => setTied(prev, cell, true));
		setTechMenu(null);
	}

	// Clear both technique and tied on the target cell.
	function applyClearTechnique() {
		if (!techMenu) return;
		const cell = techMenu.cell;
		commit((prev) => setTied(setTechnique(prev, cell, null), cell, false));
		setTechMenu(null);
	}

	// ── Column popup actions ─────────────────────────────────────────────────

	const columnTargets = (): SlotTarget[] => [...selectedColumns].map(parseColumnKey);

	function toggleColumn(target: SlotTarget) {
		setPopupConfirm(null);
		setSelectedColumns((prev) => {
			const next = new Set(prev);
			const key = columnKey(target);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	// Toggle the silent (rest) state on every selected column in one commit. A rest
	// keeps its rhythmic duration, so the measure total is unchanged.
	function applyRest(isRest: boolean) {
		commit((prev) => setSlotsRest(prev, columnTargets(), isRest));
	}

	// Apply (or clear) a roll stroke on every selected column in one commit, so
	// undo/redo treat a multi-column stroke change as a single step. `undefined`
	// clears. Routed through commit, so it participates in undo/redo and the dirty
	// guard just like every other edit.
	// The shape in effect at a slot, when it is known.
	function voicingAt(t: SlotTarget): ChordVoicing | null {
		const ref = chordsInEffect[t.measureIndex]?.[t.slotIndex] ?? null;
		if (!ref) return null;
		const state = voicingsFor(ref);
		return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
	}
	function fillFromChordAt(p: FingerpickPattern, t: SlotTarget): FingerpickPattern {
		const voicing = voicingAt(t);
		return voicing ? fillColumnFromChord(p, t, voicing) : p;
	}
	function clearSlotStrings(p: FingerpickPattern, t: SlotTarget): FingerpickPattern {
		return STRING_LABELS.reduce(
			(q, _, stringIndex) => setInactive(q, { ...t, stringIndex }),
			p,
		);
	}

	// A roll is a chord being sounded, so an empty slot is filled from its chord
	// shape as the roll goes on; a slot holding notes outside the shape is not
	// touched without asking. Turning the roll off changes only the roll.
	function applyStroke(stroke: Stroke | undefined) {
		const targets = columnTargets();
		const conflicting: SlotTarget[] = [];
		commit((prev) =>
			targets.reduce((p, t) => {
				let next = setStroke(p, t, stroke);
				if (!stroke) return next;
				const slot = next.measures[t.measureIndex]?.slots[t.slotIndex];
				const hints = hintsBySlot[t.measureIndex]?.[t.slotIndex] ?? null;
				if (!slot || !hints) return next;
				if (!slotHasStringData(slot)) next = fillFromChordAt(next, t);
				else if (offShapeStrings(slot, hints).length > 0) conflicting.push(t);
				return next;
			}, prev),
		);
		setPopupConfirm(conflicting.length > 0 ? { kind: "roll", targets: conflicting } : null);
	}

	// Mark a chord change on a single slot (null takes the mark away).
	function applySlotChord(target: SlotTarget, chord: ChordRef | null) {
		commit((prev) => setSlotChord(prev, target, chord));
		bumpRevealChord();
	}

	// One chord over every selected slot: marked once per run, the chord that
	// was there resuming after it.
	function applyChordToSelection(chord: ChordRef) {
		commit((prev) => setChordOnSlots(prev, columnTargets(), chord));
		bumpRevealChord();
	}

	// Rewrite every fretted cell in a measure to the chord shape's frets.
	function applyReplaceMeasure(measureIndex: number) {
		commit((prev) =>
			replaceMeasureWithHints(prev, measureIndex, (si) => hintsBySlot[measureIndex]?.[si] ?? null),
		);
	}

	// Rewrite a string's fretted cells in one measure to the shape's frets.
	function applyReplaceRow(measureIndex: number, stringIndex: number) {
		commit((prev) =>
			replaceRowWithHints(prev, measureIndex, stringIndex, (si) => hintsBySlot[measureIndex]?.[si] ?? null),
		);
	}

	function applyStructural(op: "before" | "after" | "duplicate" | "delete") {
		const targets = columnTargets();
		commit((prev) => {
			if (op === "duplicate") return duplicateSlots(prev, targets);
			if (op === "delete") return deleteSlots(prev, targets);
			return insertSlots(prev, targets, op);
		});
		setSelectedColumns(new Set());
		setPopupConfirm(null);
	}

	// Replace a measure's slots via a Measure[] transform (split/merge/reset/remap
	// all operate on the measure array, not the whole pattern).
	function applyMeasures(measures: Measure[]) {
		commit((prev) => ({ ...prev, measures }));
	}

	// Patch a single measure's repeat flags (start / end barline, play-count). Undefined
	// values are stripped so a cleared flag doesn't linger in the serialized measure.
	function setMeasureRepeat(
		measureIndex: number,
		patch: Partial<Pick<Measure, "repeatStart" | "repeatEnd" | "repeatTimes">>,
	) {
		// Any repeat edit is the user acting on the markup — drop a stale save-blocked error.
		setRepeatError(null);
		commit((prev) => ({
			...prev,
			measures: prev.measures.map((m, i) => {
				if (i !== measureIndex) return m;
				const next: Measure = { ...m, ...patch };
				if (!next.repeatStart) delete next.repeatStart;
				if (!next.repeatEnd) {
					delete next.repeatEnd;
					delete next.repeatTimes;
				}
				return next;
			}),
		}));
	}

	// ── Split / merge / replace-with-whole (single selected column) ──────────

	function applySplit(target: SlotTarget, duration: Duration) {
		applyMeasures(
			splitSlot(
				working.measures,
				target.measureIndex,
				target.slotIndex,
				duration,
				working.timeSignature,
			),
		);
		setSelectedColumns(new Set());
		setPopupConfirm(null);
	}

	function requestMerge(target: SlotTarget, duration: Duration) {
		const res = mergeSlots(
			working.measures,
			target.measureIndex,
			target.slotIndex,
			duration,
			working.timeSignature,
		);
		if (res.type === "confirm") {
			setPopupConfirm({
				kind: "merge",
				affectedSlotCount: res.affectedSlotCount,
				pendingMeasures: res.pendingMeasures,
			});
		} else {
			applyMeasures(res.measures);
			setSelectedColumns(new Set());
		}
	}

	function requestReplaceWithWhole(target: SlotTarget) {
		const res = resetMeasure(
			working.measures,
			target.measureIndex,
			"whole",
			working.timeSignature,
		);
		if (res.type === "confirm") {
			setPopupConfirm({ kind: "whole", pendingMeasures: res.measures });
		} else {
			applyMeasures(res.measures);
			setSelectedColumns(new Set());
		}
	}

	function confirmPopup() {
		if (!popupConfirm) return;
		if (popupConfirm.kind === "roll") {
			// Overwrite: the slot's notes go, the shape's frets come in.
			commit((prev) =>
				popupConfirm.targets.reduce((p, t) => fillFromChordAt(clearSlotStrings(p, t), t), prev),
			);
			setPopupConfirm(null);
			return;
		}
		applyMeasures(popupConfirm.pendingMeasures);
		setSelectedColumns(new Set());
		setPopupConfirm(null);
	}

	// ── Quick preset row (per measure) ───────────────────────────────────────

	function requestPreset(measureIndex: number, duration: Duration) {
		const res = resetMeasure(working.measures, measureIndex, duration, working.timeSignature);
		if (res.type === "confirm") {
			setPresetConfirm({ measureIndex, targetDuration: duration });
		} else {
			applyMeasures(res.measures);
		}
	}

	function applyPresetRemap() {
		if (!presetConfirm) return;
		applyMeasures(
			remapMeasure(
				working.measures,
				presetConfirm.measureIndex,
				presetConfirm.targetDuration,
				working.timeSignature,
			),
		);
		setPresetConfirm(null);
	}

	function applyPresetClear() {
		if (!presetConfirm) return;
		const res = resetMeasure(
			working.measures,
			presetConfirm.measureIndex,
			presetConfirm.targetDuration,
			working.timeSignature,
		);
		applyMeasures(res.measures);
		setPresetConfirm(null);
	}

	// ── Pick sequence (per measure) ──────────────────────────────────────────

	// Parse the measure's typed sequence and write it, asking first when the
	// measure already holds notes. Shapes still on their way block the apply
	// rather than silently writing open strings.
	function requestPickSequence(measureIndex: number) {
		const measure = working.measures[measureIndex];
		if (!measure) return;
		const parsed = parsePickSequence(pickInputs[measure.id] ?? "", working.timeSignature);
		if (!parsed.ok) {
			setPickNotice({ measureId: measure.id, kind: "error", lines: [parsed.error] });
			return;
		}
		const pendingShapes = chordsInEffect[measureIndex].some(
			(ref) => ref !== null && voicingsFor(ref).status === "loading",
		);
		if (pendingShapes) {
			setPickNotice({
				measureId: measure.id,
				kind: "error",
				lines: ["Chord shapes are still loading — try again in a moment."],
			});
			return;
		}
		if (measure.slots.some(slotHasStringData)) {
			setPickConfirm({ measureIndex, parsed });
			return;
		}
		applyPickSequenceNow(measureIndex, parsed);
	}

	function applyPickSequenceNow(
		measureIndex: number,
		parsed: Extract<PickSequenceParse, { ok: true }>,
	) {
		const measure = working.measures[measureIndex];
		if (!measure) return;
		const result = applyPickSequence(working, measureIndex, parsed, (ref) => {
			const state = voicingsFor(ref);
			return state.status === "ready" ? selectRefVoicing(ref, state.voicings) : null;
		});
		commit(() => result.pattern);
		setPickConfirm(null);
		setPickNotice(
			result.warnings.length > 0
				? { measureId: measure.id, kind: "warning", lines: result.warnings }
				: null,
		);
	}

	// Rest toggle is active only when every selected column is already a rest.
	const allSelectedRest: boolean = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return false;
		return targets.every((t) => !!working.measures[t.measureIndex]?.slots[t.slotIndex]?.isRest);
	})();

	// Stroke highlighted in the roll picker = the shared stroke of all selected slots
	// ("none" when they all lack one). "mixed" when they disagree, so nothing lights up.
	const selectedStroke: "none" | Stroke | "mixed" = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return "none";
		const strokes = targets.map(
			(t) => working.measures[t.measureIndex]?.slots[t.slotIndex]?.stroke,
		);
		const first = strokes[0];
		return strokes.every((s) => s === first) ? (first ?? "none") : "mixed";
	})();

	// The column popup is anchored below the first selected column's selector.
	const firstSelectedColumn: SlotTarget | null =
		selectedColumns.size > 0
			? [...selectedColumns]
					.map(parseColumnKey)
					.sort((a, b) => a.measureIndex - b.measureIndex || a.slotIndex - b.slotIndex)[0]
			: null;
	const firstSelectedColumnKey = firstSelectedColumn ? columnKey(firstSelectedColumn) : null;

	// Anchor direction: columns in the left half of their measure open the popup to
	// the right (default); columns in the right half open it to the left so it never
	// spills past the rightmost measure's edge.
	const popupOpensLeft = (() => {
		if (!firstSelectedColumn) return false;
		const totalSlots = working.measures[firstSelectedColumn.measureIndex]?.slots.length ?? 0;
		return firstSelectedColumn.slotIndex >= totalSlots / 2;
	})();

	// Position the column popup just below the selected column, in the scroll region's
	// own coordinate space, so it lives inside the dialog (never spilling outside it)
	// and scrolls with the grid — the same anchoring model as the technique menu.
	// Recomputed on scroll (capture, to catch the measure's inner horizontal scroll)
	// and resize; setPopupPos bails when the numbers are unchanged so a stable scroll
	// doesn't churn the auto-scroll effect below.
	useIsomorphicLayoutEffect(() => {
		if (!firstSelectedColumnKey) {
			setPopupPos(null);
			return;
		}
		const GAP = 6;
		const compute = () => {
			const el = popupAnchorRef.current;
			const scroller = scrollRef.current;
			if (!el || !scroller) return;
			const scRect = scroller.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const top = r.bottom - scRect.top + scroller.scrollTop + GAP;
			// Columns in the right half of their measure open the popup leftwards (its
			// right edge aligned to the column) so it doesn't shoot off the right; the
			// rest open rightwards from the column's left edge. Clamp to 0 so it never
			// starts off the left edge. offsetWidth is read from the already-rendered
			// (visibility-hidden until positioned) popup.
			const popupW = popupRef.current?.offsetWidth ?? 0;
			const rawLeft = popupOpensLeft
				? r.right - scRect.left + scroller.scrollLeft - popupW
				: r.left - scRect.left + scroller.scrollLeft;
			const left = Math.max(0, rawLeft);
			setPopupPos((prev) =>
				prev && prev.top === top && prev.left === left ? prev : { top, left },
			);
		};
		compute();
		window.addEventListener("resize", compute);
		window.addEventListener("scroll", compute, true);
		return () => {
			window.removeEventListener("resize", compute);
			window.removeEventListener("scroll", compute, true);
		};
	}, [firstSelectedColumnKey, popupOpensLeft]);

	// Nudge the scroll region just enough to bring the whole column popup into view
	// when it overflows the viewport (e.g. selecting a column in the bottom measure).
	// Mirrors the technique-menu auto-scroll: runs after layout so the popup has its
	// real size, and re-runs when its position or content height changes (selection,
	// single↔multi controls, or an inline confirmation appearing).
	//
	// The nudge never scrolls the selected column's measure out of view: the popup
	// is about that column, and the player needs to see it. Where the popup would
	// still not fit below the anchor, it is capped to the room left and scrolls
	// inside itself instead.
	useIsomorphicLayoutEffect(() => {
		if (!firstSelectedColumnKey || !popupPos) return;
		const popup = popupRef.current;
		const scroller = scrollRef.current;
		if (!popup || !scroller) return;
		const PAD = 8;
		const popupRect = popup.getBoundingClientRect();
		const viewRect = scroller.getBoundingClientRect();
		const block = popupAnchorRef.current?.closest<HTMLElement>("[data-measure-id]");
		const blockTop = block?.getBoundingClientRect().top ?? popupRect.top;
		// The popup's full content height, whatever cap it is under right now.
		const naturalHeight = popup.scrollHeight + (popupRect.height - popup.clientHeight);
		// The Chord section must always be showable whole: it is the part that
		// grows (shape card, result list) and the part being worked on.
		const chordHeight = chordSectionRef.current?.getBoundingClientRect().height ?? 0;
		const leastHeight = Math.min(naturalHeight, Math.max(160, chordHeight + 24));
		let dx = 0;
		let dy = 0;
		if (popupRect.right > viewRect.right - PAD) dx = popupRect.right - (viewRect.right - PAD);
		else if (popupRect.left < viewRect.left + PAD) dx = popupRect.left - (viewRect.left + PAD);
		let maxHeight = naturalHeight;
		if (popupRect.top + naturalHeight > viewRect.bottom - PAD) {
			// Scroll down as far as keeps the measure's top edge in view; what still
			// hangs below is the popup's own scroll — but never less than the Chord
			// section needs, even if that costs a little of the measure's top.
			const cap = Math.max(0, blockTop - (viewRect.top + PAD));
			const roomAtCap = viewRect.bottom - PAD - (popupRect.top - cap);
			maxHeight = Math.floor(Math.max(roomAtCap, leastHeight));
			dy = popupRect.top + maxHeight - (viewRect.bottom - PAD);
		} else if (popupRect.top < viewRect.top + PAD) {
			dy = popupRect.top - (viewRect.top + PAD);
		}
		setPopupMaxHeight((prev) => (prev === maxHeight ? prev : maxHeight));
		if (dx !== 0 || dy !== 0) scroller.scrollBy({ left: dx, top: dy, behavior: "smooth" });
		// `popupMaxHeight` is a dep on purpose: the cap applied by this pass changes
		// how far the scroll region can scroll, so the nudge is settled on the next.
	}, [firstSelectedColumnKey, popupPos, popupConfirm, selectedColumns, revealChordTick, popupMaxHeight]);

	// Bring the Chord section into view inside the popup whenever the chord is
	// being worked on: on focus landing in it, and after every chord edit.
	const revealChordSection = useCallback(() => {
		const popup = popupRef.current;
		const section = chordSectionRef.current;
		if (!popup || !section) return;
		const p = popup.getBoundingClientRect();
		const c = section.getBoundingClientRect();
		if (c.bottom > p.bottom) popup.scrollTop += c.bottom - p.bottom + 4;
		else if (c.top < p.top) popup.scrollTop -= p.top - c.top + 4;
	}, []);
	// Re-run when the cap is applied too: the first reveal may have happened on
	// an uncapped popup, where everything was in view anyway.
	useIsomorphicLayoutEffect(() => {
		if (revealChordTick === 0) return;
		if (Date.now() - lastChordEditRef.current > 3000) return;
		revealChordSection();
	}, [revealChordTick, popupMaxHeight, revealChordSection]);
	// The section also grows on its own — the result list opening under the
	// search field, a shape card arriving — and while the player's focus is in
	// it, that growth should stay in view too.
	useEffect(() => {
		const section = chordSectionRef.current;
		if (!section || !firstSelectedColumnKey) return;
		let lastHeight = section.getBoundingClientRect().height;
		const observer = new ResizeObserver(() => {
			const height = section.getBoundingClientRect().height;
			if (height === lastHeight) return;
			lastHeight = height;
			const recentEdit = Date.now() - lastChordEditRef.current < 3000;
			if (section.contains(document.activeElement) || recentEdit) setRevealChordTick((t) => t + 1);
		});
		observer.observe(section);
		return () => observer.disconnect();
	}, [firstSelectedColumnKey, selectedColumns]);

	// When the technique menu opens near the grid's edge (e.g. right-clicking the
	// last cell in a row), it's clipped by the scroll area. Nudge the scroll area
	// just enough to bring the whole menu into view — so the user never has to
	// scroll manually to reach its options. Runs after layout so the menu has its
	// real size. techMenu.x/y are the deps: a fresh open re-measures.
	useIsomorphicLayoutEffect(() => {
		if (!techMenu) return;
		const menu = techMenuRef.current;
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
	}, [techMenu]);

	// Split/merge/whole controls act on a single slot. When exactly one column is
	// selected, enumerate that slot's split and merge targets from live state.
	const singleTarget: SlotTarget | null = selectedColumns.size === 1 ? columnTargets()[0] : null;
	const singleMeasure = singleTarget ? working.measures[singleTarget.measureIndex] : null;

	// Smaller note values this slot can be split into (even subdivisions that fit the
	// measure's remaining capacity), and larger values the following slots can merge
	// up to — both enumerated by the shared lib helpers.
	const splitOptions =
		singleTarget && singleMeasure
			? splitTargetsForSlot(singleMeasure, singleTarget.slotIndex, working.timeSignature)
			: [];
	const mergeOptions =
		singleTarget && singleMeasure
			? mergeTargetsForSlot(singleMeasure, singleTarget.slotIndex)
			: [];

	// The chord section of the popup: the slot's own mark, if any, and the chord
	// in effect there (its own, or one running on from an earlier slot).
	const ownChord: ChordRef | null = singleTarget
		? (working.measures[singleTarget.measureIndex]?.slots[singleTarget.slotIndex]?.chord ??
			null)
		: null;
	const chordHere: ChordRef | null = singleTarget
		? (chordsInEffect[singleTarget.measureIndex]?.[singleTarget.slotIndex] ?? null)
		: null;
	// For a multi-slot selection: the chord in effect at its first slot.
	const chordAtSelectionStart: ChordRef | null = firstSelectedColumn
		? (chordsInEffect[firstSelectedColumn.measureIndex]?.[firstSelectedColumn.slotIndex] ?? null)
		: null;
	const voicingsHere = chordHere ? voicingsFor(chordHere) : null;
	const voicingList = voicingsHere?.status === "ready" ? voicingsHere.voicings : [];
	const voicingHere = chordHere && voicingList.length > 0 ? selectRefVoicing(chordHere, voicingList) : null;
	const voicingIndex = voicingHere ? voicingList.findIndex((v) => v.id === voicingHere.id) : -1;

	// Write the shape's frets into the slot's empty cells.
	function applyFillFromChord() {
		if (!singleTarget || !voicingHere) return;
		commit((prev) => fillColumnFromChord(prev, singleTarget, voicingHere));
	}

	// Take away the notes this measure holds on strings the shape leaves out.
	function applyClearLeftOut() {
		if (!singleTarget || !chordHere || !voicingHere) return;
		commit((prev) => clearLeftOutStrings(prev, singleTarget.measureIndex, chordHere, voicingHere));
	}

	// A chord the search knows nothing about is written down as a shape of the
	// player's own, then set on the slot it was searched for.
	function handleShapeCreated(voicing: UserChordVoicing) {
		if (!shapeCreate) return;
		// Pin what was stored: an identical shape already on record keeps its id.
		const stored = saveVoicing(voicing);
		applySlotChord(shapeCreate.target, {
			root: stored.root,
			suffix: stored.suffix,
			voicingId: stored.id,
		});
		setShapeCreate(null);
	}

	// Frets typed into the search ("x32010") seed the editor; a name seeds the
	// chord-name field instead. Memoized: the editor re-seeds whenever the seed's
	// identity changes, so a fresh object per render would wipe its edits.
	const shapeCreateSeed = useMemo(() => {
		if (!shapeCreate) return { chord: null, namingFrom: undefined, initialVoicing: null };
		if ("chord" in shapeCreate) {
			return { chord: shapeCreate.chord, namingFrom: undefined, initialVoicing: shapeCreate.from };
		}
		const { frets } = parseTabSequence(shapeCreate.query);
		if (frets) {
			return {
				chord: null,
				namingFrom: undefined,
				initialVoicing: chordShapeToVoicing(tabSequenceToShape(frets), "draft"),
			};
		}
		return { chord: null, namingFrom: shapeCreate.query, initialVoicing: null };
	}, [shapeCreate]);

	// Empty one string of one measure — the × that appears beside the string
	// label while its row is hovered.
	function applyClearString(measureIndex: number, stringIndex: number) {
		commit((prev) => clearString(prev, stringIndex, measureIndex));
	}

	// Step to another shape of the same chord. Pinning a shape on a slot that only
	// inherits its chord writes a mark there: a voicing change is a change.
	function stepVoicing(delta: number) {
		if (!singleTarget || !chordHere || voicingList.length < 2 || voicingIndex < 0) return;
		const next = voicingList[(voicingIndex + delta + voicingList.length) % voicingList.length];
		applySlotChord(singleTarget, { root: chordHere.root, suffix: chordHere.suffix, voicingId: next.id });
	}

	// Show "Replace with whole note" only when the measure has content to replace:
	// more than one slot, or a lone slot that isn't already an empty whole note.
	const measureHasContent =
		!!singleMeasure &&
		(singleMeasure.slots.length > 1 ||
			singleMeasure.slots.some((s) => s.strings.some((sf) => sf.fret !== null || sf.muted)) ||
			singleMeasure.slots[0]?.duration !== "whole");

	const columnPopup = (
		<div
			ref={popupRef}
			// Absolutely positioned inside the scroll region (like the technique menu), so
			// it stays clipped to the dialog and scrolls with the grid. Rendered as soon
			// as a column is selected but kept hidden (yet measurable, for its width) until
			// the layout effect has computed its content-relative position.
			style={{
				position: "absolute",
				top: popupPos?.top ?? 0,
				left: popupPos?.left ?? 0,
				visibility: popupPos ? "visible" : "hidden",
				maxHeight: popupMaxHeight ?? undefined,
			}}
			className="z-60 w-60 border border-line-strong bg-popover p-2 flex flex-col gap-2 shadow-lg overflow-y-auto fp-thin-scroll"
		>
			{/* Done — a way out of the selection that does not need a press
			    somewhere else. Sticky so it stays in the corner while the popup
			    scrolls; zero height so it takes no room from the sections. */}
			<div className="sticky top-0 z-10 flex h-0 justify-end overflow-visible">
				<button
					type="button"
					onClick={() => {
						setSelectedColumns(new Set());
						setPopupConfirm(null);
					}}
					aria-label="Done with this slot"
					title="Done — close this popup"
					className="-mt-1 -mr-1 flex h-6 w-6 items-center justify-center border border-line-strong bg-popover text-ink-dim hover:border-denim hover:text-denim transition-colors"
				>
					<Check size={13} />
				</button>
			</div>
			{/* Move — structural edits on the selected slot. Single selection only:
			    with several slots picked, the popup is about what they share. */}
			{singleTarget && (
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label="Move Slot"
					hint="Insert, duplicate, or delete this slot."
				/>
				<div className="flex gap-1">
					<PopupIconButton
						title="Insert before"
						onClick={() => applyStructural("before")}
					>
						<ArrowLeftToLine size={14} />
					</PopupIconButton>
					<PopupIconButton title="Insert after" onClick={() => applyStructural("after")}>
						<ArrowRightToLine size={14} />
					</PopupIconButton>
					<PopupIconButton title="Duplicate" onClick={() => applyStructural("duplicate")}>
						<Copy size={14} />
					</PopupIconButton>
					<PopupIconButton
						title="Delete"
						onClick={() => applyStructural("delete")}
						danger
					>
						<Trash2 size={14} />
					</PopupIconButton>
				</div>
			</div>
			)}
			{/* Split / merge (single column only). Split subdivides the slot into equal
			    smaller notes; merge folds this slot plus the following run into any larger
			    note value they sum to. Both preserve the measure total. */}
			{singleTarget &&
				!popupConfirm &&
				(splitOptions.length > 0 || mergeOptions.length > 0) && (
					<div className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
						{splitOptions.length > 0 && (
							<div className="flex flex-wrap items-center gap-1">
								<PopupSectionLabel
									label="Split"
									hint="Break this note into smaller, even notes."
								/>
								{splitOptions.map(({ duration, count }) => (
									<button
										key={duration}
										onClick={() => applySplit(singleTarget, duration)}
										title={`Split into ${count} × ${duration}`}
										className="flex items-center gap-0.5 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
									>
										{count}×<DurationIcon duration={duration} />
									</button>
								))}
							</div>
						)}
						{mergeOptions.length > 0 && (
							<div className="flex flex-wrap items-center gap-1">
								<PopupSectionLabel
									label="Merge"
									hint="Join this note with the ones after it into one longer note."
								/>
								{mergeOptions.map(({ duration, count }) => (
									<button
										key={duration}
										onClick={() => requestMerge(singleTarget, duration)}
										title={`Merge ${count} slots into a ${duration}`}
										className="flex items-center gap-0.5 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
									>
										<Merge size={13} />
										<DurationIcon duration={duration} />
									</button>
								))}
							</div>
						)}
					</div>
				)}

			{/* Replace whole measure with a single whole note (single column only) */}
			{singleTarget && measureHasContent && !popupConfirm && (
				<div className="border-t border-line pt-2 first:border-t-0 first:pt-0">
					<button
						onClick={() => requestReplaceWithWhole(singleTarget)}
						title="Clear the whole measure back to one empty note."
						className="flex items-center gap-1 h-7 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
					>
						Replace with <DurationIcon duration="whole" />
					</button>
				</div>
			)}

			{/* Inline confirmation for a destructive merge / whole-replace */}
			{popupConfirm && (
				<div className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
					<span className="text-[11px] text-ink-dim">
						{popupConfirm.kind === "merge"
							? `This will discard data from ${popupConfirm.affectedSlotCount} slot(s). Continue?`
							: popupConfirm.kind === "roll"
								? `${popupConfirm.targets.length === 1 ? "This slot holds" : `${popupConfirm.targets.length} slots hold`} notes outside the chord shape. Overwrite with the shape?`
								: "This will replace the measure's content. Continue?"}
					</span>
					<div className="flex gap-1">
						<button
							onClick={() => setPopupConfirm(null)}
							className="h-7 px-2 text-xs text-ink-dim hover:bg-raise active:bg-denim-tint transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={confirmPopup}
							className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
						>
							Confirm
						</button>
					</div>
				</div>
			)}

			{/* Roll (arpeggiated-chord) selector — slot-level, applies to every
			    selected column. Rings the strings out one at a time instead of together. */}
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label="Roll"
					hint="Ring the strings out one at a time instead of all together."
				/>
				<div className="flex border border-line-strong">
					{STROKE_PICKER.map((s, i) => (
						<button
							key={s.value}
							onClick={() => applyStroke(s.value === "none" ? undefined : s.value)}
							title={
								s.value === "none"
									? "No roll — sound the strings together"
									: s.value === "roll-down"
										? "Roll down — low to high strings"
										: "Roll up — high to low strings"
							}
							className={`h-7 flex-1 px-2 flex items-center justify-center gap-1 font-mono text-xs font-semibold transition-colors ${
								i > 0 ? "border-l border-line-strong" : ""
							} ${
								selectedStroke === s.value
									? "bg-denim text-on-denim"
									: "text-ink-dim hover:bg-denim-tint hover:text-denim"
							}`}
						>
							{s.value === "roll-down" && <ArrowDown size={12} aria-hidden />}
							{s.value === "roll-up" && <ArrowUp size={12} aria-hidden />}
							{s.label}
						</button>
					))}
				</div>
			</div>

			{/* Rest — silences the selected column(s) while keeping their rhythmic
			    duration, so the measure total never changes. */}
			<div className="flex flex-col gap-1 border-t border-line pt-2 first:border-t-0 first:pt-0">
				<PopupSectionLabel
					label="Rest"
					hint="Silence this slot but keep its timing in the measure."
				/>
				<button
					onClick={() => applyRest(!allSelectedRest)}
					title={
						allSelectedRest
							? "Turn the rest back into a note"
							: "Silence this slot (keeps its duration as a rest)"
					}
					className={`h-7 px-2 font-mono text-xs font-semibold border border-line-strong transition-colors self-start ${
						allSelectedRest
							? "bg-denim text-on-denim"
							: "text-ink-dim hover:bg-denim-tint hover:text-denim"
					}`}
				>
					Rest
				</button>
			</div>

			{/* Chord — a change marked on this slot, running on until the next mark.
			    Single column only: a chord starts at one point in time. */}
			{singleTarget && !popupConfirm && (
				<div
					ref={chordSectionRef}
					onFocusCapture={revealChordSection}
					className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0"
				>
					<PopupSectionLabel
						label="Chord"
						hint="Start a chord here. It runs until the next chord mark, across measures."
					/>
					<div className="flex items-center gap-1.5">
						<ChordSearchSelect
							chord={ownChord}
							onChange={(chord) => applySlotChord(singleTarget, chord)}
							onCreate={(query) => setShapeCreate({ target: singleTarget, query })}
							index={searchIndex}
							shapeCorpus={shapeCorpus}
							inlineList
							ariaLabel={`Chord at measure ${singleTarget.measureIndex + 1}, slot ${singleTarget.slotIndex + 1}`}
						/>
						{!ownChord && chordHere && (
							<button
								type="button"
								onClick={() => applySlotChord(singleTarget, chordHere)}
								title={`${chordSymbolLabel(chordHere)} is running on from an earlier slot — press to write it here, with the shape chosen there`}
								className="flex h-7 items-center gap-1 px-1.5 font-mono text-[10px] text-ink-faint hover:bg-denim-tint hover:text-denim transition-colors"
							>
								<CornerDownLeft size={11} />
								{chordSymbolLabel(chordHere)}
							</button>
						)}
					</div>
					{chordHere && voicingsHere?.status === "loading" && (
						<span className="font-mono text-[10px] text-ink-faint">Loading shapes…</span>
					)}
					{chordHere && voicingsHere?.status === "ready" && !voicingHere && (
						<span className="font-mono text-[10px] text-destructive">
							No shape in the library for {chordSymbolLabel(chordHere)}.
						</span>
					)}
					{chordHere && voicingHere && (
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => stepVoicing(-1)}
								disabled={voicingList.length < 2}
								aria-label="Previous shape"
								title="Previous shape"
								className="flex h-7 w-6 items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
							>
								<ChevronLeft size={14} />
							</button>
							{/* Fixed footprint whatever the label says, so the ‹ › buttons and
							    the shape stay put while the player steps through voicings. */}
							<div className="mx-auto w-36 shrink-0 [&>div]:h-[9.5rem] [&>div]:justify-center">
								<ChordDiagram
									def={chordVoicingToVexChords(voicingHere)}
									label={
										voicingList.length > 1
											? `${chordSymbolLabel(chordHere)} · ${voicingIndex + 1}/${voicingList.length}`
											: chordSymbolLabel(chordHere)
									}
									size="compact"
								/>
							</div>
							<button
								type="button"
								onClick={() => stepVoicing(1)}
								disabled={voicingList.length < 2}
								aria-label="Next shape"
								title="Next shape"
								className="flex h-7 w-6 items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
							>
								<ChevronRight size={14} />
							</button>
						</div>
					)}
					{/* The shape the player needs may not be among the ones on offer: a
					    new one starts from the shape on screen and is pinned to this slot. */}
					{chordHere && voicingsHere?.status === "ready" && (
						<button
							type="button"
							onClick={() =>
								setShapeCreate({ target: singleTarget, chord: chordHere, from: voicingHere })
							}
							title={`Write a new shape for ${chordSymbolLabel(chordHere)} and use it here`}
							className="flex h-7 items-center gap-1 self-start border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
						>
							<Plus size={12} />
							New shape for {chordSymbolLabel(chordHere)}
						</button>
					)}
					{chordHere && voicingHere && (
						<div className="flex flex-wrap gap-1">
							<button
								type="button"
								onClick={applyFillFromChord}
								title="Write this shape's frets into the slot's empty cells. Cells already holding a fret or a dead note are left alone."
								className="h-7 border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
							>
								Fill column
							</button>
							{chordFretHints(voicingHere).includes("/") && (
								<button
									type="button"
									onClick={applyClearLeftOut}
									title={`Remove this measure's notes on the strings the ${chordSymbolLabel(chordHere)} shape doesn't sound, wherever it is in effect.`}
									className="h-7 border border-line-strong px-2 font-mono text-xs font-semibold text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
								>
									Clear left-out strings
								</button>
							)}
						</div>
					)}
				</div>
			)}

			{/* Chord over a multi-slot selection: one chord written across every
			    selected slot. The first selected slot's chord is offered as the
			    quick pick, since that is usually the one being extended. */}
			{selectedColumns.size > 1 && !popupConfirm && (
				<div
					ref={chordSectionRef}
					onFocusCapture={revealChordSection}
					className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0"
				>
					<PopupSectionLabel
						label="Chord"
						hint={`Put one chord over the ${selectedColumns.size} selected slots.`}
					/>
					<div className="flex items-center gap-1.5">
						<ChordSearchSelect
							chord={null}
							onChange={(chord) => chord && applyChordToSelection(chord)}
							index={searchIndex}
							shapeCorpus={shapeCorpus}
							inlineList
							ariaLabel={`Chord for the ${selectedColumns.size} selected slots`}
						/>
						{chordAtSelectionStart && (
							<button
								type="button"
								onClick={() => applyChordToSelection(chordAtSelectionStart)}
								title={`Write ${chordSymbolLabel(chordAtSelectionStart)} — the chord at the first selected slot — over all ${selectedColumns.size}`}
								className="flex h-7 items-center gap-1 px-1.5 font-mono text-[10px] text-ink-faint hover:bg-denim-tint hover:text-denim transition-colors"
							>
								<CornerDownLeft size={11} />
								{chordSymbolLabel(chordAtSelectionStart)}
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);

	// ── Close guard ───────────────────────────────────────────────────────────

	// True when the live pattern differs from the snapshot taken on open (i.e.
	// there are unsaved edits — fret, slot, duration or metadata changes).
	const isDirty = () => JSON.stringify(workingRef.current) !== pristineRef.current;

	// Clear the confirmation and actually close.
	function doClose() {
		setDiscardConfirm(false);
		onClose();
	}

	// Entry point for every close affordance (header button, outside click,
	// Escape). Guards against discarding unsaved edits with an inline confirm.
	function requestClose() {
		if (isDirty()) setDiscardConfirm(true);
		else doClose();
	}

	// ── Metadata edits ────────────────────────────────────────────────────────

	function handleSave() {
		if (!working.name.trim()) return;
		// Block save on unclosed / dangling / nested repeat barlines so playback and
		// rendering never see malformed repeat markup.
		const { error: repeatValidationError } = deriveRepeatDirectives(working.measures);
		if (repeatValidationError) {
			setRepeatError(repeatValidationError);
			return;
		}
		setRepeatError(null);
		// Spring-pop the button as the save fires (skip for reduced-motion). Pure
		// transform, so no reflow; the save/close flow below is unchanged.
		if (!prefersReducedMotion()) {
			saveButtonRef.current?.animate(
				[
					{ transform: "scale(1)" },
					{ transform: "scale(1.08)" },
					{ transform: "scale(1)" },
				],
				{ duration: 300, easing: SPRING_POP_EASING },
			);
		}
		onSave({
			...working,
			name: working.name.trim(),
			bpm: Math.min(MAX_BPM, Math.max(MIN_BPM, working.bpm)),
		});
		onClose();
	}

	const nameValid = working.name.trim().length > 0;

	// The selected cell's live string data, used to gate the touch mute button:
	// an already-muted cell needs no mute affordance, so the button is hidden
	// until the cell is un-muted (or a different, non-muted cell is selected).
	const selectedStringFret: StringFret | null = selectedCell
		? (working.measures[selectedCell.measureIndex]?.slots[selectedCell.slotIndex]?.strings[
				selectedCell.stringIndex
			] ?? null)
		: null;

	// Dynamic desktop (lg+) width: grow with measure count, 2 → 4 columns, then
	// stop (extra measures wrap). Below lg the static md:2 / sm:1 layout applies.
	// width = cols × (block + gap) + horizontal chrome (all rem).
	const lgCols = Math.min(Math.max(working.measures.length, 2), 4);
	const modalWidthRem =
		lgCols * MEASURE_BLOCK_REM + (lgCols - 1) * GRID_GAP_REM + MODAL_CHROME_REM;
	const dynamicStyle = {
		"--fp-w": `${modalWidthRem}rem`,
		"--fp-cols": String(lgCols),
	} as React.CSSProperties;

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && requestClose()}>
			<DialogContent
				showCloseButton={false}
				style={dynamicStyle}
				className="w-full max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-3xl lg:w-(--fp-w) lg:max-w-[min(var(--fp-w),96vw)] max-h-[80vh] lg:max-h-[90vh] overflow-hidden flex flex-col p-0"
				onKeyDown={(e) => {
					// Undo/redo scoped to the modal (not window) to avoid clashing with
					// the page. Skip text fields so their native undo keeps working.
					if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
					const tag = (e.target as HTMLElement).tagName;
					if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
					e.preventDefault();
					if (e.shiftKey) redo();
					else undo();
				}}
				onEscapeKeyDown={(e) => {
					if (techMenu || selectedColumns.size > 0) {
						e.preventDefault();
						setTechMenu(null);
						setSelectedColumns(new Set());
					}
				}}
			>
				{/* ── Header (fixed; only the grid between it and the footer scrolls) ── */}
				<div className="shrink-0 z-55 flex items-center justify-between border-b border-line bg-popover px-4 py-3">
					<h2 className="font-heading text-base font-medium text-ink">
						{initialPattern ? "Edit pattern" : "New pattern"}
					</h2>
					<div className="flex items-center gap-1">
						<button
							onClick={undo}
							disabled={!canUndo}
							aria-label="Undo"
							title="Undo (⌘Z)"
							className="h-8 w-8 flex items-center justify-center text-ink-dim hover:bg-raise hover:text-ink active:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-dim transition-colors"
						>
							<Undo2 size={16} />
						</button>
						<button
							onClick={redo}
							disabled={!canRedo}
							aria-label="Redo"
							title="Redo (⌘⇧Z)"
							className="h-8 w-8 flex items-center justify-center text-ink-dim hover:bg-raise hover:text-ink active:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-dim transition-colors"
						>
							<Redo2 size={16} />
						</button>
						{discardConfirm ? (
							<div className="flex items-center gap-2">
								<span className="text-xs text-ink-dim">Discard changes?</span>
								<button
									onClick={() => setDiscardConfirm(false)}
									className="h-8 px-3 text-xs font-medium text-ink-dim hover:bg-raise active:bg-denim-tint transition-colors"
								>
									Keep editing
								</button>
								<button
									onClick={doClose}
									className="h-8 px-3 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 transition-colors"
								>
									Discard
								</button>
							</div>
						) : (
							<button
								onClick={requestClose}
								aria-label="Close"
								className="h-8 w-8 flex items-center justify-center text-ink-dim hover:bg-raise hover:text-ink active:bg-denim-tint transition-colors"
							>
								<XIcon size={18} />
							</button>
						)}
					</div>
				</div>

				{/* ── Metadata bar (fixed, above the scroll region) ─────────────── */}
				<div className="shrink-0 flex flex-wrap items-end gap-3 px-4">
					<div className="flex flex-col gap-1 min-w-40 flex-[2]">
						<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Name
						</label>
						<input
							type="text"
							value={working.name}
							onChange={(e) => commit((p) => ({ ...p, name: e.target.value }))}
							placeholder="Pattern name"
							className={`w-full border bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent ${
								nameValid ? "border-line-strong" : "border-destructive"
							}`}
						/>
					</div>
					<div className="flex flex-col gap-1 w-20 shrink-0">
						<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							BPM
						</label>
						<input
							type="number"
							min={MIN_BPM}
							max={MAX_BPM}
							value={working.bpm}
							onChange={(e) =>
								commit((p) => ({ ...p, bpm: Number(e.target.value) || 0 }))
							}
							className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						/>
					</div>
					<div className="flex flex-col gap-1 w-20 shrink-0">
						<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Capo
						</label>
						{/* The TAB is written relative to the capo, so playback sounds this
						    many semitones higher. Empty = no capo. */}
						<input
							type="number"
							min={0}
							max={STRUM_CAPO_MAX}
							value={patternCapo(working) === 0 ? "" : patternCapo(working)}
							onChange={(e) =>
								commit((p) => setPatternCapo(p, Number(e.target.value) || 0))
							}
							placeholder="0"
							aria-label="Capo fret — empty means no capo"
							className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						/>
					</div>
					<div className="flex flex-col gap-1 w-20 shrink-0">
						<label className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Time Sig.
							{/* Time signature is fixed at 4/4 until other meters ship. CSS
							    group-hover tooltip (75ms fade) instead of the native `title`,
							    which has a slow browser-controlled delay. */}
							<span className="group/ts relative inline-flex cursor-help text-ink-faint/70">
								<CircleHelp size={11} aria-label="More time signatures coming soon" />
								<span
									role="tooltip"
									className="pointer-events-none absolute left-0 top-full z-70 mt-1 w-max max-w-52 whitespace-normal border border-line-strong bg-popover px-2 py-1 font-sans text-[10px] normal-case leading-snug tracking-normal text-ink-dim opacity-0 shadow-md transition-opacity duration-75 group-hover/ts:opacity-100"
								>
									Only 4/4 is supported right now — more time signatures coming
									soon.
								</span>
							</span>
						</label>
						<div className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink">
							4/4
						</div>
					</div>
					<div className="flex flex-col gap-1 min-w-40 flex-[2]">
						<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Description
						</label>
						<input
							type="text"
							value={working.description ?? ""}
							onChange={(e) => commit((p) => ({ ...p, description: e.target.value }))}
							placeholder="Optional"
							className="w-full border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						/>
					</div>
				</div>

				{/* ── Grid ──────────────────────────────────────────────────────── */}
				{/* sm: 1/row, md: 2/row. At lg+ the column count tracks the measure
				    count (2→4, --fp-cols) in step with the dynamic modal width, so
				    measures fill each row and the extra (add) tile wraps below. */}
				{/* ── Scroll region — the ONLY part that scrolls ─────────────────── */}
				{/* Header, metadata, and footer stay pinned; this middle box scrolls
				    both axes. It's also the coordinate space the absolute popups
				    (technique menu, touch-mute, hidden input) are anchored in, so they
				    live inside it and scroll with the grid. fp-thin-scroll keeps the
				    bar a slim denim line. */}
				<div
					data-fp-scroll
					ref={scrollRef}
					className="fp-thin-scroll relative min-h-0 flex-1 overflow-auto"
				>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(var(--fp-cols),minmax(0,1fr))] gap-4 px-4 select-none">
						{working.measures.map((measure, measureIndex) => {
							const beatLabels = computeBeatLabels(
								measure.slots,
								working.timeSignature,
							);
							const beatGroups = computeBeatGroups(
								measure.slots,
								working.timeSignature,
							);
							const hoverInMeasure =
								hoveredCell?.measureIndex === measureIndex ? hoveredCell : null;
							// Slot indices sharing the hovered slot's binary-parent window (two
							// sixteenths under a split eighth, two 32nds under a sixteenth, …), for
							// the mid-level wash. Only kept when that window actually holds more
							// than one slot, so notes at the beat's own subdivision don't get a
							// redundant single-column wash on top of the L1/L2 layers.
							const subBeatSlots: Set<number> =
								hoverInMeasure != null
									? (() => {
											const group = computeSubBeatGroups(
												measure.slots,
												working.timeSignature,
											).find((g) => g.includes(hoverInMeasure.slotIndex));
											return group && group.length > 1
												? new Set(group)
												: new Set();
										})()
									: new Set();
							return (
								<div
									key={measure.id}
									data-measure-id={measure.id}
									onMouseLeave={() => setHoveredCell(null)}
									// A press anywhere in the block focuses it (the same glow a copy or
									// move lands on). Capture phase, so a copy/move button's own click
									// runs after this and its target measure wins.
									onClickCapture={() => setHighlightedMeasureId(measure.id)}
									className={`p-3 flex flex-col gap-2 border transition-shadow duration-200 ${
										highlightedMeasureId === measure.id
											? "border-denim shadow-[0_0_0_1px_var(--color-denim),0_0_12px_var(--denim-glow)]"
											: "border-line"
									} ${
										moveNudge?.id === measure.id
											? moveNudge.dir === "left"
												? "fp-nudge-left"
												: "fp-nudge-right"
											: ""
									}`}
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
												Measure {measureIndex + 1}
											</span>
											<button
												onClick={() => {
													// Pre-generate the clone's id so the newly
													// appended box can be highlighted (the copy
													// lands at the last position).
													const cloneId = crypto.randomUUID();
													commit((p) => ({
														...p,
														measures: cloneMeasure(
															p.measures,
															measureIndex,
															cloneId,
														),
													}));
													setHighlightedMeasureId(cloneId);
												}}
												aria-label="Copy measure"
												title="Copy measure"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim hover:text-denim hover:bg-denim-tint transition-colors"
											>
												<Copy size={14} />
											</button>
											<button
												onClick={() => {
													commit((p) => ({
														...p,
														measures: swapMeasures(
															p.measures,
															measureIndex,
															measureIndex - 1,
														),
													}));
													setHighlightedMeasureId(measure.id);
													setMoveNudge({ id: measure.id, dir: "left" });
												}}
												disabled={measureIndex === 0}
												aria-label="Move measure left"
												title="Move measure left"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim hover:text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim disabled:hover:bg-transparent transition-colors"
											>
												<ArrowLeft size={14} />
											</button>
											<button
												onClick={() => {
													commit((p) => ({
														...p,
														measures: swapMeasures(
															p.measures,
															measureIndex,
															measureIndex + 1,
														),
													}));
													setHighlightedMeasureId(measure.id);
													setMoveNudge({ id: measure.id, dir: "right" });
												}}
												disabled={
													measureIndex === working.measures.length - 1
												}
												aria-label="Move measure right"
												title="Move measure right"
												className="flex items-center justify-center p-1.5 rounded text-ink-dim hover:text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim disabled:hover:bg-transparent transition-colors"
											>
												<ArrowRight size={14} />
											</button>
										</div>
										<div className="flex items-center gap-2">
											{/* Snap the whole measure back to its chord shapes — live only
											    while some fret differs from what the shape would write. */}
											{hasChords &&
												(() => {
													const differs = measureDiffersFromHints(
														measure,
														(si) => hintsBySlot[measureIndex]?.[si] ?? null,
													);
													return (
														<button
															onClick={() => applyReplaceMeasure(measureIndex)}
															disabled={!differs}
															aria-label="Replace this measure's frets with the chord shapes'"
															title={
																differs
																	? "Replace every fret in this measure with the chord shape's"
																	: "Every fret in this measure already matches the chord shape"
															}
															className="flex items-center justify-center p-1.5 rounded text-ink-dim hover:text-denim hover:bg-denim-tint disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim disabled:hover:bg-transparent transition-colors"
														>
															<RotateCcw size={14} />
														</button>
													);
												})()}
										<button
											onClick={() =>
												commit((p) => deleteMeasure(p, measureIndex))
											}
											disabled={working.measures.length <= 1}
											aria-label="Delete measure"
											title="Delete measure"
											className="flex items-center gap-1 text-[10px] text-ink-dim hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											<XIcon size={12} /> Delete
										</button>
										</div>
									</div>

									{/* Column-major layout: a fixed label column, then one wrapper per
								    beat group. The L1 hover wash is applied to the group wrapper so
								    it spans every string cell plus the duration label, column
								    selector and beat label beneath. */}
									<div className="flex gap-0.5 items-start">
										<div className="flex w-5 shrink-0 flex-col gap-0.5">
											{/* Keeps the string labels level with the cells when the
											    chord row is shown above the columns. */}
											{hasChords && <div className="h-4" />}
											{STRING_LABELS.map((label, stringIndex) => {
												// The row is "hovered" from any of its cells or from the
												// label itself, so the × stays reachable on the way over.
												// No hover on a touch screen, so there the control is simply
												// always there for a row that has something to clear.
												const rowHovered =
													!hasFinePointer ||
													hoverInMeasure?.stringIndex === stringIndex;
												const rowHasNotes = measure.slots.some(
													(slot) =>
														slot.strings[stringIndex].fret !== null ||
														slot.strings[stringIndex].muted,
												);
												return (
													<div
														key={stringIndex}
														onMouseEnter={() =>
															setHoveredCell({
																measureIndex,
																slotIndex: -1,
																stringIndex,
															})
														}
														className="relative flex h-7 items-center justify-center text-[10px] font-mono font-semibold text-ink-faint"
													>
														{/* Clear-the-row control: shown while the row is hovered,
														    hidden (but still laid out) otherwise, so it never shifts
														    the labels. Sits in the block's left padding. */}
														{rowHasNotes && (
															<button
																type="button"
																tabIndex={rowHovered ? 0 : -1}
																aria-hidden={!rowHovered}
																onClick={() =>
																	applyClearString(measureIndex, stringIndex)
																}
																aria-label={`Clear the ${label} string in measure ${measureIndex + 1}`}
																title={`Clear the ${label} string in this measure`}
																className={`absolute -left-3.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-ink-faint transition-opacity hover:text-destructive ${
																	rowHovered ? "opacity-100" : "opacity-0 pointer-events-none"
																}`}
															>
																<XIcon size={11} />
															</button>
														)}
														{label}
													</div>
												);
											})}
										</div>

										{/* Horizontally scrollable slot area. Each slot column has a
									    legible min-width, so when a measure is subdivided into
									    many small notes (e.g. 32nds) the columns overflow and this
									    wrapper scrolls sideways — while the string-label column
									    above stays fixed. min-w-0 lets the flex item shrink below
									    its content so the overflow scrolls instead of widening the
									    measure block. overflow-y-hidden stops the vertical scrollbar
									    the CSS spec would otherwise force on: with overflow-x set to
									    auto, a still-visible overflow-y is promoted to auto too, so
									    any sub-pixel height rounding would summon a stray v-scrollbar. */}
										<div className="fp-thin-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
											<div className="flex items-start gap-0.5">
												{beatGroups.map((group, groupIndex) => {
													const l1Active =
														hoverInMeasure != null &&
														group.includes(hoverInMeasure.slotIndex);
													return (
														<div
															key={groupIndex}
															className="flex flex-1 gap-0.5"
															style={{
																// Grow proportionally to slot count so every slot column
																// stays equal width across the whole measure.
																flexGrow: group.length,
																flexBasis: 0,
																backgroundColor: l1Active
																	? HOVER_L1_BG
																	: undefined,
															}}
														>
															{group.map((slotIndex) => {
																const slot =
																	measure.slots[slotIndex];
																const key = columnKey({
																	measureIndex,
																	slotIndex,
																});
																const columnSelected =
																	selectedColumns.has(key);
																// A rest slot gets a faint gray wash across its whole
																// column so it reads as silence at a glance. bg-raise is
																// theme-aware (subtle light gray on light, subtle dark
																// gray on dark), so no per-mode color handling is needed.
																const isRest = !!slot.isRest;
																// Rolled (arpeggiated) slot — gets the amber wash below.
																const hasRoll = !!slot.stroke;
																return (
																	<div
																		key={slot.id}
																		ref={
																			key ===
																			firstSelectedColumnKey
																				? popupAnchorRef
																				: undefined
																		}
																		// Column background, in priority order: the mid-level
																		// sixteenth-window hover wash (denim, one subdivision finer
																		// than the L1 beat wash) wins while hovered; otherwise a
																		// rolled slot shows its steady denim tint. Both are inline so
																		// they layer above the rest className bg; when neither applies
																		// the column falls back to the className (rest wash or bare).
																		style={
																			subBeatSlots.has(
																				slotIndex,
																			)
																				? {
																						backgroundColor:
																							HOVER_SUBBEAT_BG,
																					}
																				: undefined
																		}
																		// min-w-5 floors each slot column at a legible width; once the
																		// columns can no longer fit, the parent scroll wrapper overflows
																		// horizontally rather than shrinking them into an unreadable smear.
																		className={`flex min-w-5 flex-1 flex-col gap-0.5 rounded-sm ${
																			isRest
																				? "bg-raise/70"
																				: ""
																		}`}
																	>
																		{/* Chord row: the symbol where a chord changes, and the
																		    one running on into this measure at its first column.
																		    Absolutely placed so a long name can overhang the
																		    narrow columns, the way it does on the stave. Pressing it
																		    selects the column, whose popup edits the chord. */}
																		{hasChords && (
																			<div className="relative h-4">
																				{(() => {
																					const own = slot.chord;
																					const carried =
																						!own &&
																						slotIndex === 0
																							? chordsInEffect[
																									measureIndex
																								]?.[0]
																							: undefined;
																					const shown = own ?? carried;
																					if (!shown) return null;
																					return (
																						<button
																							type="button"
																							data-column-selector
																							onClick={() => {
																								toggleColumn({
																									measureIndex,
																									slotIndex,
																								});
																								// The chip is about the chord, so the
																								// popup opens on its Chord section.
																								bumpRevealChord();
																							}}
																							title={
																								own
																									? "Chord changes here"
																									: "Chord running on from an earlier measure"
																							}
																							className={`absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] font-bold leading-4 transition-colors hover:text-denim ${
																								own
																									? "text-denim-accent"
																									: "text-ink-faint"
																							}`}
																						>
																							{chordSymbolLabel(
																								shown,
																							)}
																						</button>
																					);
																				})()}
																			</div>
																		)}
																		{STRING_LABELS.map(
																			(_, stringIndex) => {
																				const cell: Cell = {
																					measureIndex,
																					slotIndex,
																					stringIndex,
																				};
																				const ck =
																					cellKey(cell);
																				const sf =
																					slot.strings[
																						stringIndex
																					];
																				const isSelected =
																					selectedCell !=
																						null &&
																					selectedCell.measureIndex ===
																						measureIndex &&
																					selectedCell.slotIndex ===
																						slotIndex &&
																					selectedCell.stringIndex ===
																						stringIndex;
																				const glyph =
																					sf.technique
																						? TECHNIQUE_GLYPH[
																								sf
																									.technique
																							]
																						: undefined;
																				// Muted cells can't be tied — treat
																				// a tied+muted cell as untied here.
																				const tiedDisplay =
																					sf.tied &&
																					!sf.muted;
																				// The shape's fret for this string, offered only
																				// while the cell is hovered and empty: a chord is a
																				// suggestion, and not every string gets played.
																				const isEmpty =
																					sf.fret === null &&
																					!sf.muted;
																				const hint: FretHint | null =
																					hasFinePointer &&
																					isEmpty &&
																					hoverInMeasure?.slotIndex ===
																						slotIndex &&
																					hoverInMeasure.stringIndex ===
																						stringIndex
																						? (hintsBySlot[
																								measureIndex
																							]?.[slotIndex]?.[
																								stringIndex
																							] ?? null)
																						: null;
																				const l2Alpha =
																					hoverInMeasure !=
																					null
																						? (hoverInMeasure.slotIndex ===
																							slotIndex
																								? HOVER_L2_ALPHA
																								: 0) +
																							(hoverInMeasure.stringIndex ===
																							stringIndex
																								? HOVER_L2_ALPHA
																								: 0)
																						: 0;
																				return (
																					<button
																						key={ck}
																						ref={(
																							el,
																						) => {
																							if (el)
																								cellRefs.current.set(
																									ck,
																									el,
																								);
																							else
																								cellRefs.current.delete(
																									ck,
																								);
																						}}
																						onClick={() => {
																							// Touch selection +
																							// keyboard focus is
																							// handled in
																							// handleCellPointerUp so
																							// focus() lands inside
																							// the tap gesture (iOS
																							// requirement); the
																							// trailing click is a
																							// no-op here.
																							if (
																								lastPointerTypeRef.current ===
																								"touch"
																							)
																								return;
																							setTouchMute(
																								null,
																							);
																							setSelectedCell(
																								cell,
																							);
																							// Taking the hint: the fret is
																							// written, and stays editable.
																							if (
																								typeof hint ===
																								"number"
																							) {
																								commit(
																									(
																										prev,
																									) =>
																										setFret(
																											prev,
																											cell,
																											hint,
																										),
																								);
																								pendingDigitRef.current =
																									null;
																							}
																						}}
																						onKeyDown={(
																							e,
																						) =>
																							handleCellKeyDown(
																								e,
																								cell,
																							)
																						}
																						onMouseEnter={() =>
																							setHoveredCell(
																								{
																									measureIndex,
																									slotIndex,
																									stringIndex,
																								},
																							)
																						}
																						onPointerDown={(
																							e,
																						) =>
																							handleCellPointerDown(
																								cell,
																								e,
																							)
																						}
																						onPointerUp={(
																							e,
																						) =>
																							handleCellPointerUp(
																								cell,
																								e,
																							)
																						}
																						onPointerLeave={
																							cancelLongPress
																						}
																						onContextMenu={(
																							e,
																						) => {
																							e.preventDefault();
																							setSelectedCell(
																								cell,
																							);
																							openTechMenu(
																								cell,
																								e.clientX,
																								e.clientY,
																								e.currentTarget,
																							);
																						}}
																						// Hover tint first; else a rolled slot's wash, deepening
																						// string by string in the direction the hand travels —
																						// roll-down (low → high pitch) deepens towards the high e.
																						style={
																							l2Alpha > 0
																								? {
																										backgroundColor:
																											hoverAxisBg(
																												l2Alpha,
																											),
																									}
																								: hasRoll && !isRest
																									? {
																											backgroundColor:
																												hoverAxisBg(
																													rollWashAlpha(
																														slot.stroke,
																														stringIndex,
																													),
																												),
																										}
																									: undefined
																						}
																						className={`relative h-7 min-w-0 overflow-hidden flex items-center justify-center font-mono text-xs transition-colors select-none touch-manipulation ${
																							isSelected
																								? "bg-denim-tint ring-1 ring-denim text-denim"
																								: "hover:bg-raise text-ink-dim"
																						} ${sf.fret === null && !sf.muted ? "text-ink-faint" : ""}`}
																					>
																						{hint !==
																						null ? (
																							<span
																								className={
																									hint ===
																									"/"
																										? "text-ink-faint"
																										: "text-denim-accent"
																								}
																							>
																								{hint}
																							</span>
																						) : (
																							cellDisplay(
																								sf,
																							)
																						)}
																						{glyph && (
																							<span className="absolute top-0 right-0.5 text-[8px] leading-none text-denim">
																								{
																									glyph
																								}
																							</span>
																						)}
																						{tiedDisplay && (
																							<span
																								aria-hidden
																								className="pointer-events-none absolute top-0 left-1/2 h-1.5 w-3 -translate-x-1/2 border-t-2"
																								style={{
																									borderColor:
																										"rgba(74, 111, 165, 0.5)",
																								}}
																							/>
																						)}
																					</button>
																				);
																			},
																		)}

																		{/* Duration label */}
																		<div
																			onMouseEnter={() =>
																				hoverColumn(
																					measureIndex,
																					slotIndex,
																				)
																			}
																			className="text-center text-[9px] font-mono text-ink-faint leading-none"
																		>
																			{
																				DURATION_ABBREV[
																					slot.duration
																				]
																			}
																		</div>

																		{/* Column selector. The popup itself is rendered once, absolutely
															    positioned inside the scroll region and anchored below the
															    first selected column (see columnPopup above). */}
																		<div
																			onMouseEnter={() =>
																				hoverColumn(
																					measureIndex,
																					slotIndex,
																				)
																			}
																			className="flex justify-center pt-1"
																		>
																			<button
																				data-column-selector
																				onClick={() =>
																					toggleColumn({
																						measureIndex,
																						slotIndex,
																					})
																				}
																				aria-label={`Select column ${slotIndex + 1}`}
																				className={`h-3.5 w-3.5 border transition-colors ${
																					columnSelected
																						? "bg-denim border-denim"
																						: "border-line-strong hover:border-denim"
																				}`}
																			/>
																		</div>

																		{/* Beat position label */}
																		<span
																			onMouseEnter={() =>
																				hoverColumn(
																					measureIndex,
																					slotIndex,
																				)
																			}
																			className="pt-1 text-center font-mono text-[10px] leading-none text-muted-foreground"
																		>
																			{beatLabels[slotIndex]}
																		</span>
																	</div>
																);
															})}
														</div>
													);
												})}
											</div>
										</div>

										{/* Right column: per row, "replace this row with the shape" —
										    rewrites the row's frets to the chord's frets for each slot.
										    Shown with the row, live only while some fret differs. */}
										{hasChords && (
											<div className="flex w-5 shrink-0 flex-col gap-0.5">
												<div className="h-4" />
												{STRING_LABELS.map((label, stringIndex) => {
													const rowHovered =
														!hasFinePointer ||
														hoverInMeasure?.stringIndex === stringIndex;
													const differs = rowDiffersFromHints(
														measure,
														stringIndex,
														(si) => hintsBySlot[measureIndex]?.[si] ?? null,
													);
													return (
														<div
															key={stringIndex}
															onMouseEnter={() =>
																setHoveredCell({
																	measureIndex,
																	slotIndex: -1,
																	stringIndex,
																})
															}
															className="flex h-7 items-center justify-center"
														>
															<button
																type="button"
																disabled={!differs}
																tabIndex={rowHovered ? 0 : -1}
																aria-hidden={!rowHovered}
																onClick={() => applyReplaceRow(measureIndex, stringIndex)}
																aria-label={`Replace the ${label} string's frets in measure ${measureIndex + 1} with the chord shape's`}
																title={
																	differs
																		? "Replace this row's frets with the chord shape's"
																		: "This row already matches the chord shape"
																}
																className={`flex h-4 w-4 items-center justify-center text-ink-dim transition-opacity hover:text-denim disabled:cursor-not-allowed disabled:text-ink-faint/50 ${
																	rowHovered ? "opacity-100" : "opacity-0 pointer-events-none"
																}`}
															>
																<CornerDownLeft size={11} />
															</button>
														</div>
													);
												})}
											</div>
										)}
									</div>

									{/* Quick preset row: fill the whole measure with one note value.
									    The repeat-barline toggles (|: start, :| end) sit at the row's
									    bottom-right; the play-count stepper drops to its own line below
									    when a repeat end is set. */}
									<div className="flex items-center gap-1 border-t border-line pt-2">
										<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint mr-0.5">
											All
										</span>
										{(["quarter", "eighth", "sixteenth", "32nd"] as const).map(
											(d) => (
												<button
													key={d}
													onClick={() => requestPreset(measureIndex, d)}
													title={`Fill measure with ${d} notes`}
													className="flex items-center justify-center h-7 w-8 border border-line-strong text-ink-dim hover:border-denim hover:text-denim active:bg-denim-tint transition-colors"
												>
													<DurationIcon duration={d} />
												</button>
											),
										)}
										<div className="flex items-center gap-1 ml-auto">
											<button
												onClick={() =>
													setMeasureRepeat(measureIndex, {
														repeatStart: !measure.repeatStart,
													})
												}
												title="Repeat start (|:) — the section repeats from here"
												aria-pressed={!!measure.repeatStart}
												className={`flex items-center justify-center h-7 w-8 border font-mono text-xs transition-colors ${
													measure.repeatStart
														? "border-denim bg-denim-tint text-denim"
														: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
												}`}
											>
												|:
											</button>
											<button
												onClick={() =>
													setMeasureRepeat(measureIndex, {
														repeatEnd: !measure.repeatEnd,
													})
												}
												title="Repeat end (:|) — loop back to the repeat start"
												aria-pressed={!!measure.repeatEnd}
												className={`flex items-center justify-center h-7 w-8 border font-mono text-xs transition-colors ${
													measure.repeatEnd
														? "border-denim bg-denim-tint text-denim"
														: "border-line-strong text-ink-dim hover:border-denim hover:text-denim"
												}`}
											>
												:|
											</button>
										</div>
									</div>

									{/* Play-count stepper — only when this measure ends a repeat. */}
									{measure.repeatEnd && (
										<div className="flex items-center gap-0.5 justify-end">
											<button
												onClick={() =>
													setMeasureRepeat(measureIndex, {
														repeatTimes: Math.max(
															DEFAULT_REPEAT_TIMES,
															(measure.repeatTimes ??
																DEFAULT_REPEAT_TIMES) - 1,
														),
													})
												}
												title="Play fewer times"
												className="flex items-center justify-center h-7 w-6 border border-line-strong text-ink-dim hover:border-denim hover:text-denim transition-colors"
											>
												−
											</button>
											<span className="font-mono text-xs w-7 text-center text-ink">
												×{measure.repeatTimes ?? DEFAULT_REPEAT_TIMES}
											</span>
											<button
												onClick={() =>
													setMeasureRepeat(measureIndex, {
														repeatTimes: Math.min(
															REPEAT_TIMES_MAX,
															(measure.repeatTimes ??
																DEFAULT_REPEAT_TIMES) + 1,
														),
													})
												}
												title="Play more times"
												className="flex items-center justify-center h-7 w-6 border border-line-strong text-ink-dim hover:border-denim hover:text-denim transition-colors"
											>
												+
											</button>
										</div>
									)}

									{/* Pick row: type a right-hand sequence (3212, 6(32)1(32), 0 or -
									    for a rest) and Enter rewrites the measure, fretting each
									    string from the chord in effect at that beat. */}
									<div className="flex items-center gap-1.5">
										<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint mr-0.5">
											Pick
										</span>
										<input
											type="text"
											value={pickInputs[measure.id] ?? ""}
											onChange={(e) => {
												const value = e.target.value;
												setPickInputs((prev) => ({ ...prev, [measure.id]: value }));
												setPickNotice((n) => (n?.measureId === measure.id ? null : n));
												setPickConfirm((c) =>
													c?.measureIndex === measureIndex ? null : c,
												);
											}}
											onKeyDown={(e) => {
												if (e.key !== "Enter") return;
												e.preventDefault();
												e.stopPropagation();
												requestPickSequence(measureIndex);
											}}
											placeholder="e.g. 3212 or 6(32)1(32)"
											aria-label={`Right-hand sequence for measure ${measureIndex + 1}`}
											title="String numbers, 1 = high e … 6 = low E. Parentheses pluck strings together; 0 or - is a rest. Enter writes the measure, fretted from its chord."
											className="h-7 min-w-0 flex-1 border border-line-strong bg-surface px-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:outline-none focus-visible:border-denim"
										/>
										<button
											type="button"
											onClick={() => requestPickSequence(measureIndex)}
											disabled={!(pickInputs[measure.id] ?? "").trim()}
											title="Write the sequence into this measure"
											className="h-7 px-2 border border-line-strong font-mono text-xs font-semibold text-ink-dim hover:border-denim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										>
											Write
										</button>
									</div>
									{pickNotice?.measureId === measure.id && (
										<ul
											className={`flex flex-col gap-0.5 text-[10px] leading-snug ${
												pickNotice.kind === "error" ? "text-destructive" : "text-ink-dim"
											}`}
										>
											{pickNotice.lines.map((line) => (
												<li key={line}>{line}</li>
											))}
										</ul>
									)}
									{pickConfirm && pickConfirm.measureIndex === measureIndex && (
										<div className="flex flex-col gap-1.5 border border-line bg-raise p-2">
											<span className="text-[11px] text-ink-dim">
												This will replace the measure&apos;s notes. Continue?
											</span>
											<div className="flex gap-1">
												<button
													onClick={() =>
														applyPickSequenceNow(measureIndex, pickConfirm.parsed)
													}
													className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
												>
													Replace
												</button>
												<button
													onClick={() => setPickConfirm(null)}
													className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
												>
													Cancel
												</button>
											</div>
										</div>
									)}
									{presetConfirm &&
										presetConfirm.measureIndex === measureIndex && (
											<div className="flex flex-col gap-1.5 border border-line bg-raise p-2">
												<span className="text-[11px] text-ink-dim">
													Keep existing data (remap) or clear?
												</span>
												<div className="flex gap-1">
													<button
														onClick={applyPresetRemap}
														className="h-7 px-2 text-xs font-semibold text-on-denim bg-denim hover:bg-denim-accent active:bg-denim-accent transition-colors"
													>
														Remap
													</button>
													<button
														onClick={applyPresetClear}
														className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
													>
														Clear
													</button>
													<button
														onClick={() => setPresetConfirm(null)}
														className="h-7 px-2 text-xs text-ink-dim hover:bg-denim-tint transition-colors"
													>
														Cancel
													</button>
												</div>
											</div>
										)}
								</div>
							);
						})}

						{/* Add measure block */}
						<button
							onClick={() => commit((p) => addMeasure(p))}
							className="border border-dashed border-line-strong min-h-32 flex items-center justify-center gap-1.5 text-sm text-ink-dim hover:border-denim hover:text-denim transition-colors"
						>
							<Plus size={16} /> Add measure
						</button>
					</div>

					{/* Off-screen numeric input: focused on a touch tap to summon the
				    native numeric keyboard for fret entry. Invisible and
				    non-interactive; the keyboard writes through
				    handleHiddenNumericInput. Positioned over the tapped cell at
				    focus time to avoid a jump-scroll. */}
					<input
						ref={hiddenInputRef}
						type="number"
						inputMode="numeric"
						pattern="[0-9]*"
						aria-hidden
						tabIndex={-1}
						onChange={handleHiddenNumericInput}
						onFocus={() => setIsFretInputFocused(true)}
						onBlur={() => {
							setIsFretInputFocused(false);
							resetHiddenNumericInput();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.currentTarget.blur();
								return;
							}
							// The native numeric keyboard has no "x"; its Backspace clears
							// the selected cell (mirrors the physical-keyboard path).
							if (e.key === "Backspace" || e.key === "Delete") {
								if (selectedCell) commit((prev) => setInactive(prev, selectedCell));
								pendingDigitRef.current = null;
							}
						}}
						className="absolute h-6 w-6 opacity-0 pointer-events-none -z-10"
						style={{ top: 0, left: 0 }}
					/>

					{/* Touch mute button: the native numeric keyboard can't type "x", so
				    give touch users a tappable way to mute the selected string. Uses
				    the same toggleMuted commit as the desktop "x" key. Centred just
				    below the selected cell (the "x" glyph is the tab mute notation).
				    Hidden while the selected cell is already muted — it reappears once
				    the cell is un-muted or a different, non-muted cell is selected. */}
					{touchMute &&
						selectedCell &&
						isFretInputFocused &&
						!selectedStringFret?.muted && (
							<button
								// Keep the hidden input focused when pressing this button: without
								// it, the button steals focus, blurs the input, and the resulting
								// isFretInputFocused=false would unmount the button before its
								// onClick fires. Preserving focus also keeps the keyboard up.
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => {
									if (selectedCell)
										commit((prev) => toggleMuted(prev, selectedCell));
								}}
								aria-label="Mute string"
								title="Mute string"
								className="absolute z-60 flex h-8 w-8 items-center justify-center border border-line-strong bg-popover text-ink hover:bg-denim-tint hover:text-denim active:bg-denim-tint transition-colors"
								style={{
									top: touchMute.top,
									left: touchMute.left,
									transform: "translate(-50%, 6px)",
								}}
							>
								<XIcon size={14} />
							</button>
						)}

					{/* ── Technique context menu (absolute within the content box) ───── */}
					{techMenu && (
						<div
							ref={techMenuRef}
							className="absolute z-60 w-44 border border-line-strong bg-popover py-1 text-sm"
							style={{ top: techMenu.y, left: techMenu.x }}
						>
							{(() => {
								const hasPrev = hasPreviousNoteOnString(working, techMenu.cell);
								const avail = availableTechniques(working, techMenu.cell);
								// When a previous note exists but a marker is still off, it's
								// the fret movement that rules it out (not a missing note).
								const disabledTitle = (ok: boolean) =>
									ok
										? undefined
										: hasPrev
											? "Not valid for this fret movement"
											: "No previous note on this string";
								return (
									<>
										{TECHNIQUE_OPTIONS.map((opt) => (
											<button
												key={opt.value}
												disabled={!avail[opt.value]}
												onClick={() => applyTechnique(opt.value)}
												title={disabledTitle(avail[opt.value])}
												className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
											>
												{opt.label}
											</button>
										))}
										<button
											disabled={!avail.tied}
											onClick={applyTied}
											title={disabledTitle(avail.tied)}
											className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
										>
											Tied (⌒)
										</button>
									</>
								);
							})()}
							<div className="border-t border-line my-1" />
							{(() => {
								// Clear only makes sense when the target note actually carries
								// a marker (technique or tie) to remove.
								const sf =
									working.measures[techMenu.cell.measureIndex]?.slots[
										techMenu.cell.slotIndex
									]?.strings[techMenu.cell.stringIndex];
								const hasMarker = !!sf && (sf.technique !== null || sf.tied);
								return (
									<button
										disabled={!hasMarker}
										onClick={applyClearTechnique}
										title={hasMarker ? undefined : "No technique to clear"}
										className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-ink-dim hover:bg-destructive/10 hover:text-destructive disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
									>
										Clear technique
										<Trash2 size={13} className="shrink-0" />
									</button>
								);
							})()}
						</div>
					)}

					{/* ── Column popup (absolute within the scroll region) ───────────── */}
					{firstSelectedColumnKey && columnPopup}
				</div>
				{/* ── Footer (fixed; sibling of the scroll region, never scrolls) ── */}
				<div className="shrink-0 flex items-center justify-between gap-2 border-t border-line bg-popover px-4 py-3">
					{/* Editing help: "?" toggles a popover with the input-appropriate hint.
					    Anchored above the icon (footer sits at the bottom) and left-aligned
					    from the leftmost button so it never spills past the modal edges. */}
					<div className="relative">
						{/* LED-style feedback (§1.2 / §5.11): the glyph itself carries all
						    state — no background box, border, or shadow on the button.
						    Dormant (ink-faint) when closed; lit (denim-accent + soft glow)
						    on hover and while the popover is open; a quick scale-down on
						    press stands in for §5.1's momentary-flash on bare chrome. */}
						<button
							data-hint-trigger
							onClick={() => setHintOpen((v) => !v)}
							aria-label="Editing help"
							aria-expanded={hintOpen}
							title="Editing help"
							className={`h-8 w-8 flex items-center justify-center transition duration-150 ease-out motion-reduce:transition-none active:scale-[0.92] ${
								hintOpen
									? "text-denim-accent filter-[drop-shadow(0_0_4px_var(--denim-glow))]"
									: "text-ink-faint hover:text-denim-accent hover:filter-[drop-shadow(0_0_4px_var(--denim-glow))]"
							}`}
						>
							<CircleHelp size={18} />
						</button>
						{/* Kept mounted (not conditionally rendered) so the exit transition
						    plays on close. Entrance is a spring-pop run via the Web Animations
						    API (see the layout effect above); close is the plain CSS fade/shrink
						    from the classes below. Visibility/interaction is gated by the
						    opacity/pointer-events classes; reduced-motion users skip both and
						    get an instant toggle (§6.7). Show/hide state and outside-click
						    dismissal are unchanged — driven by hintOpen. */}
						<div
							ref={hintRef}
							aria-hidden={!hintOpen}
							className={`absolute bottom-full left-0 mb-2 z-60 w-max max-w-xs origin-bottom-left border border-line-strong bg-surface p-3 flex flex-col gap-1 text-[11px] leading-relaxed text-ink-dim transition duration-150 ease-out motion-reduce:transition-none ${
								hintOpen
									? "opacity-100 scale-100"
									: "pointer-events-none opacity-0 scale-[0.96]"
							}`}
						>
							{hasFinePointer ? (
								<>
									<p>
										Click a cell, then use arrow keys to move, number keys to
										set a fret, <span className="font-mono">X</span> to mute, or
										Backspace to clear.
									</p>
									<p>Right-click a cell for techniques.</p>
								</>
							) : (
								<>
									<p>
										Tap a cell to select it, then use the number pad to set a
										fret, the mute button to mute, or Backspace to clear.
									</p>
									<p>Long-press a cell for techniques.</p>
								</>
							)}
						</div>
					</div>
					{repeatError && (
						<span
							role="alert"
							className="ml-auto mr-2 text-[11px] leading-tight text-red-500 max-w-xs text-right"
						>
							{repeatError}
						</span>
					)}
					<Button
						ref={saveButtonRef}
						onClick={handleSave}
						disabled={!nameValid}
						className="h-9 rounded-none bg-denim text-on-denim hover:bg-denim-accent active:bg-denim-accent disabled:opacity-40"
					>
						Save
					</Button>
				</div>
			</DialogContent>
			{/* Nested dialog: a shape for a chord the search had nothing for. Mounted
			    only while open so its open-effect seeds from the current query. */}
			{shapeCreate && (
				<ChordShapeModal
					open
					chord={shapeCreateSeed.chord}
					namingFrom={shapeCreateSeed.namingFrom}
					initialVoicing={shapeCreateSeed.initialVoicing}
					onClose={() => setShapeCreate(null)}
					onApply={handleShapeCreated}
					matchingBarCount={1}
				/>
			)}
		</Dialog>
	);
}

// ── Sub-components ───────────────────────────────────────────────────────────

// Column-popup section label. The plain-English explanation lives in a hover
// tooltip rather than inline text, keeping the popup compact; the help-cursor +
// faint question mark signal that hovering reveals more. Uses a CSS group-hover
// bubble instead of the native `title` attribute so it appears instantly — the
// browser's built-in title delay (~0.5–1s) is not configurable.
function PopupSectionLabel({ label, hint }: { label: string; hint: string }) {
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

function PopupIconButton({
	title,
	onClick,
	children,
	danger,
}: {
	title: string;
	onClick: () => void;
	children: React.ReactNode;
	danger?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			title={title}
			aria-label={title}
			className={`h-7 w-7 flex items-center justify-center text-ink-dim transition-colors active:bg-denim-tint ${
				danger
					? "hover:bg-raise hover:text-destructive"
					: "hover:bg-denim-tint hover:text-denim"
			}`}
		>
			{children}
		</button>
	);
}
