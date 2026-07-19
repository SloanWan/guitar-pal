"use client";

import {
	useState,
	useEffect,
	useLayoutEffect,
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
	Merge,
	Undo2,
	Redo2,
	CircleHelp,
	X as XIcon,
} from "lucide-react";
import type { Duration, FingerpickPattern, Measure, StringFret } from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	clonePatternForEdit,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	setTied,
	moveCell,
	hasPreviousNoteOnString,
	setSlotsDuration,
	insertSlots,
	duplicateSlots,
	deleteSlots,
	addMeasure,
	deleteMeasure,
	cloneMeasure,
	swapMeasures,
	computeBeatLabels,
	computeBeatGroups,
	slotDurationUnits,
	remainingUnits,
	splitSlot,
	mergeSlots,
	resetMeasure,
	remapMeasure,
	STRING_LABELS,
	DURATION_PICKER,
	MAX_FRET,
	type Cell,
	type Direction,
	type SlotTarget,
} from "@/lib/fingerpickEdit";

export interface FingerpickEditModalProps {
	open: boolean;
	pattern: FingerpickPattern | null; // null = new pattern from scratch
	onClose: () => void;
	onSave: (pattern: FingerpickPattern) => void;
}

const TIME_SIGNATURES: { label: string; value: [number, number] }[] = [
	{ label: "4/4", value: [4, 4] },
	{ label: "3/4", value: [3, 4] },
	{ label: "6/8", value: [6, 8] },
];

// Short glyphs shown under each slot column so the current rhythmic value is
// visible in the grid (durations beyond the picker set still get a marker).
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
	rest: "R",
};

// Note-value glyphs for the split/merge/quick-preset controls. These are the
// standard Unicode musical symbols; DurationIcon renders one per duration.
const DURATION_NOTE_GLYPH: Partial<Record<Duration, string>> = {
	whole: "𝅝",
	half: "𝅗𝅥",
	quarter: "♩",
	eighth: "♪",
	sixteenth: "♬",
};

function DurationIcon({ duration }: { duration: Duration }) {
	return (
		<span aria-hidden className="font-serif leading-none">
			{DURATION_NOTE_GLYPH[duration] ?? DURATION_ABBREV[duration]}
		</span>
	);
}

// Plain note durations, largest → smallest, used by the split/merge controls.
const NOTE_LADDER: Duration[] = ["whole", "half", "quarter", "eighth", "sixteenth"];

// The next larger plain note value (used as the merge target for a slot).
const NEXT_LARGER_DURATION: Partial<Record<Duration, Duration>> = {
	sixteenth: "eighth",
	eighth: "quarter",
	quarter: "half",
	half: "whole",
};

const TECHNIQUE_OPTIONS: { label: string; value: NonNullable<StringFret["technique"]> }[] = [
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
// group; L2 is a stronger per-axis tint on the hovered slot column and string row
// (they sum on the hovered cell itself, giving a brighter cross centre).
const HOVER_L1_BG = "rgba(74, 111, 165, 0.06)";
const HOVER_L2_ALPHA = 0.14;
const hoverAxisBg = (alpha: number): string => `rgba(74, 111, 165, ${alpha})`;

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
const SPRING_POP_EASING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const prefersReducedMotion = (): boolean =>
	typeof window !== "undefined" &&
	!!window.matchMedia &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
		| null
	>(null);
	// Inline confirmation for a measure's quick-preset row.
	const [presetConfirm, setPresetConfirm] = useState<{
		measureIndex: number;
		targetDuration: Duration;
	} | null>(null);
	// Inline "Discard changes?" confirmation shown when the user tries to close
	// with unsaved edits. Rendered in the header in place of the close button.
	const [discardConfirm, setDiscardConfirm] = useState(false);
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
	const techMenuRef = useRef<HTMLDivElement>(null);
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
			setPopupConfirm(null);
			setPresetConfirm(null);
			setDiscardConfirm(false);
			setHintOpen(false);
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
		const content = anchorEl.closest<HTMLElement>('[data-slot="dialog-content"]');
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
		const content = (e.currentTarget as HTMLElement).closest<HTMLElement>(
			'[data-slot="dialog-content"]',
		);
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

	function applyDuration(duration: Duration) {
		commit((prev) => setSlotsDuration(prev, columnTargets(), duration));
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

	// Duration highlighted in the picker = the shared value of all selected slots.
	const selectedDuration: Duration | null = (() => {
		const targets = columnTargets();
		if (targets.length === 0) return null;
		const durations = targets.map(
			(t) => working.measures[t.measureIndex]?.slots[t.slotIndex]?.duration,
		);
		const first = durations[0];
		return durations.every((d) => d === first) ? (first ?? null) : null;
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

	// Split/merge/whole controls act on a single slot. When exactly one column is
	// selected, derive that slot's split targets and merge target from live state.
	const singleTarget: SlotTarget | null = selectedColumns.size === 1 ? columnTargets()[0] : null;

	const singleMeasure = singleTarget ? working.measures[singleTarget.measureIndex] : null;
	const singleSlot =
		singleTarget && singleMeasure ? singleMeasure.slots[singleTarget.slotIndex] : null;

	// Smaller note values this slot can be split into: they must subdivide the
	// slot evenly and the sub-slots must fit the measure's remaining capacity.
	const splitOptions: { duration: Duration; count: number }[] =
		singleSlot && singleMeasure
			? NOTE_LADDER.flatMap((d) => {
					const currentUnits = slotDurationUnits(singleSlot.duration);
					const targetUnits = slotDurationUnits(d);
					if (targetUnits >= currentUnits || currentUnits % targetUnits !== 0) return [];
					const count = currentUnits / targetUnits;
					const extra = count * targetUnits - currentUnits; // 0 for even splits
					if (extra > remainingUnits(singleMeasure.slots, working.timeSignature))
						return [];
					return [{ duration: d, count }];
				})
			: [];

	// Merge target: the next larger note value, valid only when the following
	// slots line up to exactly fill it.
	const mergeTarget: Duration | null = singleSlot
		? (NEXT_LARGER_DURATION[singleSlot.duration] ?? null)
		: null;
	const canMerge = (() => {
		if (!singleTarget || !singleMeasure || !mergeTarget) return false;
		const targetUnits = slotDurationUnits(mergeTarget);
		let sum = 0;
		let end = singleTarget.slotIndex;
		while (end < singleMeasure.slots.length && sum < targetUnits) {
			sum += slotDurationUnits(singleMeasure.slots[end].duration);
			end++;
		}
		return sum === targetUnits && end - singleTarget.slotIndex >= 2;
	})();

	// A whole note may only be the sole slot in its measure. Disable it in the
	// picker whenever the targeted measure(s) already hold other slots.
	const wholeDisabled = columnTargets().some(
		(t) => (working.measures[t.measureIndex]?.slots.length ?? 0) > 1,
	);
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
			className={`absolute top-full ${popupOpensLeft ? "right-0" : "left-0"} mt-1.5 z-60 w-max max-w-60 border border-line-strong bg-popover p-2 flex flex-col gap-2`}
		>
			<div className="flex border border-line-strong">
				{DURATION_PICKER.map((d, i) => {
					const disabled = d.value === "whole" && wholeDisabled;
					return (
						<button
							key={d.value}
							onClick={() => applyDuration(d.value)}
							disabled={disabled}
							title={
								disabled
									? "Whole note must be the only slot in the measure"
									: d.value
							}
							className={`h-7 flex-1 px-2 font-mono text-xs font-semibold transition-colors ${
								i > 0 ? "border-l border-line-strong" : ""
							} ${
								selectedDuration === d.value
									? "bg-denim text-on-denim"
									: "text-ink-dim hover:bg-denim-tint hover:text-denim"
							} disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-ink-dim`}
						>
							{d.label}
						</button>
					);
				})}
			</div>

			{/* Split / merge (single column only) */}
			{singleTarget && !popupConfirm && (splitOptions.length > 0 || canMerge) && (
				<div className="flex flex-col gap-1.5 border-t border-line pt-2">
					{splitOptions.length > 0 && (
						<div className="flex flex-wrap items-center gap-1">
							<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
								Split
							</span>
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
					{canMerge && mergeTarget && (
						<button
							onClick={() => requestMerge(singleTarget, mergeTarget)}
							title={`Merge into ${mergeTarget}`}
							className="flex items-center gap-1 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
						>
							<Merge size={13} /> Merge → <DurationIcon duration={mergeTarget} />
						</button>
					)}
				</div>
			)}

			{/* Replace whole measure with a single whole note (single column only) */}
			{singleTarget && measureHasContent && !popupConfirm && (
				<div className="border-t border-line pt-2">
					<button
						onClick={() => requestReplaceWithWhole(singleTarget)}
						className="flex items-center gap-1 h-7 px-1.5 text-xs text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
					>
						Replace with <DurationIcon duration="whole" />
					</button>
				</div>
			)}

			{/* Inline confirmation for a destructive merge / whole-replace */}
			{popupConfirm && (
				<div className="flex flex-col gap-1.5 border-t border-line pt-2">
					<span className="text-[11px] text-ink-dim">
						{popupConfirm.kind === "merge"
							? `This will discard data from ${popupConfirm.affectedSlotCount} slot(s). Continue?`
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

			<div className="flex gap-1 border-t border-line pt-2">
				<PopupIconButton title="Insert before" onClick={() => applyStructural("before")}>
					<ArrowLeftToLine size={14} />
				</PopupIconButton>
				<PopupIconButton title="Insert after" onClick={() => applyStructural("after")}>
					<ArrowRightToLine size={14} />
				</PopupIconButton>
				<PopupIconButton title="Duplicate" onClick={() => applyStructural("duplicate")}>
					<Copy size={14} />
				</PopupIconButton>
				<PopupIconButton title="Delete" onClick={() => applyStructural("delete")} danger>
					<Trash2 size={14} />
				</PopupIconButton>
			</div>
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
				className="w-full max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-3xl lg:w-(--fp-w) lg:max-w-[min(var(--fp-w),96vw)] max-h-[80vh] lg:max-h-[90vh] overflow-y-auto p-0"
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
				{/* ── Header ─────────────────────────────────────────────────────── */}
				<div className="sticky top-0 z-55 flex items-center justify-between border-b border-line bg-popover px-4 py-3">
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

				{/* ── Metadata bar ──────────────────────────────────────────────── */}
				<div className="flex flex-wrap items-end gap-3 px-4">
					<div className="flex flex-col gap-1 min-w-40 flex-1">
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
					<div className="flex flex-col gap-1 w-24">
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
					<div className="flex flex-col gap-1 w-24">
						<label className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
							Time Sig.
						</label>
						<select
							value={`${working.timeSignature[0]}/${working.timeSignature[1]}`}
							onChange={(e) => {
								const ts = TIME_SIGNATURES.find((t) => t.label === e.target.value);
								if (ts) commit((p) => ({ ...p, timeSignature: ts.value }));
							}}
							className="w-full border border-line-strong bg-surface px-2 py-2 font-mono text-sm text-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-denim-accent"
						>
							{TIME_SIGNATURES.map((t) => (
								<option key={t.label} value={t.label}>
									{t.label}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1 min-w-40 flex-1">
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
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(var(--fp-cols),minmax(0,1fr))] gap-4 px-4 select-none">
					{working.measures.map((measure, measureIndex) => {
						const beatLabels = computeBeatLabels(measure.slots, working.timeSignature);
						const beatGroups = computeBeatGroups(measure.slots, working.timeSignature);
						const hoverInMeasure =
							hoveredCell?.measureIndex === measureIndex ? hoveredCell : null;
						return (
							<div
								key={measure.id}
								onMouseLeave={() => setHoveredCell(null)}
								className="border border-line p-3 flex flex-col gap-2"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
											Measure {measureIndex + 1}
										</span>
										<button
											onClick={() =>
												commit((p) => ({
													...p,
													measures: cloneMeasure(
														p.measures,
														measureIndex,
													),
												}))
											}
											aria-label="Copy measure"
											title="Copy measure"
											className="flex items-center justify-center text-ink-dim hover:text-denim transition-colors"
										>
											<Copy size={14} />
										</button>
										<button
											onClick={() =>
												commit((p) => ({
													...p,
													measures: swapMeasures(
														p.measures,
														measureIndex,
														measureIndex - 1,
													),
												}))
											}
											disabled={measureIndex === 0}
											aria-label="Move measure left"
											title="Move measure left"
											className="flex items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim transition-colors"
										>
											<ArrowLeft size={14} />
										</button>
										<button
											onClick={() =>
												commit((p) => ({
													...p,
													measures: swapMeasures(
														p.measures,
														measureIndex,
														measureIndex + 1,
													),
												}))
											}
											disabled={measureIndex === working.measures.length - 1}
											aria-label="Move measure right"
											title="Move measure right"
											className="flex items-center justify-center text-ink-dim hover:text-denim disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-dim transition-colors"
										>
											<ArrowRight size={14} />
										</button>
									</div>
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

								{/* Column-major layout: a fixed label column, then one wrapper per
								    beat group. The L1 hover wash is applied to the group wrapper so
								    it spans every string cell plus the duration label, column
								    selector and beat label beneath. */}
								<div className="flex gap-0.5 items-start">
									<div className="flex w-5 shrink-0 flex-col gap-0.5">
										{STRING_LABELS.map((label, stringIndex) => (
											<div
												key={stringIndex}
												className="flex h-7 items-center justify-center text-[10px] font-mono font-semibold text-ink-faint"
											>
												{label}
											</div>
										))}
									</div>

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
													const slot = measure.slots[slotIndex];
													const key = columnKey({
														measureIndex,
														slotIndex,
													});
													const columnSelected = selectedColumns.has(key);
													return (
														<div
															key={slot.id}
															className="flex min-w-0 flex-1 flex-col gap-0.5"
														>
															{STRING_LABELS.map((_, stringIndex) => {
																const cell: Cell = {
																	measureIndex,
																	slotIndex,
																	stringIndex,
																};
																const ck = cellKey(cell);
																const sf =
																	slot.strings[stringIndex];
																const isSelected =
																	selectedCell != null &&
																	selectedCell.measureIndex ===
																		measureIndex &&
																	selectedCell.slotIndex ===
																		slotIndex &&
																	selectedCell.stringIndex ===
																		stringIndex;
																const glyph = sf.technique
																	? TECHNIQUE_GLYPH[sf.technique]
																	: undefined;
																// Muted cells can't be tied — treat
																// a tied+muted cell as untied here.
																const tiedDisplay =
																	sf.tied && !sf.muted;
																const l2Alpha =
																	hoverInMeasure != null
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
																		ref={(el) => {
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
																			setTouchMute(null);
																			setSelectedCell(cell);
																		}}
																		onKeyDown={(e) =>
																			handleCellKeyDown(
																				e,
																				cell,
																			)
																		}
																		onMouseEnter={() =>
																			setHoveredCell({
																				measureIndex,
																				slotIndex,
																				stringIndex,
																			})
																		}
																		onPointerDown={(e) =>
																			handleCellPointerDown(
																				cell,
																				e,
																			)
																		}
																		onPointerUp={(e) =>
																			handleCellPointerUp(
																				cell,
																				e,
																			)
																		}
																		onPointerLeave={
																			cancelLongPress
																		}
																		onContextMenu={(e) => {
																			e.preventDefault();
																			setSelectedCell(cell);
																			openTechMenu(
																				cell,
																				e.clientX,
																				e.clientY,
																				e.currentTarget,
																			);
																		}}
																		style={
																			l2Alpha > 0
																				? {
																						backgroundColor:
																							hoverAxisBg(
																								l2Alpha,
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
																		{cellDisplay(sf)}
																		{glyph && (
																			<span className="absolute top-0 right-0.5 text-[8px] leading-none text-denim">
																				{glyph}
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
															})}

															{/* Duration label */}
															<div className="text-center text-[9px] font-mono text-ink-faint leading-none">
																{DURATION_ABBREV[slot.duration]}
															</div>

															{/* Column selector */}
															<div className="relative flex justify-center pt-1">
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
																{key === firstSelectedColumnKey &&
																	columnPopup}
															</div>

															{/* Beat position label */}
															<span className="pt-1 text-center font-mono text-[10px] leading-none text-muted-foreground">
																{beatLabels[slotIndex]}
															</span>
														</div>
													);
												})}
											</div>
										);
									})}
								</div>

								{/* Quick preset row: fill the whole measure with one note value. */}
								<div className="flex items-center gap-1 border-t border-line pt-2">
									<span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint mr-0.5">
										All
									</span>
									{(["quarter", "eighth", "sixteenth"] as const).map((d) => (
										<button
											key={d}
											onClick={() => requestPreset(measureIndex, d)}
											title={`Fill measure with ${d} notes`}
											className="flex items-center justify-center h-7 w-8 border border-line-strong text-ink-dim hover:border-denim hover:text-denim active:bg-denim-tint transition-colors"
										>
											<DurationIcon duration={d} />
										</button>
									))}
								</div>

								{presetConfirm && presetConfirm.measureIndex === measureIndex && (
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

				{/* ── Footer (pinned to the bottom of the scroll area) ───────────── */}
				<div className="sticky bottom-0 z-55 flex items-center justify-between gap-2 border-t border-line bg-popover px-4 py-3">
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
					<Button
						ref={saveButtonRef}
						onClick={handleSave}
						disabled={!nameValid}
						className="h-9 bg-denim text-on-denim hover:bg-denim-accent active:bg-denim-accent disabled:opacity-40"
					>
						Save
					</Button>
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
				{touchMute && selectedCell && isFretInputFocused && !selectedStringFret?.muted && (
					<button
						// Keep the hidden input focused when pressing this button: without
						// it, the button steals focus, blurs the input, and the resulting
						// isFretInputFocused=false would unmount the button before its
						// onClick fires. Preserving focus also keeps the keyboard up.
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => {
							if (selectedCell) commit((prev) => toggleMuted(prev, selectedCell));
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
						className="absolute z-60 border border-line-strong bg-popover py-1 min-w-40 text-sm"
						style={{ top: techMenu.y, left: techMenu.x }}
					>
						{(() => {
							const enabled = hasPreviousNoteOnString(working, techMenu.cell);
							return (
								<>
									{TECHNIQUE_OPTIONS.map((opt) => (
										<button
											key={opt.value}
											disabled={!enabled}
											onClick={() => applyTechnique(opt.value)}
											title={
												enabled
													? undefined
													: "No previous note on this string"
											}
											className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
										>
											{opt.label}
										</button>
									))}
									<button
										disabled={!enabled}
										onClick={applyTied}
										title={
											enabled
												? undefined
												: "No previous note on this string to tie from"
										}
										className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint disabled:cursor-not-allowed transition-colors"
									>
										Tied (⌒)
									</button>
								</>
							);
						})()}
						<div className="border-t border-line my-1" />
						<button
							onClick={applyClearTechnique}
							className="w-full text-left px-3 py-1.5 text-ink-dim hover:bg-denim-tint hover:text-denim transition-colors"
						>
							Clear technique
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

// ── Sub-components ───────────────────────────────────────────────────────────

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
