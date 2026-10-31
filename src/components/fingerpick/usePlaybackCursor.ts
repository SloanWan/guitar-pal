import { useCallback, useEffect, useRef, useState } from "react";
import {
	computeMeasureBoundaries,
	computeSlotStarts,
	findSlotStartTime,
	fingerpickPatternToScheduleEvents,
	getProgressAtTime,
	getTotalPatternDuration,
	type MeasureBoundary,
	type ScheduleEvent,
	type SlotStart,
} from "@/lib/fingerpickScheduler";
import { mapOriginToExpandedIndex, type ExpandedPattern } from "@/lib/fingerpickRepeats";
import { leadInX } from "@/lib/playheadLeadIn";
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
	/** The box the overlays are positioned inside (position: relative). */
	tabViewerRef: React.RefObject<HTMLDivElement | null>;
	/** Repeats flattened into the linear playback timeline. */
	expanded: ExpandedPattern;
	bpm: number;
	/** The rendered stave rows, for row transitions and scrolling them into view. */
	rows: MeasureRow[];
	isPlaying: boolean;
	/** The audio engine's synchronous progress getter; any version of it is correct. */
	getPlaybackProgress: () => PlaybackProgress | null;
	/** The rendered measure the playhead moved into: on a measure change, a seek and a reset. */
	onMeasure?: (measureIndex: number) => void;
	/** A new loop pass began (counted from 0 since play). */
	onPass?: (passIndex: number) => void;
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

/** A rendered measure's note area and its row, in the viewer's coordinates. */
interface MeasureBox {
	left: number;
	width: number;
	top: number;
	height: number;
}

/**
 * Where a measure's notes sit: TabStaveRow writes each measure's note-area start
 * and width onto its row's SVG (`data-stave-<i>-x` / `-w`) once drawn. Null while
 * the row is not drawn yet (it renders on its own frame).
 */
function measureBox(container: HTMLElement, containerRect: DOMRect, measureIndex: number): MeasureBox | null {
	const svg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
	if (!svg) return null;
	const rect = svg.getBoundingClientRect();
	return {
		left: rect.left - containerRect.left + Number(svg.getAttribute(`data-stave-${measureIndex}-x`)),
		width: Number(svg.getAttribute(`data-stave-${measureIndex}-w`)),
		top: rect.top - containerRect.top + container.scrollTop,
		height: rect.height,
	};
}

function noteAt(container: HTMLElement, measureIndex: number, slotIndex: number): SVGElement | null {
	return container.querySelector<SVGElement>(`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`);
}

/** A note's centre line, in the viewer's coordinates. */
function noteX(el: Element, containerRect: DOMRect): number {
	const rect = el.getBoundingClientRect();
	return rect.left - containerRect.left + rect.width / 2;
}

function rowOf(rows: readonly MeasureRow[], measureIndex: number): number {
	return rows.findIndex((row) => {
		const first = row.startMeasureNumber - 1;
		return measureIndex >= first && measureIndex < first + row.measures.length;
	});
}

function setRow(el: HTMLElement, box: MeasureBox): void {
	el.style.top = `${box.top}px`;
	el.style.height = `${box.height}px`;
}

function setPlayheadX(playhead: HTMLElement, x: number): void {
	playhead.style.transform = `translateX(${Math.round(x - 3)}px)`;
}

function showMeasure(highlight: HTMLElement, box: MeasureBox): void {
	highlight.style.left = `${box.left}px`;
	highlight.style.width = `${box.width}px`;
	highlight.style.display = "block";
}

/** The expanded timeline's slots, read by measure, for a measure's opening silence. */
interface MeasureTimes {
	slots: SlotStart[];
	end: number;
}

const slotKey = (measureIndex: number, slotIndex: number) => `${measureIndex}:${slotIndex}`;

/**
 * The playhead and measure highlight over the tab, driven by the audio engine's
 * progress. All cursor updates go through direct DOM mutation — no React
 * setState — from a RAF loop that runs only while playing. Between notes the
 * cursor interpolates by time; a measure's opening silence — rests drawn or
 * slots left empty — is walked by time (`leadInX`); a row change scrolls the new
 * row into view.
 */
export function usePlaybackCursor({
	tabViewerRef,
	expanded,
	bpm,
	rows,
	isPlaying,
	getPlaybackProgress,
	onMeasure,
	onPass,
}: PlaybackCursorArgs): PlaybackCursor {
	const cursorRef = useRef<HTMLDivElement>(null);
	const measureHighlightRef = useRef<HTMLDivElement>(null);
	// One DOM ref per row wrapper div (indexed to match `rows`).
	const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
	// The last row scrolled into view and the last measure highlighted; -1 = none yet.
	const lastScrolledRowRef = useRef(-1);
	const lastMeasureIdxRef = useRef(-1);
	// Mirrors of render values for the RAF closure (synced below).
	const rowsRef = useRef<MeasureRow[]>([]);
	const playbackGetterRef = useRef(getPlaybackProgress);
	const onMeasureRef = useRef(onMeasure);
	const onPassRef = useRef(onPass);
	// Schedule events mirroring the audio engine's event list — per-note t0/t1 for
	// the note-to-note interpolation — and the measures' start times (rest-at-start).
	const scheduleEventsRef = useRef<ScheduleEvent[]>([]);
	const measureBoundariesRef = useRef<MeasureBoundary[]>([]);
	// Every slot's start by expanded measure, and when each struck slot first sounds,
	// so a measure that opens with silence is walked by time, not by events.
	const measureTimesRef = useRef<MeasureTimes[]>([]);
	const soundsAtRef = useRef<Map<string, number>>(new Map());
	// expanded-measure-index -> rendered-measure-index, kept in sync with the events
	// so the RAF cursor and click-to-seek can bridge the two index spaces.
	const originMeasureIndicesRef = useRef<number[]>([]);
	// Exponential-smoothed cursor x — chases its target every frame so velocity
	// changes at note boundaries don't cause visible stutter.
	const renderedXRef = useRef(0);
	// Previous rAF timestamp; 0 = snap on the next frame instead of smoothing.
	const prevTimestampRef = useRef(0);
	// A new loop pass snaps the cursor rather than chasing back from the last note.
	const lastPassIndexRef = useRef(0);
	// Incremented by resetCursor; the placement effect below puts the overlays on
	// resetMeasureRef's first note (tick 0 is the mount).
	const [cursorResetTick, setCursorResetTick] = useState(0);
	const resetMeasureRef = useRef(0);
	const resetCursor = useCallback((measureIndex: number = 0) => {
		resetMeasureRef.current = measureIndex;
		setCursorResetTick((t) => t + 1);
	}, []);

	useEffect(() => {
		const events = fingerpickPatternToScheduleEvents(expanded.pattern, bpm);
		const boundaries = computeMeasureBoundaries(expanded.pattern, bpm);
		const total = getTotalPatternDuration(expanded.pattern, bpm);
		const measureTimes: MeasureTimes[] = boundaries.map((_, i) => ({
			slots: [],
			end: boundaries[i + 1]?.startTime ?? total,
		}));
		for (const start of computeSlotStarts(expanded.pattern, bpm)) measureTimes[start.measureIndex]?.slots.push(start);
		const soundsAt = new Map<string, number>();
		for (const e of events) {
			const key = slotKey(e.measureIndex, e.slotIndex);
			const at = soundsAt.get(key);
			if (at === undefined || e.time < at) soundsAt.set(key, e.time);
		}
		scheduleEventsRef.current = events;
		measureBoundariesRef.current = boundaries;
		measureTimesRef.current = measureTimes;
		soundsAtRef.current = soundsAt;
		originMeasureIndicesRef.current = expanded.originMeasureIndices;
	}, [expanded, bpm]);

	// useEffect (not inline assignment) satisfies react-hooks/refs; the one-frame
	// lag is harmless — rows change only on resize or an edit, not mid-playback.
	useEffect(() => {
		rowsRef.current = rows;
		playbackGetterRef.current = getPlaybackProgress;
		onMeasureRef.current = onMeasure;
		onPassRef.current = onPass;
	});

	// Put the overlays on a measure's start, retrying each frame until its row is
	// drawn (TabStaveRow renders on its own frame). The measure may open with
	// silence: an empty slot draws nothing, so the playhead parks at the measure's
	// left edge and playback drifts it rightward from there.
	useEffect(() => {
		let rafId = 0;
		function place() {
			const playhead = cursorRef.current;
			const highlight = measureHighlightRef.current;
			const container = tabViewerRef.current;
			const measureIndex = resetMeasureRef.current;
			const containerRect = container?.getBoundingClientRect();
			const box = container && containerRect ? measureBox(container, containerRect, measureIndex) : null;
			if (!playhead || !highlight || !container || !containerRect || !box) {
				rafId = requestAnimationFrame(place);
				return;
			}
			const slot0 = noteAt(container, measureIndex, 0);
			const x0 = slot0 ? noteX(slot0, containerRect) : box.left;
			setRow(playhead, box);
			setPlayheadX(playhead, x0);
			playhead.style.display = "block";
			setRow(highlight, box);
			showMeasure(highlight, box);
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;
			onMeasureRef.current?.(measureIndex);
		}
		rafId = requestAnimationFrame(place);
		return () => cancelAnimationFrame(rafId);
	}, [cursorResetTick, tabViewerRef]);

	const snapCursorToNote = useCallback(
		(noteEl: SVGElement, measureIndex: number): void => {
			const playhead = cursorRef.current;
			const highlight = measureHighlightRef.current;
			const container = tabViewerRef.current;
			if (!playhead || !highlight || !container) return;
			const containerRect = container.getBoundingClientRect();
			// The note is drawn, so its row is.
			const box = measureBox(container, containerRect, measureIndex)!;
			const x0 = noteX(noteEl, containerRect);
			// The next RAF tick snaps too (prevTimestamp 0) rather than chasing.
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;
			setRow(playhead, box);
			setPlayheadX(playhead, x0);
			playhead.style.display = "block";
			setRow(highlight, box);
			showMeasure(highlight, box);
			// The RAF loop must not take this for a transition and reposition again.
			lastMeasureIdxRef.current = measureIndex;
			const row = rowOf(rowsRef.current, measureIndex);
			if (row !== -1) lastScrolledRowRef.current = row;
			onMeasureRef.current?.(measureIndex);
		},
		[tabViewerRef],
	);

	const toExpandedMeasureIndex = useCallback(
		(measureIndex: number): number => mapOriginToExpandedIndex(originMeasureIndicesRef.current, measureIndex),
		[],
	);

	// A seek holds a RENDERED measure index (from a click); map it to its first
	// occurrence on the expanded timeline before locating the slot's start time.
	const startOffsetFor = useCallback(
		(seek: { measureIndex: number; slotIndex: number }): number =>
			findSlotStartTime(
				scheduleEventsRef.current,
				mapOriginToExpandedIndex(originMeasureIndicesRef.current, seek.measureIndex),
				seek.slotIndex,
			),
		[],
	);

	// ── Playback cursor RAF loop: runs while playing ───────────────────────────
	useEffect(() => {
		if (!isPlaying) {
			// The next play re-triggers row and measure positioning and snaps on its
			// first frame. Pause leaves the cursor where it is; Stop resets it.
			lastScrolledRowRef.current = -1;
			lastMeasureIdxRef.current = -1;
			prevTimestampRef.current = 0;
			lastPassIndexRef.current = 0;
			return;
		}

		let rafId = 0;
		function tick(timestamp: number) {
			rafId = requestAnimationFrame(tick);
			const playhead = cursorRef.current;
			const highlight = measureHighlightRef.current;
			const container = tabViewerRef.current;
			const progress = playbackGetterRef.current();
			if (!playhead || !highlight || !container || !progress) return;
			const { elapsed, passIndex } = progress;
			const events = scheduleEventsRef.current;
			const position = getProgressAtTime(events, elapsed, measureBoundariesRef.current);
			if (!position) return;
			// `position` is on the EXPANDED timeline (repeats flattened); the staves are
			// drawn from the compact pattern, so every DOM lookup uses the rendered
			// measure it came from, and event comparisons stay on the expanded index.
			const { measureIndex: expandedMeasureIndex, slotIndex } = position;
			const measureIndex = originMeasureIndicesRef.current[expandedMeasureIndex] ?? expandedMeasureIndex;
			const containerRect = container.getBoundingClientRect();
			const box = measureBox(container, containerRect, measureIndex);
			if (!box) return;

			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
				onPassRef.current?.(passIndex);
			}

			const measureRight = box.left + box.width;
			const noteEl = noteAt(container, measureIndex, slotIndex);
			let targetX = box.left;
			const soundsAt = soundsAtRef.current;
			const times = measureTimesRef.current[expandedMeasureIndex];
			if (!soundsAt.has(slotKey(expandedMeasureIndex, slotIndex)) && times) {
				// Nothing struck yet in this measure (the position is the measure's own
				// start): walk its opening silence by time — a drawn rest has a place on
				// the stave but no event, so it must not hold the playhead still.
				targetX = leadInX(
					{
						slots: times.slots.map((slot) => {
							const el = noteAt(container, measureIndex, slot.slotIndex);
							return {
								start: slot.time,
								x: el ? noteX(el, containerRect) : null,
								soundsAt: soundsAt.get(slotKey(expandedMeasureIndex, slot.slotIndex)) ?? null,
							};
						}),
						end: times.end,
						left: box.left,
						right: measureRight,
					},
					elapsed,
				);
			} else if (!noteEl) {
				prevTimestampRef.current = 0;
			} else {
				const x0 = noteX(noteEl, containerRect);
				targetX = x0;
				// A rolled slot emits one event PER STRING, staggered in time and not
				// necessarily in order (the last-on-beat anchor gives negative offsets),
				// so interpolate between SLOTS: this slot's earliest event to the next
				// distinct slot's earliest.
				let t0 = Infinity;
				let slotDuration = 0;
				for (const e of events) {
					if (e.measureIndex === expandedMeasureIndex && e.slotIndex === slotIndex) {
						if (e.time < t0) t0 = e.time;
						slotDuration = e.duration;
					}
				}
				if (t0 === Infinity) t0 = elapsed;
				const next = events.find(
					(e) => e.time > t0 && (e.measureIndex !== expandedMeasureIndex || e.slotIndex !== slotIndex),
				);
				let t1 = Infinity;
				if (next) {
					for (const e of events) {
						if (e.measureIndex === next.measureIndex && e.slotIndex === next.slotIndex && e.time < t1) t1 = e.time;
					}
				}
				// The last note of a measure drifts to the measure's right edge.
				if (!next || next.measureIndex !== expandedMeasureIndex) {
					const frac = Math.max(0, Math.min(1, (elapsed - t0) / (slotDuration > 0 ? slotDuration : 1)));
					targetX = x0 + (measureRight - x0) * frac;
				} else {
					const nextEl = noteAt(container, originMeasureIndicesRef.current[next.measureIndex] ?? next.measureIndex, next.slotIndex);
					if (nextEl) {
						const frac = t1 > t0 ? Math.max(0, Math.min(1, (elapsed - t0) / (t1 - t0))) : 0;
						// A next note to the left is on another row: keep drifting right instead.
						const nextX = noteX(nextEl, containerRect);
						const x1 = nextX >= x0 ? nextX : measureRight;
						targetX = x0 + (x1 - x0) * frac;
					}
				}
			}

			// Exponential smoothing: the rendered position chases the target, so
			// per-note velocity changes never stutter. A snap frame jumps straight there.
			const prevTime = prevTimestampRef.current;
			renderedXRef.current =
				prevTime === 0
					? targetX
					: renderedXRef.current + (targetX - renderedXRef.current) * (1 - Math.exp(-CURSOR_LAMBDA * ((timestamp - prevTime) / 1000)));
			prevTimestampRef.current = timestamp;
			setPlayheadX(playhead, renderedXRef.current);

			const row = rowOf(rowsRef.current, measureIndex);
			if (row !== -1 && row !== lastScrolledRowRef.current) {
				lastScrolledRowRef.current = row;
				setRow(playhead, box);
				setRow(highlight, box);
				prevTimestampRef.current = 0;
				rowRefs.current[row]?.scrollIntoView({ behavior: "smooth", block: "center" });
			}
			if (measureIndex !== lastMeasureIdxRef.current) {
				lastMeasureIdxRef.current = measureIndex;
				showMeasure(highlight, box);
				onMeasureRef.current?.(measureIndex);
			}
		}
		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
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
