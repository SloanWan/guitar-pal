import { useCallback, useEffect, useRef, useState } from "react";
import {
	computeMeasureBoundaries,
	findSlotStartTime,
	fingerpickPatternToScheduleEvents,
	getProgressAtTime,
	type MeasureBoundary,
	type ScheduleEvent,
} from "@/lib/fingerpickScheduler";
import { mapOriginToExpandedIndex, type ExpandedPattern } from "@/lib/fingerpickRepeats";
import type { MeasureRow } from "./fingerpickLayout";

// Higher = tighter/snappier following, lower = smoother/more lag.
// At 20, steady-state lag behind a constant-velocity target is ~v/20 px/s — barely
// perceptible on dense sixteenth-note runs (~8 px) and invisible on slower material.
const CURSOR_LAMBDA = 20;

export interface PlaybackProgress {
	/** Seconds into the current pass. */
	elapsed: number;
	passIndex: number;
}

export interface PlaybackCursorArgs {
	/** The scrolling tab viewer the overlays are positioned inside. */
	tabViewerRef: React.RefObject<HTMLDivElement | null>;
	/** Repeats flattened into the linear playback timeline. */
	expanded: ExpandedPattern;
	bpm: number;
	/** The rendered stave rows, for row transitions and auto-scroll. */
	rows: MeasureRow[];
	isPlaying: boolean;
	/** The audio engine's synchronous progress getter; any version of it is correct. */
	getPlaybackProgress: () => PlaybackProgress | null;
}

export interface PlaybackCursor {
	/** The playhead line. */
	cursorRef: React.RefObject<HTMLDivElement | null>;
	/** The measure background highlight. */
	measureHighlightRef: React.RefObject<HTMLDivElement | null>;
	/** One DOM ref per row wrapper div (indexed to match `rows`). */
	rowRefs: React.RefObject<(HTMLDivElement | null)[]>;
	/**
	 * Put the overlays back on a measure's first note (the pattern's first by
	 * default; a loop region's first when one is playing).
	 */
	resetCursor: (measureIndex?: number) => void;
	/**
	 * Snap the overlays directly to a note element. Used on seek (a discrete
	 * user-initiated jump) — bypasses the exponential smoothing.
	 */
	snapCursorToNote: (noteEl: SVGElement, measureIndex: number) => void;
	/** Seconds into the pass at which a (rendered) measure's slot starts. */
	startOffsetFor: (seek: { measureIndex: number; slotIndex: number }) => number;
	/** A rendered measure's index → its first occurrence on the expanded timeline. */
	toExpandedMeasureIndex: (measureIndex: number) => number;
}

// Position both overlays at a measure's start (the pattern's start by default).
// The measure may open with silence: empty slots render as zero-width
// GhostNotes that emit NO SVG element, so slot 0 can be absent. Fall back to
// the first note element that actually exists for vertical positioning, and
// park the cursor at the measure's left edge so playback drifts rightward from
// there instead of snapping. Returns the cursor x, or null while the stave DOM
// is not there yet (TabStaveRow renders asynchronously via ResizeObserver + rAF).
function placeAtMeasureStart(
	container: HTMLDivElement,
	playhead: HTMLDivElement,
	measureHL: HTMLDivElement | null,
	measureIndex: number,
): number | null {
	const slot0El = container.querySelector<SVGElement>(
		`[data-measure-index="${measureIndex}"][data-slot-index="0"]`,
	);
	const anchorEl =
		slot0El ??
		container.querySelector<SVGElement>(`[data-measure-index="${measureIndex}"][data-slot-index]`);
	const svgEl = anchorEl?.closest("svg");
	const stavesvg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
	if (!anchorEl || !svgEl || !stavesvg) return null;
	const containerRect = container.getBoundingClientRect();
	const svgRect = svgEl.getBoundingClientRect();
	const staveSvgRect = stavesvg.getBoundingClientRect();
	const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
	const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
	// x0 = slot 0's note center when it exists; otherwise the measure's left
	// edge (matches the rest-path's snapX so the drift begins seamlessly).
	let x0: number;
	if (slot0El) {
		const noteRect = slot0El.getBoundingClientRect();
		x0 = noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
	} else {
		x0 = staveSvgRect.left - containerRect.left + sx + container.scrollLeft;
	}
	const top = svgRect.top - containerRect.top + container.scrollTop;

	playhead.style.top = `${top}px`;
	playhead.style.height = `${svgRect.height}px`;
	playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;

	if (measureHL) {
		measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
		measureHL.style.width = `${sw}px`;
		measureHL.style.top = `${top}px`;
		measureHL.style.height = `${svgRect.height}px`;
	}
	return x0;
}

/**
 * The playhead and measure highlight over the tab, driven by the audio engine's
 * progress. All cursor updates go through direct DOM mutation — no React
 * setState — from a RAF loop that runs only while playing. Between notes the
 * cursor interpolates by time; a rest at a measure's start drifts from the
 * measure's left edge; a row change scrolls the viewer to the new row.
 */
export function usePlaybackCursor({
	tabViewerRef,
	expanded,
	bpm,
	rows,
	isPlaying,
	getPlaybackProgress,
}: PlaybackCursorArgs): PlaybackCursor {
	const cursorRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | undefined>(undefined);
	// Tracks the last row that was scrolled into view; -1 = none yet.
	const lastScrolledRowRef = useRef(-1);
	// Mirrors `rows` for the RAF closure without needing it as a dep (synced below).
	const rowsRef = useRef<MeasureRow[]>([]);
	// One DOM ref per row wrapper div (indexed to match `rows`).
	const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
	// Always-current getter: `getPlaybackProgress` is recreated each render but all
	// versions close over the same audio engine refs, so any version is correct.
	const playbackGetterRef = useRef(getPlaybackProgress);
	// Measure background highlight overlay.
	const measureHighlightRef = useRef<HTMLDivElement>(null);
	// Tracks the last measure index the highlight was positioned at; -1 = none yet.
	const lastMeasureIdxRef = useRef(-1);
	// Schedule events mirroring the audio engine's event list — provides per-note
	// t0/t1 timestamps for the note-to-note interpolation in the RAF loop.
	const scheduleEventsRef = useRef<ScheduleEvent[]>([]);
	// Measure start times for boundary-aware progress tracking (rest-at-start fix).
	const measureBoundariesRef = useRef<MeasureBoundary[]>([]);
	// expanded-measure-index -> original rendered-measure-index, kept in sync with
	// scheduleEventsRef so the RAF cursor and click-to-seek can bridge the two index spaces.
	const originMeasureIndicesRef = useRef<number[]>([]);
	// Exponential-smoothed cursor x — chases targetX every frame so velocity changes
	// at note boundaries don't cause visible stutter.
	const renderedXRef = useRef(0);
	// Previous rAF timestamp; 0 = first frame of new playback (snap instead of smooth).
	const prevTimestampRef = useRef(0);
	// Tracks the loop pass index so a pass boundary triggers a cursor snap rather
	// than a slow exponential chase from the last note back to the first.
	const lastPassIndexRef = useRef(0);
	// Incremented by resetCursor; triggers the cursor-reset effect below, which
	// places the overlays on resetMeasureRef's first note.
	const [cursorResetTick, setCursorResetTick] = useState(0);
	const resetMeasureRef = useRef(0);
	const resetCursor = useCallback((measureIndex: number = 0) => {
		resetMeasureRef.current = measureIndex;
		setCursorResetTick((t) => t + 1);
	}, []);

	// Mirror the audio engine's event list so the RAF loop has per-note timestamps
	// for interpolation. Recomputed whenever BPM or pattern changes.
	useEffect(() => {
		scheduleEventsRef.current = fingerpickPatternToScheduleEvents(expanded.pattern, bpm);
		measureBoundariesRef.current = computeMeasureBoundaries(expanded.pattern, bpm);
		originMeasureIndicesRef.current = expanded.originMeasureIndices;
	}, [expanded, bpm]);

	// Keep refs in sync with the latest render values so the RAF closure never goes stale.
	// useEffect (not inline assignment) satisfies react-hooks/refs; the one-frame lag
	// is harmless — getPlaybackProgress reads audio engine refs (never React state), and
	// rows changes only on resize/pattern edit, not mid-playback.
	useEffect(() => {
		rowsRef.current = rows;
	}, [rows]);
	useEffect(() => {
		playbackGetterRef.current = getPlaybackProgress;
	}, [getPlaybackProgress]);

	// Position cursor and measure highlight at the very first note as soon as the
	// SVG data attributes are available (TabStaveRow renders asynchronously via
	// ResizeObserver + rAF, so we retry each frame until the DOM is ready).
	useEffect(() => {
		let rafId: number;
		function tryInitialPosition() {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafId = requestAnimationFrame(tryInitialPosition);
				return;
			}
			if (placeAtMeasureStart(container, playhead, measureHL, 0) === null) {
				rafId = requestAnimationFrame(tryInitialPosition);
				return;
			}
			playhead.style.display = "block";
			if (measureHL) measureHL.style.display = "block";
		}
		rafId = requestAnimationFrame(tryInitialPosition);
		return () => cancelAnimationFrame(rafId);
	}, [tabViewerRef]);

	// When Stop is pressed, cursorResetTick increments and this effect re-runs the
	// same rAF retry loop used on mount, repositioning to the requested measure's
	// slot 0 (the pattern's first measure, or a loop region's).
	// cursorResetTick starts at 0 (mount); the guard skips the initial run so the
	// mount effect handles first positioning without a double-trigger.
	useEffect(() => {
		if (cursorResetTick === 0) return;
		let rafId: number;
		function resetToInitial() {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafId = requestAnimationFrame(resetToInitial);
				return;
			}
			const x0 = placeAtMeasureStart(container, playhead, measureHL, resetMeasureRef.current);
			if (x0 === null) {
				rafId = requestAnimationFrame(resetToInitial);
				return;
			}
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;
		}
		rafId = requestAnimationFrame(resetToInitial);
		return () => cancelAnimationFrame(rafId);
	}, [cursorResetTick, tabViewerRef]);

	// Snaps the cursor and measure-highlight overlays directly to a note element.
	const snapCursorToNote = useCallback(
		(noteEl: SVGElement, measureIndex: number): void => {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) return;

			const svgEl = noteEl.closest<SVGElement>("svg");
			if (!svgEl) return;

			const containerRect = container.getBoundingClientRect();
			const noteRect = noteEl.getBoundingClientRect();
			const svgRect = svgEl.getBoundingClientRect();

			const x0 = noteRect.left - containerRect.left + noteRect.width / 2 + container.scrollLeft;
			const top = svgRect.top - containerRect.top + container.scrollTop;

			// Snap rendered position so the next RAF tick also snaps (prevTimestampRef = 0
			// is the existing signal for "first frame of playback — snap, don't chase").
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;

			playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
			playhead.style.top = `${top}px`;
			playhead.style.height = `${svgRect.height}px`;
			playhead.style.display = "block";

			if (measureHL) {
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
					const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
					measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
					measureHL.style.width = `${sw}px`;
					measureHL.style.top = `${top}px`;
					measureHL.style.height = `${svgRect.height}px`;
					measureHL.style.display = "block";
				}
			}

			// Prevent the RAF loop from re-triggering row/measure transition logic on
			// the very next tick (which would redundantly reposition the overlays).
			lastMeasureIdxRef.current = measureIndex;
			const rowIdx = rowsRef.current.findIndex((row) => {
				const s = row.startMeasureNumber - 1;
				return measureIndex >= s && measureIndex < s + row.measures.length;
			});
			if (rowIdx !== -1) lastScrolledRowRef.current = rowIdx;
		},
		[tabViewerRef],
	);

	const toExpandedMeasureIndex = useCallback(
		(measureIndex: number): number =>
			mapOriginToExpandedIndex(originMeasureIndicesRef.current, measureIndex),
		[],
	);

	// A seek holds an ORIGINAL measure index (from a click); map it to its first
	// occurrence in the expanded timeline before locating the slot's start time.
	const startOffsetFor = useCallback(
		(seek: { measureIndex: number; slotIndex: number }): number =>
			findSlotStartTime(
				scheduleEventsRef.current,
				mapOriginToExpandedIndex(originMeasureIndicesRef.current, seek.measureIndex),
				seek.slotIndex,
			),
		[],
	);

	// ── Playback cursor RAF loop ─────────────────────────────────────────────
	// Starts when isPlaying becomes true; stopped on pause/stop or unmount.
	useEffect(() => {
		if (!isPlaying) {
			if (rafRef.current !== undefined) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = undefined;
			}
			// Reset guards so the next play re-triggers row/measure positioning and
			// snaps renderedX to targetX on the first frame (avoids catch-up slide).
			lastScrolledRowRef.current = -1;
			lastMeasureIdxRef.current = -1;
			prevTimestampRef.current = 0;
			lastPassIndexRef.current = 0;
			// Pause: cursor stays frozen at current position.
			// Stop: handled by the cursorResetTick effect above.
			return;
		}

		function tick(timestamp: number) {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !container) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const progress = playbackGetterRef.current();
			if (!progress) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const { elapsed, passIndex } = progress;
			const position = getProgressAtTime(
				scheduleEventsRef.current,
				elapsed,
				measureBoundariesRef.current,
			);
			if (!position) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}
			// `position` is on the EXPANDED playback timeline (repeats flattened). DOM staves,
			// rows and the highlight are rendered from the COMPACT pattern, so `measureIndex`
			// maps back to the original rendered measure and drives every DOM/row lookup. The
			// few event/boundary comparisons below stay on `expandedMeasureIndex`, since
			// scheduleEventsRef / measureBoundariesRef are built from the expanded pattern.
			const { measureIndex: expandedMeasureIndex, slotIndex } = position;
			const measureIndex =
				originMeasureIndicesRef.current[expandedMeasureIndex] ?? expandedMeasureIndex;
			const events = scheduleEventsRef.current;
			const currentRows = rowsRef.current;

			// Loop pass boundary: snap cursor instead of smoothly chasing from the
			// last note of the previous pass back to the first note of the new pass.
			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
			}

			const containerRect = container.getBoundingClientRect();

			const noteEl = container.querySelector<SVGElement>(
				`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
			);

			if (!noteEl) {
				// Slot has no DOM element (rest/GhostNote) — drift cursor from measure left
				// edge toward the first non-rest note's position over the rest's duration.
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
					);
					const snapX =
						staveSvgRect.left - containerRect.left + sx + container.scrollLeft;

					const firstNonRestEvent = events.find(
						(e) => e.measureIndex === expandedMeasureIndex,
					);
					const measureBoundary = measureBoundariesRef.current.find(
						(b) => b.measureIndex === expandedMeasureIndex,
					);

					let driftX = snapX;
					let didDrift = false;
					if (firstNonRestEvent) {
						const firstNonRestEl = container.querySelector<SVGElement>(
							`[data-measure-index="${measureIndex}"][data-slot-index="${firstNonRestEvent.slotIndex}"]`,
						);
						if (firstNonRestEl) {
							const firstNonRestRect = firstNonRestEl.getBoundingClientRect();
							const x1 =
								firstNonRestRect.left -
								containerRect.left +
								firstNonRestRect.width / 2 +
								container.scrollLeft;
							const measureStart =
								measureBoundary?.startTime ?? firstNonRestEvent.time;
							const restDuration = firstNonRestEvent.time - measureStart;
							const restElapsed = elapsed - measureStart;
							const frac =
								restDuration > 0
									? Math.max(0, Math.min(1, restElapsed / restDuration))
									: 0;
							driftX = snapX + (x1 - snapX) * frac;
							didDrift = true;
						}
					}

					if (didDrift) {
						const prevTime = prevTimestampRef.current;
						if (prevTime === 0) {
							renderedXRef.current = driftX;
						} else {
							const dt = (timestamp - prevTime) / 1000;
							renderedXRef.current +=
								(driftX - renderedXRef.current) *
								(1 - Math.exp(-CURSOR_LAMBDA * dt));
						}
						prevTimestampRef.current = timestamp;
					} else {
						renderedXRef.current = snapX;
						prevTimestampRef.current = 0;
					}
					playhead.style.transform = `translateX(${Math.round(renderedXRef.current - 3)}px)`;

					if (measureIndex !== lastMeasureIdxRef.current) {
						lastMeasureIdxRef.current = measureIndex;
						if (measureHL) {
							const sw = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
							);
							measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
							measureHL.style.width = `${sw}px`;
							measureHL.style.display = "block";
						}
						const rowIdx = currentRows.findIndex((row) => {
							const s = row.startMeasureNumber - 1;
							return measureIndex >= s && measureIndex < s + row.measures.length;
						});
						if (rowIdx !== -1 && rowIdx !== lastScrolledRowRef.current) {
							const svgRect = stavesvg.getBoundingClientRect();
							const top = svgRect.top - containerRect.top + container.scrollTop;
							playhead.style.top = `${top}px`;
							playhead.style.height = `${svgRect.height}px`;
							if (measureHL) {
								measureHL.style.top = `${top}px`;
								measureHL.style.height = `${svgRect.height}px`;
							}
							lastScrolledRowRef.current = rowIdx;
							rowRefs.current[rowIdx]?.scrollIntoView({
								behavior: "smooth",
								block: "center",
							});
						}
					}
				}
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const noteRect = noteEl.getBoundingClientRect();
			const x0 = noteRect.left - containerRect.left + noteRect.width / 2;

			// A rolled slot emits one event PER STRING — all sharing this (measureIndex,
			// slotIndex) but staggered in time. Interpolate between SLOTS, not events:
			// t0 is the slot's earliest event time; the "next" note is the next DISTINCT
			// slot, whose start is its own earliest event time. Using the minimum (not the
			// first array match) is required because the last-on-beat anchor produces
			// negative offsets, so same-slot events aren't guaranteed to be in time order.
			let t0 = Infinity;
			let slotDuration = 0;
			for (const e of events) {
				if (e.measureIndex === expandedMeasureIndex && e.slotIndex === slotIndex) {
					if (e.time < t0) t0 = e.time;
					slotDuration = e.duration;
				}
			}
			if (t0 === Infinity) t0 = elapsed;

			// First event, in time order, that belongs to a DIFFERENT slot (skips the
			// current rolled slot's siblings) — identifies the next distinct slot.
			const nextSlotEvent = events.find(
				(e) =>
					e.time > t0 &&
					(e.measureIndex !== expandedMeasureIndex || e.slotIndex !== slotIndex),
			);
			// t1 = the earliest event time of that next distinct slot.
			let t1 = Infinity;
			if (nextSlotEvent) {
				for (const e of events) {
					if (
						e.measureIndex === nextSlotEvent.measureIndex &&
						e.slotIndex === nextSlotEvent.slotIndex &&
						e.time < t1
					) {
						t1 = e.time;
					}
				}
			}

			// True when the next distinct slot is in a later measure (or there is none) —
			// drift to the measure's right edge rather than interpolating toward the next note.
			const isLastNoteInMeasure =
				!nextSlotEvent || nextSlotEvent.measureIndex !== expandedMeasureIndex;

			let targetX = x0;
			if (isLastNoteInMeasure) {
				const noteDuration = slotDuration > 0 ? slotDuration : 1;
				const frac = Math.max(0, Math.min(1, (elapsed - t0) / noteDuration));
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
					);
					const sw = parseFloat(
						stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
					);
					const measureRight = staveSvgRect.left - containerRect.left + sx + sw;
					targetX = x0 + (measureRight - x0) * frac;
				}
			} else if (nextSlotEvent) {
				// Interpolate between consecutive slots in the same measure.
				// When x1 < x0 the next note is on a different row; substitute the current
				// measure's right edge as x1 so the cursor keeps drifting rightward.
				const nextDomMeasureIndex =
					originMeasureIndicesRef.current[nextSlotEvent.measureIndex] ??
					nextSlotEvent.measureIndex;
				const nextEl = container.querySelector<SVGElement>(
					`[data-measure-index="${nextDomMeasureIndex}"][data-slot-index="${nextSlotEvent.slotIndex}"]`,
				);
				if (nextEl) {
					const nRect = nextEl.getBoundingClientRect();
					const x1 = nRect.left - containerRect.left + nRect.width / 2;
					const denom = t1 - t0;
					const frac = denom > 0 ? Math.max(0, Math.min(1, (elapsed - t0) / denom)) : 0;
					if (x1 >= x0) {
						targetX = x0 + (x1 - x0) * frac;
					} else {
						// next note is on a different row — drift to measure right edge
						const stavesvg = container.querySelector<SVGElement>(
							`svg[data-stave-${measureIndex}-x]`,
						);
						if (stavesvg) {
							const staveSvgRect = stavesvg.getBoundingClientRect();
							const sx = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
							);
							const sw = parseFloat(
								stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
							);
							const measureRight = staveSvgRect.left - containerRect.left + sx + sw;
							targetX = x0 + (measureRight - x0) * frac;
						}
					}
				}
			}

			// Exponential smoothing: rendered position chases target continuously so
			// per-note velocity changes never cause a visible decelerate/accelerate stutter.
			// First frame of a new playback session: snap directly to avoid a catch-up slide.
			const prevTime = prevTimestampRef.current;
			if (prevTime === 0) {
				renderedXRef.current = targetX;
			} else {
				const dt = (timestamp - prevTime) / 1000;
				renderedXRef.current +=
					(targetX - renderedXRef.current) * (1 - Math.exp(-CURSOR_LAMBDA * dt));
			}
			prevTimestampRef.current = timestamp;

			playhead.style.transform = `translateX(${Math.round(renderedXRef.current - 3)}px)`;

			// Row transition: update vertical position for both overlays and auto-scroll.
			const rowIdx = currentRows.findIndex((row) => {
				const s = row.startMeasureNumber - 1;
				return measureIndex >= s && measureIndex < s + row.measures.length;
			});
			if (rowIdx !== -1 && rowIdx !== lastScrolledRowRef.current) {
				const svgEl = noteEl.closest("svg");
				const svgRect = svgEl?.getBoundingClientRect();
				if (svgRect) {
					const top = svgRect.top - containerRect.top + container.scrollTop;
					playhead.style.top = `${top}px`;
					playhead.style.height = `${svgRect.height}px`;
					if (measureHL) {
						measureHL.style.top = `${top}px`;
						measureHL.style.height = `${svgRect.height}px`;
					}
				}
				lastScrolledRowRef.current = rowIdx;
				prevTimestampRef.current = 0;
				rowRefs.current[rowIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
			}

			// Measure transition: update the measure background highlight.
			if (measureIndex !== lastMeasureIdxRef.current) {
				lastMeasureIdxRef.current = measureIndex;
				if (measureHL) {
					const stavesvg = container.querySelector<SVGElement>(
						`svg[data-stave-${measureIndex}-x]`,
					);
					if (stavesvg) {
						const svgRect = stavesvg.getBoundingClientRect();
						const sx = parseFloat(
							stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0",
						);
						const sw = parseFloat(
							stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0",
						);
						measureHL.style.left = `${svgRect.left - containerRect.left + sx}px`;
						measureHL.style.width = `${sw}px`;
						measureHL.style.display = "block";
					}
				}
			}

			rafRef.current = requestAnimationFrame(tick);
		}

		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== undefined) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = undefined;
			}
		};
	}, [isPlaying, tabViewerRef]);

	return {
		cursorRef,
		measureHighlightRef,
		rowRefs,
		resetCursor,
		snapCursorToNote,
		startOffsetFor,
		toExpandedMeasureIndex,
	};
}
