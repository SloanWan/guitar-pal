"use client";

/**
 * A horizontal guitar neck that lights up whatever `FretMark[]` it is handed.
 *
 * It knows nothing about scales or chords: every consumer (scale viewer, chord
 * overlay, CAGED, improvisation) is a pure function producing marks, and this
 * is the one board they all draw on. Check the imports: only the mark model
 * and position-only pitch facts (what a slot sounds, where its unisons are).
 *
 * Rendering model: the marks are an LED matrix. Every string/fret slot on the
 * neck is always in the DOM as a dormant node; a mark switches its slot on.
 * Changing root, scale or chord therefore never mounts or unmounts anything —
 * the dots cross-fade in CSS.
 *
 * Interaction is position-only and never re-renders the board: hovering a slot
 * rings its unisons and octaves by toggling `data-hover` on a handful of nodes;
 * pressing a slot reports `{ string, fret, midi }` and plays a transient
 * ripple straight on the DOM, plus a pulse (lit slot) or a string pluck
 * (dormant slot). The same feedback is available through the `strike` handle
 * for a note or chord that sounded elsewhere.
 *
 * A capo clamps the strings at its fret: everything behind it is out of play
 * (the caller stops sending marks there), the capo fret becomes the new open
 * string, and notes fretted above it keep the pitch they always had — a capo
 * does not transpose them. The bar can be dragged along the neck and snaps to
 * the fret the pointer is over.
 *
 * Sizing: the board scales so that `VISIBLE_FRETS` cells fill the container,
 * the size a full-width 15-fret board had, and the rest of the 22-fret neck
 * scrolls sideways under the fixed string-name column. The scale comes from
 * container-query units in CSS, so no measuring in JS; a floor keeps a phone
 * from shrinking the cells, it scrolls further instead. Geometry is uniform
 * per fret rather than the real 2^(1/12) taper so every position reads the same.
 */
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type Ref,
} from "react";

import { ChevronLeft, ChevronRight, Play, Square, X } from "lucide-react";

import { STRING_LABELS } from "@/lib/chordVoicingToMidi";
import { relatedSlots, slotMidi, type SlotNote, type SlotPosition } from "@/lib/fretboard/positions";

import {
	STRING_COUNT,
	slotKey,
	type FretMark,
	type FretboardProps,
	type MarkEmphasis,
} from "@/lib/fretboard/types";
import { SPRING_POP_EASING, prefersReducedMotion } from "@/lib/motion";

// ── Geometry (SVG user units = CSS px) ──────────────────────────────────────
// Cell k (the space behind fret wire k) spans x = [k·FRET_W, (k+1)·FRET_W]; the
// open-string cell is k = 0, so the nut is the right edge of cell 0 and fret
// wire k is the right edge of cell k. Strings sit at y = TOP + (5 − s)·GAP,
// low E at the bottom the way TAB and every scale chart draw it.
export const FRET_W = 44;
const LABEL_W = 24;
const TOP = 16;
const STRING_GAP = 22;
const DOT_R = 8;
const RING_R = 11;
/** The hover ring sits just outside a root's ring so the two never merge. */
const HOVER_R = 13;
const INLAY = 5;
const NUMBERS_Y = TOP + (STRING_COUNT - 1) * STRING_GAP + 22;
const H = NUMBERS_Y + 8;
/** Keeps the boundary fret wires from being half-clipped at the neck's edges. */
const EDGE = 1;
/** How many cells fill the container width: the open cell plus 15 frets. */
const VISIBLE_FRETS = 16;
/** Smallest scale a narrow container may reach; below it the neck scrolls. */
const MIN_SCALE = 1.25;
/** Extra label-column width for the per-string play buttons, which sit left of the names. */
const PLAY_COL_W = 18;
/** The play/clear controls, sitting above a highlighted position. */
const BOX_BTN = 14;
/** Headroom kept for them, so the board does not jump when a position appears. */
const BOX_BTN_ROW = BOX_BTN + 4;


/** Design width that `VISIBLE_FRETS` occupies, labels included. */
function designWidth(labelW: number): number {
	return labelW + VISIBLE_FRETS * FRET_W + EDGE * 2;
}

// ── Press feedback ──────────────────────────────────────────────────────────
/** A lit slot pulses: 1 → 1.35 → 1 on the shared spring. */
const PULSE_MS = 350;
const PULSE_SCALE = 1.35;
/** Every strike sends out a ripple, and a dormant slot plucks: the string rings for this long… */
const PLUCK_MS = 300;
/** …over this many cells either side of the tap… */
const PLUCK_REACH = FRET_W * 1.5;
/** …at this peak displacement, this frequency, decaying with this time constant. */
const PLUCK_AMP = 3.5;
const PLUCK_HZ = 14;
const PLUCK_TAU_S = 0.09;
/** The ripple expands from the dot to this many times `HOVER_R`. */
const POP_SCALE = 1.7;
/** A pointer that travels further than this before lifting is a scroll, not a tap. */
const TAP_SLOP_PX = 8;
/** The capo bar: a band just behind its fret wire, square-ended like everything here. */
const CAPO_W = 7;
/** Invisible margin each side of the bar, so a finger can catch it. */
const CAPO_GRIP_PAD = 7;
/** Default stagger for `strike`, matching the strum engine's per-string offset. */
const STRIKE_STAGGER_MS = 10;

/**
 * A length in CSS: `units` design units at the container's scale, never below
 * the floor. `100cqw` is the width of the nearest query container, the outer
 * wrapper, so `100cqw / DESIGN_W` is the scale factor.
 */
function scaled(units: number, designW: number): string {
	return `max(calc(100cqw * ${(units / designW).toFixed(5)}), ${(units * MIN_SCALE).toFixed(2)}px)`;
}

const SINGLE_INLAYS: readonly number[] = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS: readonly number[] = [12, 24];

/** Thicker toward the low E, the way the strings actually are. */
const STRING_STROKE: readonly number[] = [2, 1.7, 1.4, 1.1, 0.9, 0.75];

function cellCenterX(fret: number): number {
	return fret * FRET_W + FRET_W / 2;
}

function wireX(fret: number): number {
	return (fret + 1) * FRET_W;
}

function stringY(string: number): number {
	return TOP + (STRING_COUNT - 1 - string) * STRING_GAP;
}

function betweenStringsY(lower: number): number {
	return (stringY(lower) + stringY(lower + 1)) / 2;
}

function straightString(x0: number, x1: number, y: number): string {
	return `M${x0} ${y}L${x1} ${y}`;
}

/** The hit layer's slot from any node inside it, or null off the slots. */
function slotFromTarget(target: EventTarget | null): { el: SVGGElement; string: number; fret: number } | null {
	if (!(target instanceof Element)) return null;
	const el = target.closest<SVGGElement>("[data-slot]");
	if (!el) return null;
	const [string, fret] = (el.dataset.slot ?? "").split(":").map(Number);
	if (!Number.isInteger(string) || !Number.isInteger(fret)) return null;
	return { el, string, fret };
}

/** WAAPI is absent in jsdom; feedback is decoration, so silently skip it there. */
function canAnimate(el: Element): el is Element & Animatable {
	return typeof (el as Partial<Animatable>).animate === "function";
}

export type HoverRole = "self" | "unison" | "octave";

export interface FretboardHandle {
	/**
	 * Play the press feedback (pulse on a lit slot, pluck on a dormant one) on
	 * each slot in order, `staggerMs` apart, the way a strum reaches the
	 * strings. No-op under reduced motion.
	 */
	strike: (slots: readonly SlotPosition[], staggerMs?: number) => void;
	/**
	 * Scroll a fret into view if it is not already, so a run that walks past
	 * the right edge stays watchable. Does nothing while the fret is comfortably
	 * inside the viewport, or the neck would twitch on every note.
	 */
	revealFret: (fret: number) => void;
}

export interface FretboardComponentProps extends FretboardProps {
	ref?: Ref<FretboardHandle>;
	className?: string;
	/**
	 * A capo at this fret: a bar is drawn across it and the frets behind it
	 * are dimmed. Pressing a slot behind the capo reports the pitch the capo
	 * makes the string sound, since nothing behind a capo can sound itself.
	 * 0 or absent: no capo.
	 */
	capo?: number;
	/**
	 * Called as the capo bar is dragged or keyed to another fret. Without it
	 * the bar is drawn but inert.
	 */
	onCapoChange?: (fret: number) => void;
	/** Highest fret the capo may be dragged to; the neck's last fret by default. */
	maxCapo?: number;
	/**
	 * A span of frets to outline — the hand position a run is being played in.
	 * Drawn as a dashed frame over the neck, behind the marks.
	 */
	highlight?: { fromFret: number; toFret: number } | null;
	/** Adds a play button beside each string name, for running the scale along it. */
	onStringPlay?: (string: number) => void;
	/** The string whose run is sounding now: its button becomes a stop button. */
	playingString?: number | null;
	/**
	 * Notes a run would play, tinted so the line through the position is
	 * visible before it sounds, and shaded by octave so the register reads at
	 * a glance. The first is left alone: it is the tonic, and says so already.
	 */
	runSlots?: readonly SlotNote[];
	/**
	 * Drag the highlighted position's right edge to this fret. Without it the
	 * frame has no handle and cannot be resized.
	 */
	onHighlightResize?: (toFret: number) => void;
	/** How few and how many frets a position may be dragged to. */
	minHighlightFrets?: number;
	maxHighlightFrets?: number;
	/** Play or stop the highlighted position, from a button on its frame. */
	onHighlightPlay?: () => void;
	/** Dismiss the highlighted position, from an × on its frame. */
	onHighlightClear?: () => void;
	/** Whether the highlighted position is the run sounding now. */
	highlightPlaying?: boolean;
	/**
	 * Right-pressing a slot picks a hand position starting at that fret — the
	 * width is fixed, so only the left edge is chosen and no drag is needed.
	 * The context menu is suppressed on the neck while this is set.
	 */
	onPositionPick?: (fromFret: number) => void;
	/** Accessible name for the board; defaults to a plain description. */
	label?: string;
	/**
	 * Called when a slot is tapped or clicked, lit or not, with what it sounds.
	 * A drag (native scroll on touch) never counts as a press.
	 */
	onSlotPress?: (slot: SlotNote) => void;
	/**
	 * Called with the slot under a mouse pointer as it moves, and with null
	 * when it leaves the board — so another view (the piano) can follow the
	 * hover. Fired from the same handlers as the rings: no re-render.
	 */
	onSlotHover?: (slot: SlotNote | null) => void;
	/**
	 * Whether slots may be pressed. Off: no pointer cursor, no pulse or pluck,
	 * `onSlotPress` never fires. Hover rings are visual and stay on regardless.
	 */
	pressable?: boolean;
}

type SlotEmphasis = MarkEmphasis | "none";

interface PendingPress {
	pointerId: number;
	x: number;
	y: number;
	key: string;
}

export default function Fretboard({
	ref,
	marks,
	fromFret,
	toFret,
	className,
	capo = 0,
	onCapoChange,
	maxCapo,
	highlight = null,
	onStringPlay,
	playingString = null,
	runSlots,
	onHighlightPlay,
	onHighlightClear,
	onHighlightResize,
	minHighlightFrets = 3,
	maxHighlightFrets = 7,
	highlightPlaying = false,
	onPositionPick,
	label = "Guitar fretboard",
	onSlotPress,
	onSlotHover,
	pressable = true,
}: FretboardComponentProps) {
	const neck = useRef<SVGSVGElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	/** Nodes currently carrying a `data-hover`, so leaving clears exactly those. */
	const hovered = useRef<SVGGElement[]>([]);
	const pending = useRef<PendingPress | null>(null);
	/** One running pluck per string, so a re-pluck restarts rather than stacks. */
	const plucks = useRef(new Map<number, number>());
	/** Pending staggered strikes, so unmount cancels them (Constraint 4). */
	const strikes = useRef(new Set<ReturnType<typeof setTimeout>>());
	const canPress = pressable && !!onSlotPress;

	// Constraint 4: a pluck still in flight on unmount must not touch a dead node.
	useEffect(() => {
		const running = plucks.current;
		const pendingStrikes = strikes.current;
		return () => {
			for (const id of running.values()) cancelAnimationFrame(id);
			running.clear();
			for (const t of pendingStrikes) clearTimeout(t);
			pendingStrikes.clear();
		};
	}, []);

	// ── Hover: ring the unisons and octaves, on the DOM, no re-render ──────────
	const clearRings = useCallback(() => {
		for (const el of hovered.current) delete el.dataset.hover;
		hovered.current = [];
	}, []);

	/** Leaving the board: rings off and the listener told, once. */
	const clearHover = useCallback(() => {
		if (hovered.current.length === 0) return;
		clearRings();
		onSlotHover?.(null);
	}, [clearRings, onSlotHover]);

	const handlePointerOver = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			if (e.pointerType === "touch") return;
			const slot = slotFromTarget(e.target);
			if (!slot) return;
			const board = neck.current;
			if (!board) return;
			clearRings(); // moving between slots: the listener gets the new slot, not a null first
			const set = (el: SVGGElement | null, role: HoverRole) => {
				if (!el) return;
				el.dataset.hover = role;
				hovered.current.push(el);
			};
			set(slot.el, "self");
			const { unison, octave } = relatedSlots(slot.string, slot.fret, { fromFret, toFret });
			for (const pos of unison) set(board.querySelector(`[data-slot="${slotKey(pos.string, pos.fret)}"]`), "unison");
			for (const pos of octave) set(board.querySelector(`[data-slot="${slotKey(pos.string, pos.fret)}"]`), "octave");
			onSlotHover?.({ string: slot.string, fret: slot.fret, midi: slotMidi(slot.string, slot.fret) });
		},
		[clearRings, onSlotHover, fromFret, toFret],
	);

	const handlePointerOut = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			// Leaving a slot for the neck's wood, or the neck entirely; moving
			// between slots is handled by the next pointerover.
			if (e.pointerType === "touch") return;
			const next = slotFromTarget(e.relatedTarget);
			if (!next) clearHover();
		},
		[clearHover],
	);

	// ── Press: tap sounds, drag scrolls ────────────────────────────────────────
	const pulse = useCallback((string: number, fret: number) => {
		const mark = neck.current?.querySelector(`.fb-mark[data-string="${string}"][data-fret="${fret}"]`);
		if (!mark || !canAnimate(mark)) return;
		mark.animate(
			[{ transform: "scale(1)" }, { transform: `scale(${PULSE_SCALE})` }, { transform: "scale(1)" }],
			{ duration: PULSE_MS, easing: SPRING_POP_EASING },
		);
	}, []);

	/** The ripple: a ring that grows out of the slot and fades. */
	const ripple = useCallback((string: number, fret: number) => {
		const pop = neck.current?.querySelector(`[data-slot="${slotKey(string, fret)}"] .fb-pop`);
		if (!pop || !canAnimate(pop)) return;
		pop.animate(
			[
				{ transform: "scale(0.5)", opacity: 0.9 },
				{ transform: `scale(${POP_SCALE})`, opacity: 0 },
			],
			{ duration: PLUCK_MS, easing: "ease-out" },
		);
	}, []);

	/** The string vibrates around the slot for a moment. */
	const pluck = useCallback(
		(string: number, fret: number) => {
			const board = neck.current;
			if (!board) return;
			const path = board.querySelector<SVGPathElement>(`.fb-string[data-string="${string}"]`);
			if (!path) return;
			const y = stringY(string);
			const x0 = fromFret * FRET_W;
			const x1 = wireX(toFret);
			const x = cellCenterX(fret);
			const a = Math.max(x0, x - PLUCK_REACH);
			const b = Math.min(x1, x + PLUCK_REACH);
			const prior = plucks.current.get(string);
			if (prior !== undefined) cancelAnimationFrame(prior);
			const start = performance.now();
			// Clock the frames from performance.now() rather than the rAF
			// timestamp: the two share an origin in browsers but not in jsdom.
			const frame = () => {
				const t = (performance.now() - start) / 1000;
				if (t >= PLUCK_MS / 1000) {
					path.setAttribute("d", straightString(x0, x1, y));
					plucks.current.delete(string);
					return;
				}
				// The control point sits at twice the displacement: a quadratic
				// curve's apex is halfway between the chord and its control.
				const amp = PLUCK_AMP * Math.sin(2 * Math.PI * PLUCK_HZ * t) * Math.exp(-t / PLUCK_TAU_S);
				path.setAttribute("d", `M${x0} ${y}L${a} ${y}Q${x} ${y + 2 * amp} ${b} ${y}L${x1} ${y}`);
				plucks.current.set(string, requestAnimationFrame(frame));
			};
			plucks.current.set(string, requestAnimationFrame(frame));
		},
		[fromFret, toFret],
	);

	/** A ripple always; on top of it a lit slot pulses, a dormant one plucks its string. */
	const feedback = useCallback(
		(string: number, fret: number) => {
			const board = neck.current;
			if (!board) return;
			ripple(string, fret);
			const mark = board.querySelector<SVGGElement>(`.fb-mark[data-string="${string}"][data-fret="${fret}"]`);
			const lit = !!mark && mark.dataset.emphasis !== "none";
			if (lit) pulse(string, fret);
			else pluck(string, fret);
		},
		[ripple, pulse, pluck],
	);

	useImperativeHandle(
		ref,
		() => ({
			revealFret(fret) {
				const el = scroller.current;
				const svg = neck.current;
				if (!el || !svg || typeof el.scrollTo !== "function") return;
				const scale = svg.getBoundingClientRect().width / Number(svg.getAttribute("width"));
				if (!Number.isFinite(scale) || scale <= 0) return;
				const left = (fret - fromFret) * FRET_W * scale;
				const width = FRET_W * scale;
				// A cell of slack at each edge, so the neck moves before the
				// playhead reaches the very edge rather than after.
				const margin = width;
				const min = el.scrollLeft + margin;
				const max = el.scrollLeft + el.clientWidth - width - margin;
				if (left >= min && left <= max) return;
				// Nudge only as far as the fret needs plus a cell of lead, rather
				// than centring it: a run steps a fret or two at a time, so the
				// neck creeps along with it instead of jumping half a screen.
				const overshoot = left < min ? left - min - width : left - max + width;
				el.scrollTo({
					left: Math.max(0, el.scrollLeft + overshoot),
					behavior: prefersReducedMotion() ? "auto" : "smooth",
				});
			},
			strike(slots, staggerMs = STRIKE_STAGGER_MS) {
				if (prefersReducedMotion()) return;
				slots.forEach((slot, i) => {
					if (i === 0) {
						feedback(slot.string, slot.fret);
						return;
					}
					const timer = setTimeout(() => {
						strikes.current.delete(timer);
						feedback(slot.string, slot.fret);
					}, i * staggerMs);
					strikes.current.add(timer);
				});
			},
		}),
		[feedback, fromFret],
	);

	const handlePointerDown = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			// Right-press picks a hand position rather than sounding a note.
			if (e.button === 2) {
				const picked = slotFromTarget(e.target);
				if (picked && onPositionPick) {
					e.preventDefault();
					onPositionPick(picked.fret);
				}
				return;
			}
			if (!canPress) return;
			const slot = slotFromTarget(e.target);
			if (!slot) return;
			// No preventDefault: on touch the browser must still be free to scroll.
			pending.current = {
				pointerId: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				key: slotKey(slot.string, slot.fret),
			};
		},
		[canPress, onPositionPick],
	);

	const handlePointerUp = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			const press = pending.current;
			pending.current = null;
			if (!press || !canPress || press.pointerId !== e.pointerId) return;
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) return;
			const slot = slotFromTarget(e.target);
			if (!slot || slotKey(slot.string, slot.fret) !== press.key) return;

			// Behind a capo the string cannot sound at this fret; it sounds at the capo.
			const soundingFret = capo > 0 && slot.fret < capo ? capo : slot.fret;
			onSlotPress?.({ string: slot.string, fret: slot.fret, midi: slotMidi(slot.string, soundingFret) });

			if (prefersReducedMotion()) return;
			feedback(slot.string, slot.fret);
		},
		[canPress, capo, onSlotPress, feedback],
	);

	const cancelPress = useCallback(() => {
		pending.current = null;
	}, []);

	// ── Capo: drag the bar along the neck, snapping to the fret under the pointer ──
	const capoMax = maxCapo ?? toFret;
	const draggingCapo = useRef(false);

	/** Where the drag began, so the capo moves *with* the pointer. */
	const capoGrab = useRef<{ x: number; fret: number } | null>(null);


	/** Rendered width of one fret, for turning a pointer distance into frets. */
	const fretPixels = useCallback((): number => {
		const svg = neck.current;
		if (!svg) return 0;
		const width = (toFret - fromFret + 1) * FRET_W + EDGE * 2;
		const rendered = svg.getBoundingClientRect().width;
		return rendered > 0 ? (rendered / width) * FRET_W : 0;
	}, [fromFret, toFret]);

	const handleCapoDown = useCallback(
		(e: ReactPointerEvent<SVGRectElement>) => {
			// The neck must not treat this as a slot press, nor scroll under it.
			e.stopPropagation();
			e.preventDefault();
			e.currentTarget.setPointerCapture?.(e.pointerId);
			draggingCapo.current = true;
			capoGrab.current = { x: e.clientX, fret: capo };
		},
		[capo],
	);

	const handleCapoMove = useCallback(
		(e: ReactPointerEvent<SVGRectElement>) => {
			const grab = capoGrab.current;
			if (!draggingCapo.current || !grab) return;
			e.stopPropagation();
			const perFret = fretPixels();
			if (perFret <= 0) return;
			// Relative to where it was grabbed, so merely touching the bar — whose
			// grip is wider than the bar and straddles a fret wire — moves nothing.
			const next = Math.max(0, Math.min(capoMax, grab.fret + Math.round((e.clientX - grab.x) / perFret)));
			if (next !== capo) onCapoChange?.(next);
		},
		[capo, capoMax, fretPixels, onCapoChange],
	);

	const handleCapoUp = useCallback((e: ReactPointerEvent<SVGRectElement>) => {
		if (!draggingCapo.current) return;
		draggingCapo.current = false;
		capoGrab.current = null;
		e.currentTarget.releasePointerCapture?.(e.pointerId);
		e.stopPropagation();
	}, []);

	/** The narrowest and widest right edge a position may be given. */
	const widthLimits = useMemo(
		() =>
			highlight
				? {
						low: highlight.fromFret + minHighlightFrets - 1,
						high: Math.min(toFret, highlight.fromFret + maxHighlightFrets - 1),
					}
				: null,
		[highlight, minHighlightFrets, maxHighlightFrets, toFret],
	);

	const resizeBy = useCallback(
		(step: number) => {
			if (!highlight || !onHighlightResize || !widthLimits) return;
			const next = Math.max(widthLimits.low, Math.min(widthLimits.high, highlight.toFret + step));
			if (next !== highlight.toFret) onHighlightResize(next);
		},
		[highlight, onHighlightResize, widthLimits],
	);

	const handleCapoKey = useCallback(
		(e: ReactKeyboardEvent<SVGGElement>) => {
			let next: number | null = null;
			if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(capoMax, capo + 1);
			else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, capo - 1);
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = capoMax;
			if (next === null || next === capo) return;
			e.preventDefault();
			onCapoChange?.(next);
		},
		[capo, capoMax, onCapoChange],
	);

	const byKey = new Map<string, FretMark>();
	for (const mark of marks) byKey.set(slotKey(mark.string, mark.fret), mark);

	const cells = toFret - fromFret + 1;
	const neckW = cells * FRET_W + EDGE * 2;
	const frets = Array.from({ length: cells }, (_, i) => fromFret + i);
	const strings = Array.from({ length: STRING_COUNT }, (_, string) => string);

	// The play buttons claim their own column; the board's scale follows, so a
	// neck without them is laid out exactly as it always was.
	const labelW = onStringPlay ? LABEL_W + PLAY_COL_W : LABEL_W;
	const designW = designWidth(labelW);
	// Kept whether or not a position is showing, so the board does not jump.
	const headH = onHighlightPlay || onHighlightClear ? BOX_BTN_ROW : 0;
	const boardH = H + headH;
	const size = (units: number) => scaled(units, designW);
	// Shade by octave above the run's own lowest note, so a line climbing the
	// neck darkens and lightens with the register rather than reading flat.
	const runShades = new Map<string, number>();
	if (runSlots && runSlots.length > 0) {
		const base = Math.floor(runSlots[0].midi / 12);
		for (const slot of runSlots.slice(1)) {
			runShades.set(slotKey(slot.string, slot.fret), Math.min(3, Math.max(0, Math.floor(slot.midi / 12) - base)));
		}
	}

	return (
		<div
			className={className}
			style={{ containerType: "inline-size" }}
			role="img"
			aria-label={label}
		>
			<div className="flex">
				{/* String names: a fixed column, outside the scroller. */}
				<svg
					viewBox={`0 0 ${labelW} ${boardH}`}
					width={labelW}
					height={boardH}
					className="shrink-0"
					style={{ width: size(labelW), height: size(boardH) }}
					aria-hidden={onStringPlay ? undefined : "true"}
				>
					<g style={{ transform: `translateY(${headH}px)` }}>
						{strings.map((string) => (
							<text
								key={string}
								x={labelW - 8}
								y={stringY(string) + 3}
								textAnchor="end"
								fontSize={9}
								className="fill-ink-faint font-mono"
							>
								{STRING_LABELS[string]}
							</text>
						))}
						{/* One button per string, left of its name: run the scale along it. */}
						{onStringPlay &&
							strings.map((string) => {
								const playing = playingString === string;
								const cx = PLAY_COL_W / 2 - 2;
								const cy = stringY(string);
								return (
									<g
										key={`play-${string}`}
										className="fb-string-play"
										data-playing={playing || undefined}
										role="button"
										tabIndex={0}
										aria-label={
											playing ? `Stop the ${STRING_LABELS[string]} string` : `Play the ${STRING_LABELS[string]} string`
										}
										onClick={() => onStringPlay(string)}
										onKeyDown={(e) => {
											if (e.key !== "Enter" && e.key !== " ") return;
											e.preventDefault();
											onStringPlay(string);
										}}
									>
										<circle className="fb-string-play-bg" cx={cx} cy={cy} r={6.5} fill="none" />
										{playing ? (
											<rect x={cx - 2.5} y={cy - 2.5} width={5} height={5} fill="none" />
										) : (
											<path fill="none" d={`M${cx - 2} ${cy - 3.5}L${cx + 3.5} ${cy}L${cx - 2} ${cy + 3.5}Z`} />
										)}
									</g>
								);
							})}
					</g>
				</svg>

				<div
					ref={scroller}
					className="fp-thin-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
				>
					<svg
						ref={neck}
						viewBox={`0 0 ${neckW} ${boardH}`}
						width={neckW}
						height={boardH}
						className="block max-w-none"
						style={{ width: size(neckW), height: size(boardH) }}
						onContextMenu={onPositionPick ? (e) => e.preventDefault() : undefined}
						data-from-fret={fromFret}
						data-to-fret={toFret}
						data-pressable={canPress || undefined}
						data-capo={capo > 0 ? capo : undefined}
						aria-disabled={onSlotPress && !pressable ? true : undefined}
						onPointerOver={handlePointerOver}
						onPointerOut={handlePointerOut}
						onPointerDown={handlePointerDown}
						onPointerUp={handlePointerUp}
						onPointerCancel={cancelPress}
					>
						<g
							className="fb-neck"
							style={{ transform: `translate(${EDGE - fromFret * FRET_W}px, ${headH}px)` }}
						>
							{/* Inlays: squares, so they are not mistaken for marks. */}
							{frets.map((fret) => {
								if (SINGLE_INLAYS.includes(fret)) {
									return (
										<rect
											key={`inlay-${fret}`}
											x={cellCenterX(fret) - INLAY / 2}
											y={betweenStringsY(2) - INLAY / 2}
											width={INLAY}
											height={INLAY}
											className="fill-ink-faint"
											opacity={0.6}
										/>
									);
								}
								if (DOUBLE_INLAYS.includes(fret)) {
									return (
										<g
											key={`inlay-${fret}`}
											className="fill-ink-faint"
											opacity={0.6}
										>
											<rect
												x={cellCenterX(fret) - INLAY / 2}
												y={betweenStringsY(1) - INLAY / 2}
												width={INLAY}
												height={INLAY}
											/>
											<rect
												x={cellCenterX(fret) - INLAY / 2}
												y={betweenStringsY(3) - INLAY / 2}
												width={INLAY}
												height={INLAY}
											/>
										</g>
									);
								}
								return null;
							})}

							{/* Fret wires, then the nut over them when the open cell is shown. */}
							{frets
								.filter((fret) => fret >= 1)
								.map((fret) => (
									<line
										key={`wire-${fret}`}
										x1={wireX(fret)}
										x2={wireX(fret)}
										y1={stringY(STRING_COUNT - 1) - 6}
										y2={stringY(0) + 6}
										strokeWidth={1}
										shapeRendering="crispEdges"
										className="stroke-line-strong"
									/>
								))}
							{fromFret === 0 && (
								<line
									x1={wireX(0)}
									x2={wireX(0)}
									y1={stringY(STRING_COUNT - 1) - 6}
									y2={stringY(0) + 6}
									strokeWidth={3}
									shapeRendering="crispEdges"
									className="stroke-ink"
								/>
							)}

							{/* Strings: gauge thickens toward the low E. Paths, not lines,
							    so a pluck can bend the string itself instead of drawing a
							    second one over it. */}
							{strings.map((string) => (
								<path
									key={`string-${string}`}
									className="fb-string stroke-line-strong"
									data-string={string}
									d={straightString(fromFret * FRET_W, wireX(toFret), stringY(string))}
									fill="none"
									strokeWidth={STRING_STROKE[string]}
								/>
							))}

							{/* The hand position a run plays in. */}
							{highlight && (
								<g className="fb-position-group">
									<rect
										className="fb-position"
										// An SVG rect fills black by default; say so here rather than
										// trusting a stylesheet to arrive first.
										fill="none"
										x={highlight.fromFret * FRET_W}
										y={stringY(STRING_COUNT - 1) - 9}
										width={(highlight.toFret - highlight.fromFret + 1) * FRET_W}
										height={stringY(0) - stringY(STRING_COUNT - 1) + 18}
									/>
									{/* The buttons sit in the row kept above the neck, clear of the
									    frame rather than drawn on its line. */}
									{onHighlightPlay && (
										<g
											className="fb-box-btn"
											role="button"
											tabIndex={0}
											aria-label={highlightPlaying ? "Stop this position" : "Play this position"}
											onClick={onHighlightPlay}
											onKeyDown={(e) => {
												if (e.key !== "Enter" && e.key !== " ") return;
												e.preventDefault();
												onHighlightPlay();
											}}
										>
											<rect
												x={highlight.fromFret * FRET_W}
												y={-BOX_BTN_ROW}
												width={BOX_BTN}
												height={BOX_BTN}
												fill="none"
											/>
											{highlightPlaying ? (
												<Square
													x={highlight.fromFret * FRET_W + 3}
													y={-BOX_BTN_ROW + 3}
													width={8}
													height={8}
													strokeWidth={2.5}
												/>
											) : (
												<Play
													x={highlight.fromFret * FRET_W + 3}
													y={-BOX_BTN_ROW + 3}
													width={8}
													height={8}
													strokeWidth={2.5}
												/>
											)}
										</g>
									)}
									{/* Narrow and widen, next to the play button and styled with it:
									    a position's width is a thing you step, not drag over the neck. */}
									{onHighlightResize &&
										(
											[
												{ step: -1, label: "Narrow this position", at: BOX_BTN, Icon: ChevronLeft },
												{ step: 1, label: "Widen this position", at: BOX_BTN * 2, Icon: ChevronRight },
											] as const
										).map(({ step, label, at, Icon }) => {
											const stuck =
												!widthLimits ||
												(step < 0 ? highlight.toFret <= widthLimits.low : highlight.toFret >= widthLimits.high);
											return (
												<g
													key={label}
													className="fb-box-btn"
													role="button"
													tabIndex={stuck ? -1 : 0}
													aria-label={label}
													aria-disabled={stuck || undefined}
													data-stuck={stuck || undefined}
													onClick={() => {
														if (!stuck) resizeBy(step);
													}}
													onKeyDown={(e) => {
														if (stuck || (e.key !== "Enter" && e.key !== " ")) return;
														e.preventDefault();
														resizeBy(step);
													}}
												>
													<rect
														x={highlight.fromFret * FRET_W + at}
														y={-BOX_BTN_ROW}
														width={BOX_BTN}
														height={BOX_BTN}
														fill="none"
													/>
													<Icon
														x={highlight.fromFret * FRET_W + at + 3}
														y={-BOX_BTN_ROW + 3}
														width={8}
														height={8}
														strokeWidth={2.5}
													/>
												</g>
											);
										})}
									{onHighlightClear && (
										<g
											className="fb-box-btn"
											role="button"
											tabIndex={0}
											aria-label="Clear this position"
											onClick={onHighlightClear}
											onKeyDown={(e) => {
												if (e.key !== "Enter" && e.key !== " ") return;
												e.preventDefault();
												onHighlightClear();
											}}
										>
											<rect
												x={(highlight.toFret + 1) * FRET_W - BOX_BTN}
												y={-BOX_BTN_ROW}
												width={BOX_BTN}
												height={BOX_BTN}
												fill="none"
											/>
											<X
												x={(highlight.toFret + 1) * FRET_W - BOX_BTN + 3}
												y={-BOX_BTN_ROW + 3}
												width={8}
												height={8}
												strokeWidth={2.5}
											/>
										</g>
									)}
								</g>
							)}

							{/* Fret numbers under each cell. */}
							{frets.map((fret) => (
								<text
									key={`num-${fret}`}
									x={cellCenterX(fret)}
									y={NUMBERS_Y}
									textAnchor="middle"
									fontSize={9}
									className="fill-ink-faint font-mono"
								>
									{fret}
								</text>
							))}

							{/* The LED matrix: one slot per string and fret, lit by a mark. */}
							{strings.map((string) =>
								frets.map((fret) => {
									const mark = byKey.get(slotKey(string, fret));
									const emphasis: SlotEmphasis = mark?.emphasis ?? "none";
									const cx = cellCenterX(fret);
									const cy = stringY(string);
									return (
										<g
											key={slotKey(string, fret)}
											className="fb-mark"
											data-string={string}
											data-fret={fret}
											data-emphasis={emphasis}
											data-tone={mark?.tone}
											data-run={runShades.get(slotKey(string, fret))}
										>
											<circle className="fb-ring" cx={cx} cy={cy} r={RING_R} />
											<circle
												className="fb-dot"
												cx={cx}
												cy={cy}
												r={DOT_R}
												strokeWidth={1.25}
											/>
											<text
												className="fb-label font-mono"
												x={cx}
												y={cy + 3}
												textAnchor="middle"
												fontSize={8}
											>
												{mark?.label ?? ""}
											</text>
										</g>
									);
								}),
							)}

							{/* The touch layer, above the marks: an invisible hit area per
							    slot, the hover ring, and the pluck's expanding ring. Marks
							    stay pointer-inert; everything interactive lands here. */}
							{strings.map((string) =>
								frets.map((fret) => {
									const cx = cellCenterX(fret);
									const cy = stringY(string);
									return (
										<g key={slotKey(string, fret)} className="fb-slot" data-slot={slotKey(string, fret)}>
											<rect
												className="fb-hit"
												x={fret * FRET_W}
												y={cy - STRING_GAP / 2}
												width={FRET_W}
												height={STRING_GAP}
											/>
											<circle className="fb-hover" cx={cx} cy={cy} r={HOVER_R} />
											<circle className="fb-pop" cx={cx} cy={cy} r={HOVER_R} />
										</g>
									);
								}),
							)}

							{/* The capo, last so its shade dims everything behind it and its
							    grip takes pointer events before the slots underneath do. */}
							{capo > 0 && capo >= fromFret && capo <= toFret && (
								<g
									className="fb-capo"
									data-fret={capo}
									role={onCapoChange ? "slider" : undefined}
									tabIndex={onCapoChange ? 0 : undefined}
									aria-label={onCapoChange ? "Capo fret" : undefined}
									aria-valuenow={onCapoChange ? capo : undefined}
									aria-valuemin={onCapoChange ? 0 : undefined}
									aria-valuemax={onCapoChange ? capoMax : undefined}
									aria-valuetext={onCapoChange ? `Fret ${capo}` : undefined}
									onKeyDown={onCapoChange ? handleCapoKey : undefined}
								>
									{/* The capo sits in its own fret space, so that space still
									    plays — it is the new open string. Only the cells behind
									    it are out of play. */}
									<rect
										className="fb-capo-shade"
										x={fromFret * FRET_W}
										y={stringY(STRING_COUNT - 1) - 8}
										width={(capo - fromFret) * FRET_W}
										height={stringY(0) - stringY(STRING_COUNT - 1) + 16}
									/>
									<rect
										className="fb-capo-bar"
										x={wireX(capo) - CAPO_W - 2}
										y={stringY(STRING_COUNT - 1) - 8}
										width={CAPO_W}
										height={stringY(0) - stringY(STRING_COUNT - 1) + 16}
									/>
									{onCapoChange && (
										<rect
											className="fb-capo-ripple"
											x={wireX(capo) - CAPO_W - 2 - CAPO_GRIP_PAD}
											y={stringY(STRING_COUNT - 1) - 8}
											width={CAPO_W + CAPO_GRIP_PAD * 2}
											height={stringY(0) - stringY(STRING_COUNT - 1) + 16}
											fill="none"
										/>
									)}
									{onCapoChange && (
										<rect
											className="fb-capo-grip"
											x={wireX(capo) - CAPO_W - 2 - CAPO_GRIP_PAD}
											y={stringY(STRING_COUNT - 1) - 8}
											width={CAPO_W + CAPO_GRIP_PAD * 2}
											height={stringY(0) - stringY(STRING_COUNT - 1) + 16}
											onPointerDown={handleCapoDown}
											onPointerMove={handleCapoMove}
											onPointerUp={handleCapoUp}
											onPointerCancel={handleCapoUp}
										/>
									)}
								</g>
							)}
						</g>

					</svg>
				</div>
			</div>
		</div>
	);
}
