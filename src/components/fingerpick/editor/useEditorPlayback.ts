import { useEffect, useMemo, useRef, useState } from "react";
import type { SlotTarget } from "@/lib/fingerpickEdit";
import { expandFingerpickPattern, mapOriginToExpandedIndex } from "@/lib/fingerpickRepeats";
import { computeSlotStarts, slotAtTime } from "@/lib/fingerpickScheduler";
import type { BeatSlot, FingerpickPattern, Stroke } from "@/lib/fingerpickTypes";
import type { FretHint } from "@/lib/fingerpickChords";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { tabBpm } from "@/components/fingerpick/reader/useTabPlayback";

interface Args {
	/** The tab as it is being edited: what plays is the unsaved edit. */
	pattern: FingerpickPattern;
	/** The measure grid: its slot columns carry `data-col="<bar>:<slot>"`. */
	gridRef: React.RefObject<HTMLDivElement | null>;
}

/** The six strings, index 0 = high e. */
const STRINGS = [0, 1, 2, 3, 4, 5];

/** The column the playhead marks, set straight on the DOM so playing never re-renders the grid. */
const PLAYING_ATTR = "data-playing";

/**
 * Play from the cursor (#360): the editing tab, its repeats played out, from a
 * slot to the end, once, as the reader plays it (every note let ring), the slot
 * that sounds marked in the grid and its bar kept in view. An edit while it
 * plays stops it — the engine holds the tab it was started with. A previewed
 * note goes through the same engine, so it sounds as it will in the tab.
 */
export function useEditorPlayback({ pattern, gridRef }: Args) {
	const engine = useFingerpickAudioEngine();
	const expanded = useMemo(() => expandFingerpickPattern(pattern), [pattern]);
	const bpm = tabBpm(pattern);
	// Every slot's start on the played-out timeline — empty ones too, which no note event marks.
	const timeline = useMemo(
		() => ({ starts: computeSlotStarts(expanded.pattern, bpm), origins: expanded.originMeasureIndices }),
		[expanded, bpm],
	);

	// Preloaded once, so the first play is instant. `load` is new each render but one call is wanted.
	useEffect(() => {
		void engine.load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// What the engine was last started on: the tab, or one previewed note.
	const [playing, setPlaying] = useState<"tab" | "preview">("tab");
	const engineRef = useRef({ engine, playing, timeline });
	useEffect(() => {
		engineRef.current = { engine, playing, timeline };
	});
	// The edit that a preview follows must not cut the preview off.
	useEffect(() => {
		if (engineRef.current.playing === "tab") engineRef.current.engine.stop();
	}, [pattern]);

	const tabPlaying = engine.isPlaying && playing === "tab";
	// The sounding slot's column, followed from the engine's clock while the tab plays.
	useEffect(() => {
		if (!tabPlaying) return;
		let rafId = 0;
		let marked: Element | null = null;
		let lastBar = -1;
		function tick() {
			rafId = requestAnimationFrame(tick);
			const { engine, timeline } = engineRef.current;
			const progress = engine.getPlaybackProgress();
			const grid = gridRef.current;
			if (!progress || !grid) return;
			// Played once: past the end, while the last notes ring, the clock starts a pass that never plays.
			const at = progress.passIndex === 0 ? slotAtTime(timeline.starts, progress.elapsed) : null;
			const bar = at ? (timeline.origins[at.measureIndex] ?? at.measureIndex) : -1;
			const column = at ? grid.querySelector(`[data-col="${bar}:${at.slotIndex}"]`) : null;
			if (column === marked) return;
			marked?.removeAttribute(PLAYING_ATTR);
			column?.setAttribute(PLAYING_ATTR, "");
			marked = column;
			if (column && bar !== lastBar) {
				lastBar = bar;
				column.closest("[data-measure-id]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
			}
		}
		rafId = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(rafId);
			marked?.removeAttribute(PLAYING_ATTR);
		};
	}, [tabPlaying, gridRef]);

	function playFrom(target: SlotTarget) {
		setPlaying("tab");
		const bar = mapOriginToExpandedIndex(timeline.origins, target.measureIndex);
		const start = timeline.starts.find((s) => s.measureIndex === bar && s.slotIndex === target.slotIndex)?.time ?? 0;
		engine.play({ ...expanded.pattern, bpm }, { forceLetRing: true }, start);
	}

	/** One slot on its own, through the tab's own engine and capo. Stops the tab playing. */
	function previewSlot(frets: readonly (number | null)[], stroke?: Stroke) {
		if (!engine.isLoaded) return;
		setPlaying("preview");
		const strings = frets.map((fret) => ({ fret, muted: false })) as BeatSlot["strings"];
		engine.play(
			{
				...pattern,
				spans: undefined,
				bpm,
				measures: [{ id: "preview", slots: [{ id: "preview", duration: "quarter", strings, stroke }] }],
			},
			{ forceLetRing: true },
		);
	}

	/** One note, as it sounds in the tab: the dock's and the keyboard's preview. */
	function preview(stringIndex: number, fret: number) {
		previewSlot(STRINGS.map((i) => (i === stringIndex ? fret : null)));
	}

	/** A chord shape (index 0 = high e, "/" for a string it leaves out), rolled down like a quick strum. */
	function previewChord(hints: readonly FretHint[]) {
		previewSlot(
			hints.map((hint) => (hint === "/" ? null : hint)),
			"roll-down",
		);
	}

	return {
		isLoaded: engine.isLoaded,
		/** The tab is playing (not a previewed note). */
		isPlaying: tabPlaying,
		playFrom,
		preview,
		previewChord,
		stop: () => engine.stop(),
	};
}
