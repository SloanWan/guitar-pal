"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TabStaveRow, {
	computeMeasureMinWidth,
	CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import Fader from "@/components/ui/Fader";
import {
	fingerpickPatternToScheduleEvents,
	computeMeasureBoundaries,
	getProgressAtTime,
	findSlotStartTime,
	DEFAULT_SLIDE_PARAMS,
	type ScheduleEvent,
	type MeasureBoundary,
	type SlideDurationScaling,
	type SlideAnchor,
	type LegatoTreatment,
} from "@/lib/fingerpickScheduler";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import type { Measure } from "@/lib/fingerpickTypes";

import { SLIDE_LAB_FIXTURE } from "./fixture";

// ── Width computation (mirrors the roll-lab / decay-lab dev pages) ──────────────
const MEASURES_PER_ROW = 2;
const ROW_TRAILING_PAD = 15;

// Exponential follow constant for the cursor's x smoothing (matches production).
const CURSOR_LAMBDA = 20;

const BPM_MIN = 30;
const BPM_MAX = 240;

function techniqueConnectorCount(measure: Measure): number {
	return measure.slots.reduce(
		(count, slot) =>
			count +
			slot.strings.filter((sf) => sf.technique === "hammer-on" || sf.technique === "pull-off")
				.length,
		0,
	);
}

function computeRowWidths(measures: Measure[], containerWidth: number): number[] {
	const staveSpace = containerWidth - CLEF_WIDTH - ROW_TRAILING_PAD;
	const minWidths = measures.map((m, i) =>
		computeMeasureMinWidth(fingerpickToVexFlow(m).notes, i === 0, techniqueConnectorCount(m)),
	);
	const totalMin = minWidths.reduce((a, b) => a + b, 0);
	const scale = Math.max(1, staveSpace / totalMin);
	return minWidths.map((w) => w * scale);
}

function pct(value: number, min: number, max: number): number {
	return ((value - min) / (max - min)) * 100;
}

// ── Control config ──────────────────────────────────────────────────────────

type NumericSlideKey =
	| "rampDurationS"
	| "intervalScaleSecPerSemitone"
	| "maxIntervalSemitones"
	| "gainDip";

interface SliderSpec {
	key: NumericSlideKey;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
	decimals: number;
	note: string;
}

const SLIDERS: SliderSpec[] = [
	{
		key: "rampDurationS",
		label: "Ramp duration (fixed)",
		min: 0.01,
		max: 0.4,
		step: 0.005,
		unit: "s",
		decimals: 3,
		note: "used by fixed scaling",
	},
	{
		key: "intervalScaleSecPerSemitone",
		label: "Interval scale",
		min: 0,
		max: 0.08,
		step: 0.002,
		unit: "s/st",
		decimals: 3,
		note: "used by interval-scaled mode",
	},
	{
		key: "maxIntervalSemitones",
		label: "Max interval (else retrigger)",
		min: 1,
		max: 24,
		step: 1,
		unit: "st",
		decimals: 0,
		note: "beyond this the slide plays as a normal note",
	},
	{
		key: "gainDip",
		label: "Mid-ramp gain dip",
		min: 0,
		max: 0.9,
		step: 0.05,
		unit: "×",
		decimals: 2,
		note: "0 = off; energy loss mid-travel",
	},
];

const DURATION_SCALINGS: { value: SlideDurationScaling; label: string; hint: string }[] = [
	{ value: "fixed", label: "fixed", hint: "same ramp time for any interval" },
	{ value: "interval-scaled", label: "interval-scaled", hint: "wider slides take longer" },
];

const ANCHORS: { value: SlideAnchor; label: string; hint: string }[] = [
	{ value: "finish-on-target", label: "finish-on-target", hint: "note lands on the beat (real playing)" },
	{ value: "start-on-target", label: "start-on-target", hint: "slide begins on the beat" },
];

const LEGATO_TREATMENTS: { value: LegatoTreatment; label: string; hint: string }[] = [
	{ value: "current", label: "current", hint: "0.5 gain + 2 kHz lowpass (production)" },
	{ value: "gain-only", label: "gain-only", hint: "0.5 gain, no filter" },
	{ value: "dry", label: "dry", hint: "normal gain, no filter (= plucked note)" },
];

// A rendered visual row: the measures it holds, the 0-based global index of its first
// measure, and the per-measure stave widths.
interface ScoreRow {
	measures: Measure[];
	startIndex: number;
	widths: number[];
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SlideLabPage() {
	const engine = useFingerpickAudioEngine();
	const { isPlaying, isLoaded, slideParams, legatoTreatment, metronomeEnabled } = engine;

	const [bpm, setBpm] = useState(SLIDE_LAB_FIXTURE.bpm);

	const basePattern = SLIDE_LAB_FIXTURE;

	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// ── Cursor overlay refs (LOCAL cursor — copied from roll-lab, NOT a shared hook;
	// this page reuses only the DOM data-attribute contract). ──────────────────
	const scoreRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const measureHighlightRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | undefined>(undefined);
	const rowsRef = useRef<ScoreRow[]>([]);
	const playbackGetterRef = useRef(engine.getPlaybackProgress);
	const scheduleEventsRef = useRef<ScheduleEvent[]>([]);
	const measureBoundariesRef = useRef<MeasureBoundary[]>([]);
	const renderedXRef = useRef(0);
	const prevTimestampRef = useRef(0);
	const lastPassIndexRef = useRef(0);
	const lastMeasureIdxRef = useRef(-1);
	const lastRowIdxRef = useRef(-1);
	const [cursorResetTick, setCursorResetTick] = useState(0);
	const pendingSeekRef = useRef<{ measureIndex: number; slotIndex: number } | null>(null);

	// Preload presets once so the first Play is instant.
	useEffect(() => {
		void engine.load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const obs = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
		});
		obs.observe(el);
		return () => obs.disconnect();
	}, []);

	// The pattern actually played: the fixture with the live BPM stamped in.
	const playPattern = useMemo(() => ({ ...basePattern, bpm }), [basePattern, bpm]);

	// Rows of measures for rendering.
	const rows = useMemo<ScoreRow[]>(() => {
		if (containerWidth === 0) return [];
		const out: ScoreRow[] = [];
		for (let i = 0; i < basePattern.measures.length; i += MEASURES_PER_ROW) {
			const measures = basePattern.measures.slice(i, i + MEASURES_PER_ROW);
			out.push({ measures, startIndex: i, widths: computeRowWidths(measures, containerWidth) });
		}
		return out;
	}, [containerWidth, basePattern]);

	useEffect(() => {
		rowsRef.current = rows;
	}, [rows]);
	useEffect(() => {
		playbackGetterRef.current = engine.getPlaybackProgress;
	}, [engine.getPlaybackProgress]);

	// Mirror the played pattern's event list + measure boundaries so the RAF loop has
	// per-note timestamps. Slide params never affect timing (they only reshape a sounding
	// voice), so this depends on the pattern/BPM alone — no slide-param dependency.
	useEffect(() => {
		scheduleEventsRef.current = fingerpickPatternToScheduleEvents(playPattern, playPattern.bpm);
		measureBoundariesRef.current = computeMeasureBoundaries(playPattern, playPattern.bpm);
	}, [playPattern]);

	// Find the visual row containing a global measure index.
	function rowIndexForMeasure(measureIndex: number): number {
		return rowsRef.current.findIndex(
			(row) => measureIndex >= row.startIndex && measureIndex < row.startIndex + row.measures.length,
		);
	}

	// Right edge (x, relative to the score container) of a measure's note area.
	function measureRightEdge(
		measureIndex: number,
		container: HTMLDivElement,
		containerRect: DOMRect,
		fallback: number,
	): number {
		const stavesvg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
		if (!stavesvg) return fallback;
		const staveSvgRect = stavesvg.getBoundingClientRect();
		const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
		const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
		return staveSvgRect.left - containerRect.left + sx + sw;
	}

	function repositionForMeasure(
		measureIndex: number,
		stavesvg: SVGElement,
		container: HTMLDivElement,
		containerRect: DOMRect,
		playhead: HTMLDivElement,
		measureHL: HTMLDivElement | null,
	): void {
		if (measureIndex === lastMeasureIdxRef.current) return;
		lastMeasureIdxRef.current = measureIndex;
		const staveSvgRect = stavesvg.getBoundingClientRect();
		const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
		const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
		const top = staveSvgRect.top - containerRect.top;

		if (measureHL) {
			measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
			measureHL.style.width = `${sw}px`;
			measureHL.style.display = "block";
		}

		const rowIdx = rowIndexForMeasure(measureIndex);
		if (rowIdx !== -1 && rowIdx !== lastRowIdxRef.current) {
			playhead.style.top = `${top}px`;
			playhead.style.height = `${staveSvgRect.height}px`;
			if (measureHL) {
				measureHL.style.top = `${top}px`;
				measureHL.style.height = `${staveSvgRect.height}px`;
			}
			lastRowIdxRef.current = rowIdx;
		}
	}

	// ── Initial + reset positioning ────────────────────────────────────────────
	useEffect(() => {
		let rafId: number;
		function place() {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = scoreRef.current;
			if (!playhead || !container) {
				rafId = requestAnimationFrame(place);
				return;
			}
			const slot0El = container.querySelector<SVGElement>(
				'[data-measure-index="0"][data-slot-index="0"]',
			);
			const anchorEl =
				slot0El ??
				container.querySelector<SVGElement>('[data-measure-index="0"][data-slot-index]');
			const svgEl = anchorEl?.closest("svg");
			const stavesvg = container.querySelector<SVGElement>("svg[data-stave-0-x]");
			if (!anchorEl || !svgEl || !stavesvg) {
				rafId = requestAnimationFrame(place);
				return;
			}
			const containerRect = container.getBoundingClientRect();
			const svgRect = svgEl.getBoundingClientRect();
			const staveSvgRect = stavesvg.getBoundingClientRect();
			const sx = parseFloat(stavesvg.getAttribute("data-stave-0-x") ?? "0");
			const sw = parseFloat(stavesvg.getAttribute("data-stave-0-w") ?? "0");
			let x0: number;
			if (slot0El) {
				const noteRect = slot0El.getBoundingClientRect();
				x0 = noteRect.left - containerRect.left + noteRect.width / 2;
			} else {
				x0 = staveSvgRect.left - containerRect.left + sx;
			}
			const top = svgRect.top - containerRect.top;

			playhead.style.top = `${top}px`;
			playhead.style.height = `${svgRect.height}px`;
			playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
			playhead.style.display = "block";
			renderedXRef.current = x0;
			prevTimestampRef.current = 0;

			if (measureHL) {
				measureHL.style.left = `${staveSvgRect.left - containerRect.left + sx}px`;
				measureHL.style.width = `${sw}px`;
				measureHL.style.top = `${top}px`;
				measureHL.style.height = `${svgRect.height}px`;
				measureHL.style.display = "block";
			}
		}
		rafId = requestAnimationFrame(place);
		return () => cancelAnimationFrame(rafId);
	}, [cursorResetTick, containerWidth, basePattern]);

	// ── Playback cursor RAF loop (LOCAL — copied from roll-lab) ──────────────────
	useEffect(() => {
		if (!isPlaying) {
			if (rafRef.current !== undefined) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = undefined;
			}
			lastMeasureIdxRef.current = -1;
			lastRowIdxRef.current = -1;
			prevTimestampRef.current = 0;
			lastPassIndexRef.current = 0;
			return;
		}

		function tick(timestamp: number) {
			const playhead = cursorRef.current;
			const measureHL = measureHighlightRef.current;
			const container = scoreRef.current;
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
			const events = scheduleEventsRef.current;
			const position = getProgressAtTime(events, elapsed, measureBoundariesRef.current);
			if (!position) {
				rafRef.current = requestAnimationFrame(tick);
				return;
			}
			const { measureIndex, slotIndex } = position;
			const containerRect = container.getBoundingClientRect();

			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
			}

			const noteEl = container.querySelector<SVGElement>(
				`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
			);

			if (!noteEl) {
				const stavesvg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
				if (stavesvg) {
					const staveSvgRect = stavesvg.getBoundingClientRect();
					const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
					const snapX = staveSvgRect.left - containerRect.left + sx;

					const firstNonRestEvent = events.find((e) => e.measureIndex === measureIndex);
					const measureBoundary = measureBoundariesRef.current.find(
						(b) => b.measureIndex === measureIndex,
					);

					let driftX = snapX;
					let didDrift = false;
					if (firstNonRestEvent) {
						const firstNonRestEl = container.querySelector<SVGElement>(
							`[data-measure-index="${measureIndex}"][data-slot-index="${firstNonRestEvent.slotIndex}"]`,
						);
						if (firstNonRestEl) {
							const firstNonRestRect = firstNonRestEl.getBoundingClientRect();
							const x1 = firstNonRestRect.left - containerRect.left + firstNonRestRect.width / 2;
							const measureStart = measureBoundary?.startTime ?? firstNonRestEvent.time;
							const restDuration = firstNonRestEvent.time - measureStart;
							const restElapsed = elapsed - measureStart;
							const frac =
								restDuration > 0 ? Math.max(0, Math.min(1, restElapsed / restDuration)) : 0;
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
								(driftX - renderedXRef.current) * (1 - Math.exp(-CURSOR_LAMBDA * dt));
						}
						prevTimestampRef.current = timestamp;
					} else {
						renderedXRef.current = snapX;
						prevTimestampRef.current = 0;
					}
					playhead.style.transform = `translateX(${Math.round(renderedXRef.current - 3)}px)`;

					repositionForMeasure(measureIndex, stavesvg, container, containerRect, playhead, measureHL);
				}
				rafRef.current = requestAnimationFrame(tick);
				return;
			}

			const noteRect = noteEl.getBoundingClientRect();
			const x0 = noteRect.left - containerRect.left + noteRect.width / 2;

			let t0 = Infinity;
			let slotDuration = 0;
			for (const e of events) {
				if (e.measureIndex === measureIndex && e.slotIndex === slotIndex) {
					if (e.time < t0) t0 = e.time;
					slotDuration = e.duration;
				}
			}
			if (t0 === Infinity) t0 = elapsed;

			const nextSlotEvent = events.find(
				(e) => e.time > t0 && (e.measureIndex !== measureIndex || e.slotIndex !== slotIndex),
			);
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
			const isLastNoteInMeasure = !nextSlotEvent || nextSlotEvent.measureIndex !== measureIndex;

			let targetX = x0;
			if (isLastNoteInMeasure) {
				const noteDuration = slotDuration > 0 ? slotDuration : 1;
				const frac = Math.max(0, Math.min(1, (elapsed - t0) / noteDuration));
				const measureRight = measureRightEdge(measureIndex, container, containerRect, x0);
				targetX = x0 + (measureRight - x0) * frac;
			} else if (nextSlotEvent) {
				const nextEl = container.querySelector<SVGElement>(
					`[data-measure-index="${nextSlotEvent.measureIndex}"][data-slot-index="${nextSlotEvent.slotIndex}"]`,
				);
				if (nextEl) {
					const nRect = nextEl.getBoundingClientRect();
					const x1 = nRect.left - containerRect.left + nRect.width / 2;
					const denom = t1 - t0;
					const frac = denom > 0 ? Math.max(0, Math.min(1, (elapsed - t0) / denom)) : 0;
					if (x1 >= x0) {
						targetX = x0 + (x1 - x0) * frac;
					} else {
						const measureRight = measureRightEdge(measureIndex, container, containerRect, x0);
						targetX = x0 + (measureRight - x0) * frac;
					}
				}
			}

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

			const rowIdx = rowIndexForMeasure(measureIndex);
			if (rowIdx !== -1 && rowIdx !== lastRowIdxRef.current) {
				const svgEl = noteEl.closest("svg");
				const svgRect = svgEl?.getBoundingClientRect();
				if (svgRect) {
					const top = svgRect.top - containerRect.top;
					playhead.style.top = `${top}px`;
					playhead.style.height = `${svgRect.height}px`;
					if (measureHL) {
						measureHL.style.top = `${top}px`;
						measureHL.style.height = `${svgRect.height}px`;
					}
				}
				lastRowIdxRef.current = rowIdx;
				prevTimestampRef.current = 0;
			}

			if (measureIndex !== lastMeasureIdxRef.current) {
				lastMeasureIdxRef.current = measureIndex;
				if (measureHL) {
					const stavesvg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
					if (stavesvg) {
						const svgRect = stavesvg.getBoundingClientRect();
						const sx = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-x`) ?? "0");
						const sw = parseFloat(stavesvg.getAttribute(`data-stave-${measureIndex}-w`) ?? "0");
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlaying]);

	// ── Click-to-seek ───────────────────────────────────────────────────────────

	function snapCursorToNote(noteEl: SVGElement, measureIndex: number): void {
		const playhead = cursorRef.current;
		const measureHL = measureHighlightRef.current;
		const container = scoreRef.current;
		if (!playhead || !container) return;

		const svgEl = noteEl.closest<SVGElement>("svg");
		if (!svgEl) return;

		const containerRect = container.getBoundingClientRect();
		const noteRect = noteEl.getBoundingClientRect();
		const svgRect = svgEl.getBoundingClientRect();

		const x0 = noteRect.left - containerRect.left + noteRect.width / 2;
		const top = svgRect.top - containerRect.top;

		renderedXRef.current = x0;
		prevTimestampRef.current = 0;

		playhead.style.transform = `translateX(${Math.round(x0 - 3)}px)`;
		playhead.style.top = `${top}px`;
		playhead.style.height = `${svgRect.height}px`;
		playhead.style.display = "block";

		if (measureHL) {
			const stavesvg = container.querySelector<SVGElement>(`svg[data-stave-${measureIndex}-x]`);
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

		lastMeasureIdxRef.current = measureIndex;
		lastRowIdxRef.current = rowIndexForMeasure(measureIndex);
	}

	function handleTabClick(e: React.MouseEvent<HTMLDivElement>): void {
		const container = scoreRef.current;
		if (!container) return;

		const noteEls = Array.from(
			container.querySelectorAll<SVGElement>("[data-measure-index][data-slot-index]"),
		);
		if (noteEls.length === 0) return;

		const allSvgs = Array.from(container.querySelectorAll<SVGElement>("svg"));
		if (allSvgs.length === 0) return;

		const clickYVp = e.clientY;
		const clickXVp = e.clientX;

		let targetSvg = allSvgs.find((svg) => {
			const r = svg.getBoundingClientRect();
			return clickYVp >= r.top && clickYVp <= r.bottom;
		});
		if (!targetSvg) {
			let minDist = Infinity;
			for (const svg of allSvgs) {
				const r = svg.getBoundingClientRect();
				const dist = Math.min(Math.abs(clickYVp - r.top), Math.abs(clickYVp - r.bottom));
				if (dist < minDist) {
					minDist = dist;
					targetSvg = svg;
				}
			}
		}
		if (!targetSvg) return;

		const rowNotes = noteEls.filter((el) => targetSvg!.contains(el));
		if (rowNotes.length === 0) return;

		let nearestEl: SVGElement | null = null;
		let minXDist = Infinity;
		for (const el of rowNotes) {
			const r = el.getBoundingClientRect();
			const dist = Math.abs(r.left + r.width / 2 - clickXVp);
			if (dist < minXDist) {
				minXDist = dist;
				nearestEl = el;
			}
		}
		if (!nearestEl) return;

		const measureIndex = parseInt(nearestEl.getAttribute("data-measure-index") ?? "0", 10);
		const slotIndex = parseInt(nearestEl.getAttribute("data-slot-index") ?? "0", 10);

		if (isPlaying) {
			engine.seekToNote(measureIndex, slotIndex);
		} else {
			pendingSeekRef.current = { measureIndex, slotIndex };
		}
		snapCursorToNote(nearestEl, measureIndex);
	}

	function handlePlayStop() {
		if (isPlaying) {
			engine.stop();
			pendingSeekRef.current = null;
			setCursorResetTick((t) => t + 1);
			return;
		}
		const pending = pendingSeekRef.current;
		pendingSeekRef.current = null;
		const startOffset = pending
			? findSlotStartTime(scheduleEventsRef.current, pending.measureIndex, pending.slotIndex)
			: 0;
		engine.play(playPattern, { loop: true, loopGapSeconds: 0 }, startOffset);
	}

	function handleBpm(next: number) {
		setBpm(next);
		if (isPlaying) engine.applyBpmChange(next);
	}

	// Slide-param + treatment handlers. These are read per-note inside the engine's
	// scheduler, so a change takes effect on the NEXT scheduled note — within a loop pass
	// for the running loop, with no reschedule (which would break slide origins mid-pass).
	function handleSlider(key: NumericSlideKey, value: number) {
		engine.setSlideParams({ [key]: value });
	}
	function handleDurationScaling(mode: SlideDurationScaling) {
		engine.setSlideParams({ durationScaling: mode });
	}
	function handleAnchor(anchor: SlideAnchor) {
		engine.setSlideParams({ anchor });
	}

	return (
		<div ref={containerRef} className="mx-auto max-w-5xl p-6 font-mono text-ink">
			<h1 className="text-lg font-bold">Slide Lab</h1>
			<p className="mt-1 mb-4 text-xs text-ink-dim">
				Audition slide as real pitch motion (playbackRate ramp on the already-sounding voice —
				no re-pluck) and A/B the hammer-on / pull-off treatment. Fixture &ldquo;{basePattern.name}
				&rdquo;: m1 2-fret up/down · m2 wide (7-fret) resample test · m3 short origin (voice-map
				exclusion → fallback) · m4 first-note-on-string (fallback) · m5 hammer/pull A/B · m6 plain
				reference. Click a note to seek. Slide/treatment changes apply on the next scheduled note
				(no reschedule); <span className="text-ink">BPM</span> applies mid-pass.
			</p>

			{/* ── Transport ─────────────────────────────────────────────────── */}
			<div className="flex flex-wrap items-center gap-3 border border-line-strong p-4">
				<button
					type="button"
					onClick={handlePlayStop}
					disabled={!isLoaded}
					className="border border-denim bg-denim px-4 py-1.5 text-xs text-[var(--btn-on-denim)] disabled:opacity-40"
				>
					{isPlaying ? "■ Stop" : "▶ Play (loop)"}
				</button>

				<button
					type="button"
					onClick={() => engine.setMetronomeEnabled(!metronomeEnabled)}
					aria-pressed={metronomeEnabled}
					className={`border px-3 py-1.5 text-xs ${
						metronomeEnabled
							? "border-denim bg-denim text-[var(--btn-on-denim)]"
							: "border-line-strong text-ink-dim"
					}`}
				>
					metronome: {metronomeEnabled ? "on" : "off"}
				</button>

				<button
					type="button"
					onClick={() => engine.resetSlideParams()}
					className="border border-line-strong px-3 py-1.5 text-xs text-ink-dim"
				>
					↺ Reset slide params to defaults
				</button>

				{!isLoaded && <span className="text-xs text-ink-faint">loading presets…</span>}
			</div>

			{/* ── Mode selectors ────────────────────────────────────────────── */}
			<div className="mt-4 grid grid-cols-1 gap-4 border border-line-strong p-4 sm:grid-cols-3">
				<div>
					<div className="mb-2 text-xs text-ink">
						Duration scaling{" "}
						<span className="text-ink-faint">(default {DEFAULT_SLIDE_PARAMS.durationScaling})</span>
					</div>
					<div className="flex flex-col gap-1">
						{DURATION_SCALINGS.map((m) => (
							<button
								key={m.value}
								type="button"
								onClick={() => handleDurationScaling(m.value)}
								aria-pressed={slideParams.durationScaling === m.value}
								title={m.hint}
								className={`border px-2 py-1 text-left text-xs ${
									slideParams.durationScaling === m.value
										? "border-denim bg-denim text-[var(--btn-on-denim)]"
										: "border-line-strong text-ink-dim"
								}`}
							>
								{m.label}
								<span className="block text-[9px] text-ink-faint">{m.hint}</span>
							</button>
						))}
					</div>
				</div>

				<div>
					<div className="mb-2 text-xs text-ink">
						Anchor{" "}
						<span className="text-ink-faint">(default {DEFAULT_SLIDE_PARAMS.anchor})</span>
					</div>
					<div className="flex flex-col gap-1">
						{ANCHORS.map((a) => (
							<button
								key={a.value}
								type="button"
								onClick={() => handleAnchor(a.value)}
								aria-pressed={slideParams.anchor === a.value}
								title={a.hint}
								className={`border px-2 py-1 text-left text-xs ${
									slideParams.anchor === a.value
										? "border-denim bg-denim text-[var(--btn-on-denim)]"
										: "border-line-strong text-ink-dim"
								}`}
							>
								{a.label}
								<span className="block text-[9px] text-ink-faint">{a.hint}</span>
							</button>
						))}
					</div>
				</div>

				<div>
					<div className="mb-2 text-xs text-ink">
						Hammer/pull A/B <span className="text-ink-faint">(default current)</span>
					</div>
					<div className="flex flex-col gap-1">
						{LEGATO_TREATMENTS.map((t) => (
							<button
								key={t.value}
								type="button"
								onClick={() => engine.setLegatoTreatment(t.value)}
								aria-pressed={legatoTreatment === t.value}
								title={t.hint}
								className={`border px-2 py-1 text-left text-xs ${
									legatoTreatment === t.value
										? "border-denim bg-denim text-[var(--btn-on-denim)]"
										: "border-line-strong text-ink-dim"
								}`}
							>
								{t.label}
								<span className="block text-[9px] text-ink-faint">{t.hint}</span>
							</button>
						))}
					</div>
				</div>
			</div>

			{/* ── Sliders ───────────────────────────────────────────────────── */}
			<div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 border border-line-strong p-4 sm:grid-cols-2">
				{/* BPM — seamless via applyBpmChange */}
				<div>
					<div className="mb-1 flex items-baseline justify-between">
						<span className="text-xs text-ink">
							BPM <span className="text-ink-faint">(seamless while playing)</span>
						</span>
						<span className="text-xs tabular-nums text-denim-accent">{bpm}</span>
					</div>
					<Fader
						ariaLabel="BPM"
						min={BPM_MIN}
						max={BPM_MAX}
						step={1}
						value={bpm}
						onValue={handleBpm}
						ticks={[pct(basePattern.bpm, BPM_MIN, BPM_MAX)]}
						tickValues={[basePattern.bpm]}
						tickLabels={[`default ${basePattern.bpm}`]}
						scale={[String(BPM_MIN), String(BPM_MAX)]}
					/>
					<p className="mt-1 text-[10px] text-ink-faint">authored tempo: {basePattern.bpm}</p>
				</div>

				{SLIDERS.map((s) => {
					const value = slideParams[s.key];
					const def = DEFAULT_SLIDE_PARAMS[s.key];
					const deviated = Math.abs(value - def) > 1e-9;
					return (
						<div key={s.key}>
							<div className="mb-1 flex items-baseline justify-between">
								<span className="text-xs text-ink">{s.label}</span>
								<span
									className={`text-xs tabular-nums ${deviated ? "text-denim-accent" : "text-ink-dim"}`}
								>
									{value.toFixed(s.decimals)}
									{s.unit}
								</span>
							</div>
							<Fader
								ariaLabel={s.label}
								min={s.min}
								max={s.max}
								step={s.step}
								value={value}
								onValue={(v) => handleSlider(s.key, v)}
								ticks={[pct(def, s.min, s.max)]}
								tickValues={[def]}
								tickLabels={[`default ${def}`]}
								scale={[String(s.min), String(s.max)]}
							/>
							<p className="mt-1 text-[10px] text-ink-faint">
								default: {def}
								{s.unit} · {s.note}
							</p>
						</div>
					);
				})}
			</div>

			<p className="mt-3 text-[10px] leading-relaxed text-ink-dim">
				A slide bends the <span className="text-ink">already-sounding</span> voice on its string
				(exponential playbackRate ramp) instead of re-plucking. Wide intervals resample the buffer
				far from its recorded pitch and sound artificial — raise/lower{" "}
				<span className="text-ink">Max interval</span> to hear where it breaks. When no live origin
				voice exists (first note on the string, a too-short origin, or an over-wide interval) the
				slide falls back to a normal pluck.
			</p>

			{/* ── Score ─────────────────────────────────────────────────────── */}
			<div
				ref={scoreRef}
				onClick={handleTabClick}
				className="relative mt-6 cursor-pointer border border-line-strong"
			>
				<div
					ref={measureHighlightRef}
					aria-hidden="true"
					className="absolute pointer-events-none"
					style={{ display: "none", backgroundColor: "var(--measure-hl)" }}
				/>
				<div
					ref={cursorRef}
					aria-hidden="true"
					className="absolute pointer-events-none"
					style={{
						display: "none",
						width: 2,
						left: 0,
						backgroundColor: "var(--denim-accent)",
						boxShadow: "var(--glow-playhead)",
					}}
				>
					<span
						aria-hidden="true"
						style={{
							position: "absolute",
							top: -6,
							left: -4,
							width: 0,
							height: 0,
							borderLeft: "5px solid transparent",
							borderRight: "5px solid transparent",
							borderTop: "6px solid var(--denim-accent)",
						}}
					/>
				</div>

				{rows.map((row) => (
					<TabStaveRow
						key={row.startIndex}
						measures={row.measures}
						startMeasureNumber={row.startIndex + 1}
						startMeasureIndex={row.startIndex}
						measureWidths={row.widths}
					/>
				))}
			</div>
		</div>
	);
}
