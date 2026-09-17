import { useEffect, useState } from "react";
import type { ChordView } from "@/components/strum/StepGrid";

// Device-local preferences for the fingerpick page — not synced to the account.

// Remembers the last-viewed pattern id so a page refresh reopens it instead of
// defaulting back to the first preset.
const LAST_PATTERN_KEY = "lastFingerpickPatternId";
// Whether the chord line shows names or shapes, and how wide a shape is drawn.
const CHORD_VIEW_KEY = "fingerpickChordView";
const CHORD_SHAPE_WIDTH_KEY = "fingerpickChordShapeWidth";
// Whether fret numbers outside the chord shape are coloured, in the shape view.
const OFF_SHAPE_KEY = "fingerpickOffShape";
// Auto-scroll: how fast the tab creeps upward while reading along, in px/s.
const SCROLL_SPEED_KEY = "fingerpickScrollSpeed";

export const SCROLL_SPEED_MIN = 4;
export const SCROLL_SPEED_MAX = 60;
export const SCROLL_SPEED_DEFAULT = 16;
export function clampScrollSpeed(raw: number): number {
	if (!Number.isFinite(raw)) return SCROLL_SPEED_DEFAULT;
	return Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, Math.round(raw)));
}

/** Width range of the shape strip over a chord symbol, in px. */
export const CHORD_SHAPE_WIDTH_MIN = 40;
export const CHORD_SHAPE_WIDTH_MAX = 140;
export const CHORD_SHAPE_WIDTH_DEFAULT = 64;
export function clampShapeWidth(raw: number): number {
	if (!Number.isFinite(raw)) return CHORD_SHAPE_WIDTH_DEFAULT;
	return Math.min(CHORD_SHAPE_WIDTH_MAX, Math.max(CHORD_SHAPE_WIDTH_MIN, Math.round(raw)));
}

function writeItem(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore unavailable/blocked storage
	}
}

/**
 * The pattern to reopen: a `?pattern=<id>` deep link (e.g. from /home) takes
 * priority over the device-local last-viewed id. Null when neither is there or
 * storage is unavailable.
 */
export function readLastPatternId(): string | null {
	try {
		const queryId =
			typeof window !== "undefined"
				? new URLSearchParams(window.location.search).get("pattern")
				: null;
		return queryId ?? localStorage.getItem(LAST_PATTERN_KEY);
	} catch {
		return null;
	}
}

export function writeLastPatternId(id: string): void {
	writeItem(LAST_PATTERN_KEY, id);
}

export interface FingerpickPrefs {
	/** Chord line: names, or the shapes to hold. */
	chordView: ChordView;
	setChordView: (view: ChordView) => void;
	chordShapeWidth: number;
	setChordShapeWidth: (raw: number) => void;
	offShapeOn: boolean;
	setOffShapeOn: (on: boolean) => void;
	scrollSpeed: number;
	setScrollSpeed: (raw: number) => void;
}

/**
 * The remembered view settings. Read back from storage on mount (not in the
 * initializers — the server render has no storage to read); every setter
 * clamps, applies and persists.
 */
export function useFingerpickPrefs(): FingerpickPrefs {
	const [chordView, setChordViewState] = useState<ChordView>("name");
	const [chordShapeWidth, setChordShapeWidthState] = useState(CHORD_SHAPE_WIDTH_DEFAULT);
	const [offShapeOn, setOffShapeOnState] = useState(true);
	const [scrollSpeed, setScrollSpeedState] = useState(SCROLL_SPEED_DEFAULT);

	useEffect(() => {
		let storedView: string | null = null;
		let storedWidth: string | null = null;
		let storedOffShape: string | null = null;
		let storedSpeed: string | null = null;
		try {
			storedView = localStorage.getItem(CHORD_VIEW_KEY);
			storedWidth = localStorage.getItem(CHORD_SHAPE_WIDTH_KEY);
			storedOffShape = localStorage.getItem(OFF_SHAPE_KEY);
			storedSpeed = localStorage.getItem(SCROLL_SPEED_KEY);
		} catch {
			// storage unavailable — the defaults it is
		}
		// Deferred, as the other storage restores are: a one-shot sync after
		// mount, not a state change inside the render that scheduled it.
		queueMicrotask(() => {
			if (storedView === "diagram") setChordViewState("diagram");
			if (storedWidth !== null) setChordShapeWidthState(clampShapeWidth(Number(storedWidth)));
			if (storedOffShape === "off") setOffShapeOnState(false);
			if (storedSpeed !== null) setScrollSpeedState(clampScrollSpeed(Number(storedSpeed)));
		});
	}, []);

	function setChordView(view: ChordView) {
		setChordViewState(view);
		writeItem(CHORD_VIEW_KEY, view);
	}
	function setChordShapeWidth(raw: number) {
		const width = clampShapeWidth(raw);
		setChordShapeWidthState(width);
		writeItem(CHORD_SHAPE_WIDTH_KEY, String(width));
	}
	function setOffShapeOn(on: boolean) {
		setOffShapeOnState(on);
		writeItem(OFF_SHAPE_KEY, on ? "on" : "off");
	}
	function setScrollSpeed(raw: number) {
		const speed = clampScrollSpeed(raw);
		setScrollSpeedState(speed);
		writeItem(SCROLL_SPEED_KEY, String(speed));
	}

	return {
		chordView,
		setChordView,
		chordShapeWidth,
		setChordShapeWidth,
		offShapeOn,
		setOffShapeOn,
		scrollSpeed,
		setScrollSpeed,
	};
}
