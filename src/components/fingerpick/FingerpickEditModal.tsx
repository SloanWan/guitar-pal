"use client";

import {
	useState,
	useEffect,
	useMemo,
	useRef,
	useCallback,
} from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ZoomableImage from "@/components/ZoomableImage";
import { Button } from "@/components/ui/button";
import {
	Plus,
	CornerDownLeft,
	Undo2,
	Redo2,
	X as XIcon,
	TriangleAlert,
	ChevronDown,
	Image as ImageIcon,
} from "lucide-react";
import {
	type FingerpickPattern,
	type Measure,
	type StringFret,
} from "@/lib/fingerpickTypes";
import {
	makeDefaultPattern,
	clonePatternForEdit,
	setFret,
	setInactive,
	toggleMuted,
	setTechnique,
	setTied,
	moveCell,
	addMeasure,
	computeBeatLabels,
	computeBeatGroups,
	computeSubBeatGroups,
	tripletGroups,
	tripletWrittenValue,
	isTripletDuration,
	TRIPLET_GROUP_SIZE,
	STRING_LABELS,
	MAX_FRET,
	type Cell,
	type Direction,
	type SlotTarget,
} from "@/lib/fingerpickEdit";
import { deriveRepeatDirectives } from "@/lib/fingerpickRepeats";
import {
	chordFretHints,
	chordSymbolLabel,
	clearString,
	effectiveChords,
	patternHasChords,
	replaceRowWithHints,
	rowDiffersFromHints,
	setSlotChord,
	type FretHint,
} from "@/lib/fingerpickChords";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { getChordIndex } from "@/lib/chords";
import { chordIndexWithUser } from "@/lib/userChordVoicings";
import { clampBpmToMeter, selectRefVoicing } from "@/lib/strumBars";
import { useUser } from "@/hooks/useUser";
import { useUserChordVoicings } from "@/components/chords/useUserChordVoicings";
import { useChordShapeCorpus } from "@/components/chords/useChordShapeMatches";
import ChordShapeModal from "@/components/chords/ChordShapeModal";
import type { UserChordVoicing } from "@/lib/userChordVoicings";
import { parseTabSequence, tabSequenceToShape } from "@/lib/chordTabSequence";
import { chordShapeToVoicing } from "@/lib/chordShape";
import { useChordVoicings } from "./useChordVoicings";
import { useFingerpickPrefs } from "./useFingerpickPrefs";
import { useEditHistory } from "./useEditHistory";
import FingerpickEditorMetaFields from "./FingerpickEditorMetaFields";
import FingerpickEditorHintPopover from "./FingerpickEditorHintPopover";
import FingerpickEditorTouchInput from "./FingerpickEditorTouchInput";
import FingerpickEditorTechniqueMenu from "./FingerpickEditorTechniqueMenu";
import FingerpickEditorMeasureFooter from "./FingerpickEditorMeasureFooter";
import FingerpickEditorMeasureHeader from "./FingerpickEditorMeasureHeader";
import FingerpickEditorColumnPopup from "./FingerpickEditorColumnPopup";
import {
	DURATION_ABBREV,
	GRID_GAP_REM,
	HOVER_L1_BG,
	HOVER_L2_ALPHA,
	HOVER_SUBBEAT_BG,
	MEASURE_BLOCK_REM,
	MODAL_CHROME_REM,
	cellDisplay,
	cellKey,
	columnKey,
	hoverAxisBg,
	parseColumnKey,
	sweepWashBg,
	useHasFinePointer,
	type HoveredCell,
	type ShapeCreateRequest,
} from "./fingerpickEditorShared";

export interface FingerpickEditModalProps {
	open: boolean;
	pattern: FingerpickPattern | null; // null = new pattern from scratch
	/** Names of every other pattern in the library; the save renames a clash to "Name (1)". */
	takenNames?: readonly string[];
	/**
	 * Where the pattern came from, when it was not drawn here — the assistant,
	 * an import. Shown as one line under the header, with whatever the reader
	 * could not carry over, so the player knows to check before saving.
	 */
	notice?: EditorNotice;
	/**
	 * An element to open inside of, instead of over the page: the editor fills
	 * it, is not modal (the rest of the page stays live — a source image beside
	 * it can be zoomed), and closes only from its own buttons.
	 */
	container?: HTMLElement | null;
	/**
	 * The page the pattern was read from, offered as a fold-out strip under
	 * the header for where nothing beside the editor can show it.
	 */
	reference?: { url: string; alt: string };
	onClose: () => void;
	onSave: (pattern: FingerpickPattern) => void;
}

export interface EditorNotice {
	/** The heading, in place of "Edit pattern" / "New pattern". */
	title: string;
	text: string;
	warnings?: readonly string[];
}


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

const TWO_DIGIT_WINDOW_MS = 800;
const LONG_PRESS_MS = 500;

// iMessage-style spring "pop": an easeOutBack overshoot curve that scales past the
// target before settling. Driven via the Web Animations API for the Save press and
// the hint-popover entrance. Read prefers-reduced-motion at call time so both
// effects can fall back to an instant, animation-free state change (§6.7).
// Both now live in src/lib/motion.ts — the strum editors want the same spring.

export default function FingerpickEditModal({
	open,
	pattern: initialPattern,
	takenNames = [],
	notice,
	container,
	reference,
	onClose,
	onSave,
}: FingerpickEditModalProps) {
	const { working, workingRef, commit, undo, redo, canUndo, canRedo, reset: resetHistory } =
		useEditHistory(makeDefaultPattern);
	const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
	const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
	const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
	const [techMenu, setTechMenu] = useState<{ cell: Cell; x: number; y: number } | null>(null);
	// Inline "Discard changes?" confirmation shown when the user tries to close
	// with unsaved edits. Rendered in the header in place of the close button.
	const [discardConfirm, setDiscardConfirm] = useState(false);
	// Repeat-markup validation message; set when Save is blocked by unclosed/dangling
	// repeat barlines, cleared on the next successful save attempt.
	const [repeatError, setRepeatError] = useState<string | null>(null);
	// True when the device has a fine pointer (mouse/trackpad → physical keyboard
	// likely). Drives which editing hint to show.
	const hasFinePointer = useHasFinePointer();
	// Content-relative position of the touch mute button, set when a cell is tapped
	// on a touch device. Rendered only while a cell is selected; gives touch users a
	// way to mute a string (there is no "x" key on the native numeric keyboard).
	const [touchMute, setTouchMute] = useState<{ top: number; left: number } | null>(null);
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

	// Serialized snapshot of the pattern taken when the modal opened. Comparing
	// the live pattern against this detects unsaved edits (see isDirty) without
	// having to flag every individual mutation site.
	const pristineRef = useRef<string>("");
	// Two-digit fret entry buffer.
	const pendingDigitRef = useRef<{ key: string; digit: number; time: number } | null>(null);
	// Focusable cell buttons, keyed by cellKey.
	const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	// When the chord was last worked on from outside the column popup (the
	// chord chip in the grid, a shape created in the nested editor); the popup
	// brings its Chord section into view for it.
	const [revealChordAt, setRevealChordAt] = useState(0);
	const bumpRevealChord = useCallback(() => setRevealChordAt(Date.now()), []);
	// The selected column's DOM box, used to anchor the column popup below it inside
	// the scroll region's coordinate space.
	const popupAnchorRef = useRef<HTMLDivElement | null>(null);

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
	// How a compound meter's beats are labelled under the grid — a device
	// preference, so it is not part of the pattern or its undo history.
	const { countEighths, setCountEighths } = useFingerpickPrefs();
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
	// The shape editor: opened from a chord search that found nothing (`query`
	// seeds the name or the frets), or from the voicing stepper to write another
	// shape for a chord the slot already has (`chord`, starting from `from`).
	// The slot is captured here because the column popup closes under the editor.
	const [shapeCreate, setShapeCreate] = useState<ShapeCreateRequest | null>(null);
	// The middle (measure-grid) scroll area. Only this region scrolls — the
	// header/metadata/footer stay pinned — and it's the coordinate space the
	// absolute popups (technique menu, touch-mute, hidden input) are anchored in.
	const scrollRef = useRef<HTMLDivElement>(null);
	// Save button node, for the spring-pop press feedback.
	const saveButtonRef = useRef<HTMLButtonElement>(null);
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
			resetHistory(next);
			pristineRef.current = JSON.stringify(next);
			setSelectedCell(null);
			setHoveredCell(null);
			setTouchMute(null);
			setSelectedColumns(new Set());
			setTechMenu(null);
			setShapeCreate(null);
			setDiscardConfirm(false);
			setRepeatError(null);
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
		if (selectedColumns.size === 0 && !techMenu) return;
		function handlePointerDown(e: PointerEvent) {
			const target = e.target as HTMLElement;
			if (techMenu && !target.closest("[data-technique-menu]")) {
				setTechMenu(null);
			}
			if (
				selectedColumns.size > 0 &&
				!target.closest("[data-column-popup]") &&
				!target.closest("[data-column-selector]")
			) {
				setSelectedColumns(new Set());
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [selectedColumns, techMenu]);

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
		[commit, applyFretDigit, workingRef],
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

	function toggleColumn(target: SlotTarget) {
		setSelectedColumns((prev) => {
			const next = new Set(prev);
			const key = columnKey(target);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	// Rewrite a string's fretted cells in one measure to the shape's frets.
	function applyReplaceRow(measureIndex: number, stringIndex: number) {
		commit((prev) =>
			replaceRowWithHints(prev, measureIndex, stringIndex, (si) => hintsBySlot[measureIndex]?.[si] ?? null),
		);
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

	// The column popup is anchored below the first selected column's selector.
	const firstSelectedColumn: SlotTarget | null =
		selectedColumns.size > 0
			? [...selectedColumns]
					.map(parseColumnKey)
					.sort((a, b) => a.measureIndex - b.measureIndex || a.slotIndex - b.slotIndex)[0]
			: null;
	const firstSelectedColumnKey = firstSelectedColumn ? columnKey(firstSelectedColumn) : null;

	// A chord the search knows nothing about is written down as a shape of the
	// player's own, then set on the slot it was searched for.
	function handleShapeCreated(voicing: UserChordVoicing) {
		if (!shapeCreate) return;
		// Pin what was stored: an identical shape already on record keeps its id.
		const stored = saveVoicing(voicing);
		const target = shapeCreate.target;
		commit((prev) =>
			setSlotChord(prev, target, { root: stored.root, suffix: stored.suffix, voicingId: stored.id }),
		);
		bumpRevealChord();
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
			bpm: clampBpmToMeter(working.bpm, working.timeSignature),
		});
		onClose();
	}

	const nameValid = working.name.trim().length > 0;

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

	// Inside a container the editor is that element, edge to edge, and not
	// modal: no overlay, no focus trap, and an outside click is not a close —
	// the page beside it is meant to be used while this is open.
	const contained = container != null;

	return (
		<Dialog open={open} modal={!contained} onOpenChange={(isOpen) => !isOpen && requestClose()}>
			<DialogContent
				showCloseButton={false}
				container={contained ? container : undefined}
				style={contained ? undefined : dynamicStyle}
				className={
					contained
						? "absolute inset-0 top-0 left-0 z-30 h-full max-h-none w-full max-w-none sm:max-w-none translate-x-0 translate-y-0 rounded-none ring-0 overflow-hidden flex flex-col p-0"
						: "w-full max-w-[calc(100%-2rem)] sm:max-w-lg md:max-w-3xl lg:w-(--fp-w) lg:max-w-[min(var(--fp-w),96vw)] max-h-[80vh] lg:max-h-[90vh] overflow-hidden flex flex-col p-0"
				}
				onInteractOutside={(e) => {
					if (contained) e.preventDefault();
				}}
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
						{notice?.title ?? (initialPattern ? "Edit pattern" : "New pattern")}
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

				{notice && (
					<div className="shrink-0 border-b border-line bg-denim-tint px-4 py-2 text-xs leading-snug text-ink-dim">
						<p>{notice.text}</p>
						{/* The reader's warnings, folded: the count on one line, the
						    list on demand, so a long list never pushes the grid down. */}
						{notice.warnings && notice.warnings.length > 0 && (
							<details className="group mt-1">
								<summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
									<TriangleAlert className="size-3" strokeWidth={1.5} aria-hidden="true" />
									{notice.warnings.length} {notice.warnings.length === 1 ? "warning" : "warnings"}
									<ChevronDown
										className="size-3 transition-transform duration-(--dur-hover) group-open:rotate-180"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
								</summary>
								<ul className="mt-1">
									{notice.warnings.map((line) => (
										<li key={line} className="flex gap-2 py-0.5">
											<TriangleAlert
												className="mt-px size-3.5 shrink-0"
												strokeWidth={1.5}
												aria-hidden="true"
											/>
											<span>{line}</span>
										</li>
									))}
								</ul>
							</details>
						)}
					</div>
				)}

				{/* The source page, folded under the header. Zoomable, so a fret can
				    be checked against the print without leaving the grid. */}
				{reference && (
					<details className="group shrink-0 border-b border-line">
						<summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-denim-accent transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
							<ImageIcon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
							Source page
							<ChevronDown
								className="size-3 transition-transform duration-(--dur-hover) group-open:rotate-180"
								strokeWidth={1.5}
								aria-hidden="true"
							/>
						</summary>
						<ZoomableImage src={reference.url} alt={reference.alt} className="max-h-[32vh]" />
					</details>
				)}

				<FingerpickEditorMetaFields
					working={working}
					commit={commit}
					takenNames={takenNames}
					countEighths={countEighths}
					onCountEighthsChange={setCountEighths}
				/>

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
					<div
						className={`grid gap-4 px-4 select-none ${
							// Inside a container the width is the container's, not the
							// measure count's: as many blocks as fit, one at the least.
							contained
								? "grid-cols-[repeat(auto-fill,minmax(var(--fp-block),1fr))]"
								: "grid-cols-1 md:grid-cols-2 lg:grid-cols-[repeat(var(--fp-cols),minmax(0,1fr))]"
						}`}
						style={contained ? ({ "--fp-block": `${MEASURE_BLOCK_REM}rem` } as React.CSSProperties) : undefined}
					>
						{working.measures.map((measure, measureIndex) => {
							const beatLabels = computeBeatLabels(
								measure.slots,
								working.timeSignature,
								countEighths ? "eighths" : "beats",
							);
							const beatGroups = computeBeatGroups(
								measure.slots,
								working.timeSignature,
							);
							// Where each slot sits under a `3` bracket: the bracket row is
							// drawn column by column (left cap, the "3", right cap), and
							// every column of a measure that has a bracket gets the row so
							// the label rows beneath stay level.
							const bracketRole = new Map<number, "start" | "mid" | "end">();
							for (const g of tripletGroups(measure.slots)) {
								bracketRole.set(g.start, "start");
								bracketRole.set(g.start + 1, "mid");
								bracketRole.set(g.start + TRIPLET_GROUP_SIZE - 1, "end");
							}
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
									<FingerpickEditorMeasureHeader
										measure={measure}
										measureIndex={measureIndex}
										measureCount={working.measures.length}
										commit={commit}
										hasChords={hasChords}
										hints={hintsBySlot[measureIndex]}
										onHighlight={setHighlightedMeasureId}
										onNudge={(dir) => setMoveNudge({ id: measure.id, dir })}
									/>

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
																								: slot.stroke && !isRest
																									? {
																											backgroundColor:
																												sweepWashBg(
																													slot.stroke,
																													stringIndex,
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

																		{/* Triplet bracket: a `3` over the group's three columns,
																		    the way the stave draws it. A member's duration label then
																		    shows the note it is drawn as (three E under a 3), not E³. */}
																		{bracketRole.size > 0 &&
																			(() => {
																				const role = bracketRole.get(slotIndex);
																				if (!role) return <div className="h-3" />;
																				return (
																					<div
																						onMouseEnter={() =>
																							hoverColumn(measureIndex, slotIndex)
																						}
																						className={`h-3 border-t border-ink-faint text-center font-mono text-[8px] leading-3 text-ink-faint ${
																							role === "start"
																								? "border-l"
																								: role === "end"
																									? "border-r"
																									: ""
																						}`}
																					>
																						{role === "mid" ? TRIPLET_GROUP_SIZE : ""}
																					</div>
																				);
																			})()}

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
																			{bracketRole.has(slotIndex) &&
																			isTripletDuration(slot.duration)
																				? DURATION_ABBREV[tripletWrittenValue(slot.duration)]
																				: DURATION_ABBREV[slot.duration]}
																		</div>

																		{/* Column selector. The popup itself is rendered once, absolutely
															    positioned inside the scroll region and anchored below the
															    first selected column (see FingerpickEditorColumnPopup). */}
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

									<FingerpickEditorMeasureFooter
										measure={measure}
										measureIndex={measureIndex}
										working={working}
										commit={commit}
										chordsInEffect={chordsInEffect[measureIndex]}
										voicingsFor={voicingsFor}
										onSetRepeat={(patch) => setMeasureRepeat(measureIndex, patch)}
									/>
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

					<FingerpickEditorTouchInput
						inputRef={hiddenInputRef}
						working={working}
						selectedCell={selectedCell}
						touchMute={touchMute}
						onDigit={(digit) => {
							if (selectedCell) applyFretDigit(selectedCell, digit);
						}}
						onBackspace={() => {
							if (selectedCell) commit((prev) => setInactive(prev, selectedCell));
							pendingDigitRef.current = null;
						}}
						onToggleMute={() => {
							if (selectedCell) commit((prev) => toggleMuted(prev, selectedCell));
						}}
						onBlur={() => {
							pendingDigitRef.current = null;
						}}
					/>

					{/* ── Technique context menu (absolute within the content box) ───── */}
					{techMenu && (
						<FingerpickEditorTechniqueMenu
							working={working}
							cell={techMenu.cell}
							x={techMenu.x}
							y={techMenu.y}
							scrollRef={scrollRef}
							onTechnique={applyTechnique}
							onTied={applyTied}
							onClear={applyClearTechnique}
						/>
					)}

					{/* ── Column popup (absolute within the scroll region) ───────────── */}
					{firstSelectedColumnKey && (
						<FingerpickEditorColumnPopup
							working={working}
							commit={commit}
							selectedColumns={selectedColumns}
							onClearSelection={() => setSelectedColumns(new Set())}
							chordsInEffect={chordsInEffect}
							hintsBySlot={hintsBySlot}
							voicingsFor={voicingsFor}
							searchIndex={searchIndex}
							shapeCorpus={shapeCorpus}
							scrollRef={scrollRef}
							anchorRef={popupAnchorRef}
							revealChordAt={revealChordAt}
							onCreateShape={setShapeCreate}
						/>
					)}
				</div>
				{/* ── Footer (fixed; sibling of the scroll region, never scrolls) ── */}
				<div className="shrink-0 flex items-center justify-between gap-2 border-t border-line bg-popover px-4 py-3">
					<FingerpickEditorHintPopover hasFinePointer={hasFinePointer} />
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
