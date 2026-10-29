import { useEffect, useMemo, useRef, useState } from "react";
import type { SlotTarget } from "@/lib/fingerpickEdit";
import { expandFingerpickPattern } from "@/lib/fingerpickRepeats";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { useFingerpickAudioEngine } from "@/components/fingerpick/useFingerpickAudioEngine";
import { usePlaybackCursor } from "@/components/fingerpick/usePlaybackCursor";
import type { MeasureRow } from "@/components/fingerpick/fingerpickLayout";
import { tabBpm } from "@/components/fingerpick/reader/useTabPlayback";

interface Args {
	/** The tab as it is being edited: what plays is the unsaved edit. */
	pattern: FingerpickPattern;
	rows: MeasureRow[];
	/** The box the playhead is drawn in. */
	viewerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Play from the cursor (#360): the editing tab, its repeats played out, from a
 * slot to the end, once, as the reader plays it (every note let ring), with the
 * reader's playhead moving over the stave. An edit while it plays stops it — the
 * engine holds the tab it was started with. A previewed note goes through the
 * same engine, so it sounds as it will in the tab.
 */
export function useEditorPlayback({ pattern, rows, viewerRef }: Args) {
	const engine = useFingerpickAudioEngine();
	const expanded = useMemo(() => expandFingerpickPattern(pattern), [pattern]);
	const bpm = tabBpm(pattern);
	const cursor = usePlaybackCursor({
		tabViewerRef: viewerRef,
		expanded,
		bpm,
		rows,
		isPlaying: engine.isPlaying,
		getPlaybackProgress: engine.getPlaybackProgress,
	});

	// Preloaded once, so the first play is instant. `load` is new each render but one call is wanted.
	useEffect(() => {
		void engine.load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// What the engine was last started on: the tab, or one previewed note.
	const [playing, setPlaying] = useState<"tab" | "preview">("tab");
	const engineRef = useRef({ engine, playing });
	useEffect(() => {
		engineRef.current = { engine, playing };
	});
	// The edit that a preview follows must not cut the preview off.
	useEffect(() => {
		if (engineRef.current.playing === "tab") engineRef.current.engine.stop();
	}, [pattern]);

	function playFrom(target: SlotTarget) {
		setPlaying("tab");
		engine.play({ ...expanded.pattern, bpm }, { forceLetRing: true }, cursor.startOffsetFor(target));
	}

	/** One note, as it sounds in the tab: the dock's and the keyboard's preview. Stops the tab playing. */
	function preview(stringIndex: number, fret: number) {
		if (!engine.isLoaded) return;
		setPlaying("preview");
		const strings = pattern.measures[0].slots[0].strings.map((_, i) => ({
			fret: i === stringIndex ? fret : null,
			muted: false,
		})) as FingerpickPattern["measures"][number]["slots"][number]["strings"];
		engine.play(
			{
				...pattern,
				spans: undefined,
				bpm,
				measures: [{ id: "preview", slots: [{ id: "preview", duration: "quarter", strings }] }],
			},
			{ forceLetRing: true },
		);
	}

	return {
		isLoaded: engine.isLoaded,
		/** The tab is playing (not a previewed note). */
		isPlaying: engine.isPlaying && playing === "tab",
		playFrom,
		preview,
		stop: () => {
			engine.stop();
			cursor.resetCursor();
		},
		cursor,
	};
}
