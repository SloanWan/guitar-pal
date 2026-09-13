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
 * pressing a slot reports `{ string, fret, midi }` and plays a transient pulse
 * (lit slot) or pluck (dormant slot) straight on the DOM.
 *
 * Sizing: the board scales so that `VISIBLE_FRETS` cells fill the container,
 * the size a full-width 15-fret board had, and the rest of the 22-fret neck
 * scrolls sideways under the fixed string-name column. The scale comes from
 * container-query units in CSS, so no measuring in JS; a floor keeps a phone
 * from shrinking the cells, it scrolls further instead. Geometry is uniform
 * per fret rather than the real 2^(1/12) taper so every position reads the same.
 */
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { STRING_LABELS } from "@/lib/chordVoicingToMidi";
import { relatedSlots, slotMidi, type SlotNote } from "@/lib/fretboard/positions";
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
/** Design width that `VISIBLE_FRETS` occupies, labels included. */
const DESIGN_W = LABEL_W + VISIBLE_FRETS * FRET_W + EDGE * 2;

// ── Press feedback ──────────────────────────────────────────────────────────
/** A lit slot pulses: 1 → 1.35 → 1 on the shared spring. */
const PULSE_MS = 350;
const PULSE_SCALE = 1.35;
/** A dormant slot plucks: the string rings for this long… */
const PLUCK_MS = 300;
/** …over this many cells either side of the tap… */
const PLUCK_REACH = FRET_W * 1.5;
/** …at this peak displacement, this frequency, decaying with this time constant. */
const PLUCK_AMP = 3.5;
const PLUCK_HZ = 14;
const PLUCK_TAU_S = 0.09;
/** The pluck's ring expands from the dot to this many times `HOVER_R`. */
const POP_SCALE = 1.7;
/** A pointer that travels further than this before lifting is a scroll, not a tap. */
const TAP_SLOP_PX = 8;

/**
 * A length in CSS: `units` design units at the container's scale, never below
 * the floor. `100cqw` is the width of the nearest query container, the outer
 * wrapper, so `100cqw / DESIGN_W` is the scale factor.
 */
function scaled(units: number): string {
	return `max(calc(100cqw * ${(units / DESIGN_W).toFixed(5)}), ${(units * MIN_SCALE).toFixed(2)}px)`;
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

export interface FretboardComponentProps extends FretboardProps {
	className?: string;
	/** Accessible name for the board; defaults to a plain description. */
	label?: string;
	/**
	 * A fret to bring into view, scrolled smoothly (instantly under reduced
	 * motion). Re-applied whenever the value changes, so pass a fresh object
	 * to re-scroll to the same fret.
	 */
	scrollTo?: { fret: number } | null;
	/**
	 * Called when a slot is tapped or clicked, lit or not, with what it sounds.
	 * A drag (native scroll on touch) never counts as a press.
	 */
	onSlotPress?: (slot: SlotNote) => void;
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
	marks,
	fromFret,
	toFret,
	className,
	label = "Guitar fretboard",
	scrollTo = null,
	onSlotPress,
	pressable = true,
}: FretboardComponentProps) {
	const scroller = useRef<HTMLDivElement>(null);
	const neck = useRef<SVGSVGElement>(null);
	/** Nodes currently carrying a `data-hover`, so leaving clears exactly those. */
	const hovered = useRef<SVGGElement[]>([]);
	const pending = useRef<PendingPress | null>(null);
	/** One running pluck per string, so a re-pluck restarts rather than stacks. */
	const plucks = useRef(new Map<number, number>());
	const canPress = pressable && !!onSlotPress;

	useEffect(() => {
		const el = scroller.current;
		if (!el || !scrollTo) return;
		const reduce = window.matchMedia?.(
			"(prefers-reduced-motion: reduce)",
		).matches;
		// The neck is scaled by CSS, so measure the rendered width for the ratio.
		const svg = el.firstElementChild as SVGSVGElement | null;
		const scale = svg
			? svg.getBoundingClientRect().width / Number(svg.getAttribute("width"))
			: 1;
		// Leave one cell of context to the left of the target fret.
		const left = Math.max(0, (scrollTo.fret - fromFret - 1) * FRET_W * scale);
		el.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
	}, [scrollTo, fromFret]);

	// Constraint 4: a pluck still in flight on unmount must not touch a dead node.
	useEffect(() => {
		const running = plucks.current;
		return () => {
			for (const id of running.values()) cancelAnimationFrame(id);
			running.clear();
		};
	}, []);

	// ── Hover: ring the unisons and octaves, on the DOM, no re-render ──────────
	const clearHover = useCallback(() => {
		for (const el of hovered.current) delete el.dataset.hover;
		hovered.current = [];
	}, []);

	const handlePointerOver = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			if (e.pointerType === "touch") return;
			const slot = slotFromTarget(e.target);
			if (!slot) return;
			const board = neck.current;
			if (!board) return;
			clearHover();
			const set = (el: SVGGElement | null, role: HoverRole) => {
				if (!el) return;
				el.dataset.hover = role;
				hovered.current.push(el);
			};
			set(slot.el, "self");
			const { unison, octave } = relatedSlots(slot.string, slot.fret, { fromFret, toFret });
			for (const pos of unison) set(board.querySelector(`[data-slot="${slotKey(pos.string, pos.fret)}"]`), "unison");
			for (const pos of octave) set(board.querySelector(`[data-slot="${slotKey(pos.string, pos.fret)}"]`), "octave");
		},
		[clearHover, fromFret, toFret],
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

	const pluck = useCallback(
		(slotEl: SVGGElement, string: number, fret: number) => {
			const board = neck.current;
			if (!board) return;
			const pop = slotEl.querySelector(".fb-pop");
			if (pop && canAnimate(pop)) {
				pop.animate(
					[
						{ transform: "scale(0.5)", opacity: 0.9 },
						{ transform: `scale(${POP_SCALE})`, opacity: 0 },
					],
					{ duration: PLUCK_MS, easing: "ease-out" },
				);
			}
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

	const handlePointerDown = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
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
		[canPress],
	);

	const handlePointerUp = useCallback(
		(e: ReactPointerEvent<SVGSVGElement>) => {
			const press = pending.current;
			pending.current = null;
			if (!press || !canPress || press.pointerId !== e.pointerId) return;
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP_PX) return;
			const slot = slotFromTarget(e.target);
			if (!slot || slotKey(slot.string, slot.fret) !== press.key) return;

			onSlotPress?.({ string: slot.string, fret: slot.fret, midi: slotMidi(slot.string, slot.fret) });

			if (prefersReducedMotion()) return;
			const mark = neck.current?.querySelector<SVGGElement>(
				`.fb-mark[data-string="${slot.string}"][data-fret="${slot.fret}"]`,
			);
			const lit = !!mark && mark.dataset.emphasis !== "none";
			if (lit) pulse(slot.string, slot.fret);
			else pluck(slot.el, slot.string, slot.fret);
		},
		[canPress, onSlotPress, pulse, pluck],
	);

	const cancelPress = useCallback(() => {
		pending.current = null;
	}, []);

	const byKey = new Map<string, FretMark>();
	for (const mark of marks) byKey.set(slotKey(mark.string, mark.fret), mark);

	const cells = toFret - fromFret + 1;
	const neckW = cells * FRET_W + EDGE * 2;
	const frets = Array.from({ length: cells }, (_, i) => fromFret + i);
	const strings = Array.from({ length: STRING_COUNT }, (_, string) => string);

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
					viewBox={`0 0 ${LABEL_W} ${H}`}
					width={LABEL_W}
					height={H}
					className="shrink-0"
					style={{ width: scaled(LABEL_W), height: scaled(H) }}
					aria-hidden="true"
				>
					{strings.map((string) => (
						<text
							key={string}
							x={LABEL_W - 8}
							y={stringY(string) + 3}
							textAnchor="end"
							fontSize={9}
							className="fill-ink-faint font-mono"
						>
							{STRING_LABELS[string]}
						</text>
					))}
				</svg>

				<div
					ref={scroller}
					className="fp-thin-scroll min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
				>
					<svg
						ref={neck}
						viewBox={`0 0 ${neckW} ${H}`}
						width={neckW}
						height={H}
						className="block max-w-none"
						style={{ width: scaled(neckW), height: scaled(H) }}
						data-from-fret={fromFret}
						data-to-fret={toFret}
						data-pressable={canPress || undefined}
						aria-disabled={onSlotPress && !pressable ? true : undefined}
						onPointerOver={handlePointerOver}
						onPointerOut={handlePointerOut}
						onPointerDown={handlePointerDown}
						onPointerUp={handlePointerUp}
						onPointerCancel={cancelPress}
					>
						<g
							className="fb-neck"
							style={{ transform: `translateX(${EDGE - fromFret * FRET_W}px)` }}
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
						</g>
					</svg>
				</div>
			</div>
		</div>
	);
}
