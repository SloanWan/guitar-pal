"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import TabStaveRow, {
	computeMeasureMinWidth,
	CLEF_WIDTH,
} from "@/components/fingerpick/TabStaveRow";
import {
	useFingerpickAudioEngine,
	DEFAULT_ENVELOPE,
	type EnvelopeParams,
	type VoiceStealEvent,
} from "@/components/fingerpick/useFingerpickAudioEngine";
import Fader from "@/components/ui/Fader";
import {
	fingerpickPatternToScheduleEvents,
	computeMeasureBoundaries,
	getProgressAtTime,
	findSlotStartTime,
	type ScheduleEvent,
	type MeasureBoundary,
} from "@/lib/fingerpickScheduler";
import { fingerpickToVexFlow } from "@/lib/fingerpickToVexFlow";
import { withLetRingAll } from "@/lib/fingerpickLetRing";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { FingerpickPattern, Measure } from "@/lib/fingerpickTypes";

import { DECAY_LAB_FIXTURE } from "./fixture";

// ── Auditionable patterns ───────────────────────────────────────────────────
// The decay-lab fixture (no letRing) plus every built-in preset. The four presets
// that carry letRing are the ones whose production sound this branch changes, so
// they must be playable under the live envelope sliders; the fixture alone cannot
// exercise the letRing τ at all.
const PATTERN_OPTIONS: FingerpickPattern[] = [DECAY_LAB_FIXTURE, ...PRESET_FINGERPICK_PATTERNS];

// True when any string in any slot has letRing set (i.e. the pattern's authored
// sound depends on the letRing decay τ).
function patternHasLetRing(pattern: FingerpickPattern): boolean {
	return pattern.measures.some((m) =>
		m.slots.some((slot) => slot.strings.some((sf) => sf.letRing === true)),
	);
}

// ── Width computation (mirrors the tab-notation dev page) ───────────────────
const MEASURES_PER_ROW = 2;
const ROW_TRAILING_PAD = 15;

// Exponential follow constant for the cursor's x smoothing (matches production).
const CURSOR_LAMBDA = 20;

// How long a voice-steal flash marker stays visible before it is removed.
const STEAL_FLASH_MS = 500;

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

// ── Slider config ───────────────────────────────────────────────────────────

type EnvKey = keyof EnvelopeParams;

interface SliderSpec {
	key: EnvKey;
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

const SLIDERS: SliderSpec[] = [
	{ key: "decayTcRatio", label: "Decay τ ratio (× duration)", min: 0.1, max: 2.0, step: 0.05, unit: "×" },
	{ key: "minDecayTc", label: "Min decay τ", min: 0.01, max: 0.5, step: 0.01, unit: "s" },
	{ key: "voiceStealFadeTau", label: "Voice-steal fade τ", min: 0.001, max: 0.1, step: 0.001, unit: "s" },
	{ key: "letRingDecayTc", label: "letRing decay τ", min: 0.2, max: 4.0, step: 0.1, unit: "s" },
	{ key: "sourceStopBuffer", label: "Source stop buffer", min: 0.0, max: 0.5, step: 0.01, unit: "s" },
];

const BPM_MIN = 30;
const BPM_MAX = 160;

function pct(value: number, min: number, max: number): number {
	return ((value - min) / (max - min)) * 100;
}

// A rendered visual row: the measures it holds, the 0-based global index of its
// first measure, and the per-measure stave widths.
interface ScoreRow {
	measures: Measure[];
	startIndex: number;
	widths: number[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DecayLabPage() {
	const engine = useFingerpickAudioEngine();
	const { isPlaying, isLoaded, envelope } = engine;

	const [selectedId, setSelectedId] = useState(DECAY_LAB_FIXTURE.id);
	const [bpm, setBpm] = useState(DECAY_LAB_FIXTURE.bpm);
	const [letRingAll, setLetRingAll] = useState(false);

	// The authored pattern currently under audition (fixture or a preset).
	const basePattern = useMemo(
		() => PATTERN_OPTIONS.find((p) => p.id === selectedId) ?? DECAY_LAB_FIXTURE,
		[selectedId],
	);

	const containerRef = useRef<HTMLDivElement>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	// ── Cursor overlay refs (LOCAL cursor — deliberately NOT the shared production
	// hook; this page reuses only the DOM data-attribute contract). ────────────
	const scoreRef = useRef<HTMLDivElement>(null);
	const cursorRef = useRef<HTMLDivElement>(null);
	const measureHighlightRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | undefined>(undefined);
	// Mirrors kept current for the RAF closure without re-subscribing the loop.
	const rowsRef = useRef<ScoreRow[]>([]);
	const playbackGetterRef = useRef(engine.getPlaybackProgress);
	const scheduleEventsRef = useRef<ScheduleEvent[]>([]);
	const measureBoundariesRef = useRef<MeasureBoundary[]>([]);
	// Exponential-smoothed cursor x; prevTimestamp 0 = "snap this frame".
	const renderedXRef = useRef(0);
	const prevTimestampRef = useRef(0);
	const lastPassIndexRef = useRef(0);
	const lastMeasureIdxRef = useRef(-1);
	const lastRowIdxRef = useRef(-1);
	// Bumped on Stop to re-run the reset-to-start positioning effect.
	const [cursorResetTick, setCursorResetTick] = useState(0);
	// Seek target recorded while stopped; consumed by the next Play as a startOffset.
	const pendingSeekRef = useRef<{ measureIndex: number; slotIndex: number } | null>(null);

	// ── Voice-steal flash state ────────────────────────────────────────────────
	// Map from an incoming slot key (`${measureIndex}:${slotIndex}`) to the list of
	// notes that slot steals — populated by the engine's read-only steal observer.
	const stealMapRef = useRef<Map<string, { measureIndex: number; slotIndex: number }[]>>(
		new Map(),
	);
	// Slot key last flashed, so a flash fires once per slot transition (edge only).
	const lastFlashSlotKeyRef = useRef<string | null>(null);
	// Live flash marker DOM nodes + their removal timers, for teardown.
	const activeFlashesRef = useRef<Set<{ el: HTMLDivElement; timer: ReturnType<typeof setTimeout> }>>(
		new Set(),
	);

	// Preload presets once so the first Play is instant.
	useEffect(() => {
		void engine.load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Register the read-only voice-steal observer once. It appends into stealMapRef
	// keyed by the INCOMING slot, so the RAF loop can flash the stolen note when
	// playback reaches that slot. Deterministic per pattern, so re-reporting the
	// same steal across loop passes / reschedules simply overwrites the same key.
	useEffect(() => {
		engine.setVoiceStealObserver((steal: VoiceStealEvent) => {
			const key = `${steal.byMeasureIndex}:${steal.bySlotIndex}`;
			const list = stealMapRef.current.get(key) ?? [];
			const already = list.some(
				(s) => s.measureIndex === steal.stolenMeasureIndex && s.slotIndex === steal.stolenSlotIndex,
			);
			if (!already) {
				list.push({ measureIndex: steal.stolenMeasureIndex, slotIndex: steal.stolenSlotIndex });
				stealMapRef.current.set(key, list);
			}
		});
		return () => engine.setVoiceStealObserver(null);
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

	// The pattern actually played: derived letRing copy (or the base itself), with
	// the live BPM stamped in so play() starts at the current tempo.
	const playPattern = useMemo<FingerpickPattern>(() => {
		const base = letRingAll ? withLetRingAll(basePattern) : basePattern;
		return { ...base, bpm };
	}, [letRingAll, bpm, basePattern]);

	// Rows of measures for rendering (visual only — always the un-mutated base pattern).
	const rows = useMemo<ScoreRow[]>(() => {
		if (containerWidth === 0) return [];
		const out: ScoreRow[] = [];
		for (let i = 0; i < basePattern.measures.length; i += MEASURES_PER_ROW) {
			const measures = basePattern.measures.slice(i, i + MEASURES_PER_ROW);
			out.push({ measures, startIndex: i, widths: computeRowWidths(measures, containerWidth) });
		}
		return out;
	}, [containerWidth, basePattern]);

	// Keep RAF-closure mirrors current. The one-frame lag is harmless: the getter
	// reads audio-engine refs (never React state), and rows change only on resize.
	useEffect(() => {
		rowsRef.current = rows;
	}, [rows]);
	useEffect(() => {
		playbackGetterRef.current = engine.getPlaybackProgress;
	}, [engine.getPlaybackProgress]);

	// Mirror the played pattern's event list + measure boundaries so the RAF loop
	// has per-note timestamps. The steal map is rebuilt by the engine observer on
	// the next play/reschedule, so clear it here to drop entries that no longer
	// apply (e.g. letRing steals after toggling letRing off).
	useEffect(() => {
		scheduleEventsRef.current = fingerpickPatternToScheduleEvents(playPattern, playPattern.bpm);
		measureBoundariesRef.current = computeMeasureBoundaries(playPattern, playPattern.bpm);
		stealMapRef.current.clear();
	}, [playPattern]);

	// Remove every live flash marker and cancel its pending removal timer.
	function clearFlashes(): void {
		for (const f of activeFlashesRef.current) {
			clearTimeout(f.timer);
			f.el.remove();
		}
		activeFlashesRef.current.clear();
	}

	// Flash a transient marker over the stolen note element (denim outline that
	// fades out). Token colors only — no inline rgba literals.
	function flashStolenNote(measureIndex: number, slotIndex: number): void {
		const container = scoreRef.current;
		if (!container) return;
		const el = container.querySelector<SVGElement>(
			`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
		);
		if (!el) return;

		const containerRect = container.getBoundingClientRect();
		const r = el.getBoundingClientRect();

		const box = document.createElement("div");
		box.setAttribute("aria-hidden", "true");
		box.style.position = "absolute";
		box.style.pointerEvents = "none";
		box.style.left = `${r.left - containerRect.left - 3}px`;
		box.style.top = `${r.top - containerRect.top - 3}px`;
		box.style.width = `${r.width + 6}px`;
		box.style.height = `${r.height + 6}px`;
		box.style.border = "2px solid var(--denim-accent)";
		box.style.backgroundColor = "var(--denim-tint)";
		box.style.opacity = "1";
		box.style.transition = `opacity ${STEAL_FLASH_MS}ms ease-out`;
		container.appendChild(box);

		const timer = setTimeout(() => {
			box.remove();
			for (const f of activeFlashesRef.current) {
				if (f.el === box) {
					activeFlashesRef.current.delete(f);
					break;
				}
			}
		}, STEAL_FLASH_MS);
		activeFlashesRef.current.add({ el: box, timer });

		// Next frame → trigger the fade-out transition.
		requestAnimationFrame(() => {
			box.style.opacity = "0";
		});
	}

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

	// Shared row/measure repositioning used by the rest-slot branch (which has no
	// note element to derive the row height from).
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
	// Retry each frame until TabStaveRow's async render has emitted the data
	// attributes, then park the cursor + highlight on measure 0 / slot 0.
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
			// The pattern may open with leading silence: empty slots render as
			// zero-width GhostNotes that emit NO SVG element, so slot 0 can be absent.
			// Fall back to the first note element that actually exists for vertical
			// positioning, and park the cursor at the measure's left edge (pattern
			// start) so playback drifts rightward from there instead of snapping.
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
			// x0 = slot 0's note center when it exists; otherwise the measure's left
			// edge (matches the rest-path's snapX so the drift begins seamlessly).
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

	// ── Playback cursor RAF loop ────────────────────────────────────────────────
	// LOCAL implementation. Interpolates x between the current note and the next
	// event, drifts through rest slots, repositions vertically on row change, and
	// flashes voice-steal markers — all via direct DOM mutation, never setState.
	// Deliberately omits scrollIntoView and the production page's mobile/scroll
	// coordination: this dev page must not move under the user during slider drags.
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
			lastFlashSlotKeyRef.current = null;
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

			// Loop-pass boundary → snap instead of chasing backward from last→first note.
			if (passIndex !== lastPassIndexRef.current) {
				lastPassIndexRef.current = passIndex;
				prevTimestampRef.current = 0;
			}

			// Voice-steal flash: on each slot transition, flash whatever this slot steals.
			const slotKey = `${measureIndex}:${slotIndex}`;
			if (slotKey !== lastFlashSlotKeyRef.current) {
				lastFlashSlotKeyRef.current = slotKey;
				const stolen = stealMapRef.current.get(slotKey);
				if (stolen) {
					for (const s of stolen) flashStolenNote(s.measureIndex, s.slotIndex);
				}
			}

			const noteEl = container.querySelector<SVGElement>(
				`[data-measure-index="${measureIndex}"][data-slot-index="${slotIndex}"]`,
			);

			if (!noteEl) {
				// Rest slot (no DOM element): drift from the measure's left edge toward the
				// first real note of the measure over the rest's duration — never freeze.
				const stavesvg = container.querySelector<SVGElement>(
					`svg[data-stave-${measureIndex}-x]`,
				);
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
							const x1 =
								firstNonRestRect.left - containerRect.left + firstNonRestRect.width / 2;
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

			// A rolled slot emits one event PER STRING — all sharing this (measureIndex,
			// slotIndex) but staggered in time. Interpolate between SLOTS, not events:
			// t0 is the slot's earliest event time; the "next" note is the next DISTINCT
			// slot, whose start is its own earliest event time. Using the minimum (not the
			// first array match) is required because the last-on-beat anchor produces
			// negative offsets, so same-slot events aren't guaranteed to be in time order.
			let t0 = Infinity;
			let slotDuration = 0;
			for (const e of events) {
				if (e.measureIndex === measureIndex && e.slotIndex === slotIndex) {
					if (e.time < t0) t0 = e.time;
					slotDuration = e.duration;
				}
			}
			if (t0 === Infinity) t0 = elapsed;

			// First event, in time order, that belongs to a DIFFERENT slot (skips the
			// current rolled slot's siblings) — identifies the next distinct slot.
			const nextSlotEvent = events.find(
				(e) => e.time > t0 && (e.measureIndex !== measureIndex || e.slotIndex !== slotIndex),
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
						// Next note is on a different row — drift to this measure's right edge.
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

			// Row transition → move both overlays vertically (no scrollIntoView).
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

			// Measure transition → move the background highlight.
			if (measureIndex !== lastMeasureIdxRef.current) {
				lastMeasureIdxRef.current = measureIndex;
				if (measureHL) {
					const stavesvg = container.querySelector<SVGElement>(
						`svg[data-stave-${measureIndex}-x]`,
					);
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

	// Snap both overlays directly to a note element (discrete jump, no smoothing).
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

		// Prevent the next RAF tick from redundantly repositioning the overlays.
		lastMeasureIdxRef.current = measureIndex;
		lastRowIdxRef.current = rowIndexForMeasure(measureIndex);
	}

	// Seek to the note nearest the click (nearest row by Y, nearest note by X).
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
			// Engine reschedules from the new position.
			engine.seekToNote(measureIndex, slotIndex);
		} else {
			// Stopped: record the target; handlePlayStop() starts from here.
			pendingSeekRef.current = { measureIndex, slotIndex };
		}
		snapCursorToNote(nearestEl, measureIndex);
	}

	function handlePlayStop() {
		if (isPlaying) {
			engine.stop();
			pendingSeekRef.current = null;
			clearFlashes();
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
		// Seamless — applyBpmChange re-maps the current position to the new tempo.
		if (isPlaying) engine.applyBpmChange(next);
	}

	function handleLetRingToggle() {
		const next = !letRingAll;
		setLetRingAll(next);
		// letRing changes the event stream, so a running pass must be rebuilt: restart.
		if (isPlaying) {
			const base = next ? withLetRingAll(basePattern) : basePattern;
			pendingSeekRef.current = null;
			clearFlashes();
			engine.stop();
			engine.play({ ...base, bpm }, { loop: true, loopGapSeconds: 0 });
		}
	}

	// Switch the audition pattern: stop any playback, reset tempo to the pattern's
	// authored BPM, and re-park the cursor at the start of the new score.
	function handleSelectPattern(id: string) {
		if (id === selectedId) return;
		const next = PATTERN_OPTIONS.find((p) => p.id === id) ?? DECAY_LAB_FIXTURE;
		if (isPlaying) engine.stop();
		pendingSeekRef.current = null;
		clearFlashes();
		setSelectedId(id);
		setBpm(next.bpm);
		setCursorResetTick((t) => t + 1);
	}

	function handleSlider(key: EnvKey, value: number) {
		engine.setEnvelopeParams({ [key]: value });
	}

	// Teardown: remove any lingering flash markers on unmount.
	useEffect(() => {
		return () => clearFlashes();
	}, []);

	return (
		<div ref={containerRef} className="mx-auto max-w-5xl p-6 font-mono text-ink">
			<h1 className="text-lg font-bold">Decay Lab</h1>
			<p className="mt-1 mb-4 text-xs text-ink-dim">
				Tune note-decay envelope constants on real fingerpick playback and A/B the letRing
				field. Playback loops seamlessly; the visual score below is the unmodified pattern
				&ldquo;{basePattern.name}&rdquo; ({basePattern.measures.length} measures, authored at{" "}
				{basePattern.bpm} BPM). Click any note to seek; a denim outline flashes on a note when
				a re-struck string steals its still-ringing voice. The four presets tagged{" "}
				<span className="text-denim-accent">letRing</span> are the patterns whose production
				sound this branch changes — audition them under the live sliders (especially{" "}
				<span className="text-ink">letRing decay τ</span>).
			</p>

			{/* ── Pattern selector ──────────────────────────────────────────── */}
			<div className="mb-6 flex flex-wrap items-center gap-2">
				{PATTERN_OPTIONS.map((p) => {
					const active = p.id === selectedId;
					const hasLetRing = patternHasLetRing(p);
					return (
						<button
							key={p.id}
							type="button"
							onClick={() => handleSelectPattern(p.id)}
							aria-pressed={active}
							className={`flex items-center gap-2 border px-3 py-1.5 text-xs ${
								active
									? "border-denim bg-denim text-[var(--btn-on-denim)]"
									: "border-line-strong text-ink-dim"
							}`}
						>
							<span>{p.name}</span>
							<span
								className={`border px-1 py-px text-[9px] uppercase tracking-[0.08em] ${
									active
										? "border-[var(--btn-on-denim)]"
										: hasLetRing
											? "border-denim-accent text-denim-accent"
											: "border-line-strong text-ink-faint"
								}`}
							>
								{hasLetRing ? "letRing" : "no letRing"}
							</span>
						</button>
					);
				})}
			</div>

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
					onClick={handleLetRingToggle}
					aria-pressed={letRingAll}
					className={`border px-3 py-1.5 text-xs ${
						letRingAll
							? "border-denim bg-denim text-[var(--btn-on-denim)]"
							: "border-line-strong text-ink-dim"
					}`}
				>
					letRing: {letRingAll ? "ALL notes" : "off (as authored)"}
				</button>

				<button
					type="button"
					onClick={() => engine.resetEnvelopeParams()}
					className="border border-line-strong px-3 py-1.5 text-xs text-ink-dim"
				>
					↺ Reset envelope to defaults
				</button>

				{!isLoaded && <span className="text-xs text-ink-faint">loading presets…</span>}
			</div>

			{/* ── Controls ──────────────────────────────────────────────────── */}
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
					const value = envelope[s.key];
					const def = DEFAULT_ENVELOPE[s.key];
					const deviated = Math.abs(value - def) > 1e-9;
					return (
						<div key={s.key}>
							<div className="mb-1 flex items-baseline justify-between">
								<span className="text-xs text-ink">{s.label}</span>
								<span
									className={`text-xs tabular-nums ${deviated ? "text-denim-accent" : "text-ink-dim"}`}
								>
									{value.toFixed(3)}
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
								production default: {def}
								{s.unit}
								{s.key === "letRingDecayTc" && " · only affects notes with letRing"}
							</p>
						</div>
					);
				})}
			</div>

			<p className="mt-3 text-[10px] leading-relaxed text-ink-dim">
				Envelope sliders take effect on the <span className="text-ink">next loop pass</span>{" "}
				(Web Audio bakes each note&rsquo;s gain ramp at schedule time, so already-scheduled
				notes keep their envelope). <span className="text-ink">BPM</span> applies seamlessly
				mid-pass. <span className="text-ink">letRing</span> rebuilds the event stream, so
				toggling it while playing restarts the loop.
			</p>

			{/* ── Score ─────────────────────────────────────────────────────── */}
			<div
				ref={scoreRef}
				onClick={handleTabClick}
				className="relative mt-6 cursor-pointer border border-line-strong"
			>
				{/* Measure background highlight — repositioned only on measure transitions. */}
				<div
					ref={measureHighlightRef}
					aria-hidden="true"
					className="absolute pointer-events-none"
					style={{ display: "none", backgroundColor: "var(--measure-hl)" }}
				/>
				{/* Playhead line — before the SVG rows in DOM order so it sits behind note
				    numbers; translateX updated every RAF frame. */}
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
