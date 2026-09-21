import { useEffect, useState } from "react";
import type { ChordView } from "@/components/strum/StepGrid";
import { isPitchLabelStyle, type PitchLabelStyle } from "@/lib/fingerpickPitch";
import {
	SCROLL_SPEED_DEFAULT,
	clampScrollSpeed,
	readScrollSpeed,
	writeScrollSpeed,
} from "@/components/useAutoScroll";

export {
	SCROLL_SPEED_DEFAULT,
	SCROLL_SPEED_MAX,
	SCROLL_SPEED_MIN,
	clampScrollSpeed,
} from "@/components/useAutoScroll";

// Device-local preferences for the fingerpick page — not synced to the account.

// Remembers the last-viewed pattern id so a page refresh reopens it instead of
// defaulting back to the first preset.
const LAST_PATTERN_KEY = "lastFingerpickPatternId";
// Whether the chord line shows names or shapes, and how wide a shape is drawn.
const CHORD_VIEW_KEY = "fingerpickChordView";
const CHORD_SHAPE_WIDTH_KEY = "fingerpickChordShapeWidth";
// Whether fret numbers outside the chord shape are coloured, in the shape view.
const OFF_SHAPE_KEY = "fingerpickOffShape";
// Auto-scroll speed lives with the hook that creeps (useAutoScroll): the strum
// progression card reads the same preference.
// Editor beat labels in a compound meter: the two real beats ("1 + a 2 + a",
// the default) or the six eighths ("1 2 3 4 5 6"), a teaching aid.
const COUNT_EIGHTHS_KEY = "fingerpickCountEighths";
// Whether the sounding pitch is written under every fret, and in which style.
const PITCH_LABELS_KEY = "fingerpickPitchLabels";
const PITCH_LABEL_STYLE_KEY = "fingerpickPitchLabelStyle";
export const PITCH_LABEL_STYLE_DEFAULT: PitchLabelStyle = "scientific";

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
	/** Editor beat labels in 6/8 and 12/8: count the eighths 1–6 instead of "1 + a 2 + a". */
	countEighths: boolean;
	setCountEighths: (on: boolean) => void;
	/** Write the sounding pitch (capo folded in) under every fret on the reading page. */
	pitchLabelsOn: boolean;
	setPitchLabelsOn: (on: boolean) => void;
	pitchLabelStyle: PitchLabelStyle;
	setPitchLabelStyle: (style: PitchLabelStyle) => void;
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
	const [countEighths, setCountEighthsState] = useState(false);
	const [pitchLabelsOn, setPitchLabelsOnState] = useState(false);
	const [pitchLabelStyle, setPitchLabelStyleState] =
		useState<PitchLabelStyle>(PITCH_LABEL_STYLE_DEFAULT);

	useEffect(() => {
		let storedView: string | null = null;
		let storedWidth: string | null = null;
		let storedOffShape: string | null = null;
		let storedCountEighths: string | null = null;
		let storedPitchLabels: string | null = null;
		let storedPitchStyle: string | null = null;
		const storedSpeed = readScrollSpeed();
		try {
			storedView = localStorage.getItem(CHORD_VIEW_KEY);
			storedWidth = localStorage.getItem(CHORD_SHAPE_WIDTH_KEY);
			storedOffShape = localStorage.getItem(OFF_SHAPE_KEY);
			storedCountEighths = localStorage.getItem(COUNT_EIGHTHS_KEY);
			storedPitchLabels = localStorage.getItem(PITCH_LABELS_KEY);
			storedPitchStyle = localStorage.getItem(PITCH_LABEL_STYLE_KEY);
		} catch {
			// storage unavailable — the defaults it is
		}
		// Deferred, as the other storage restores are: a one-shot sync after
		// mount, not a state change inside the render that scheduled it.
		queueMicrotask(() => {
			if (storedView === "diagram") setChordViewState("diagram");
			if (storedWidth !== null) setChordShapeWidthState(clampShapeWidth(Number(storedWidth)));
			if (storedOffShape === "off") setOffShapeOnState(false);
			setScrollSpeedState(storedSpeed);
			if (storedCountEighths === "on") setCountEighthsState(true);
			if (storedPitchLabels === "on") setPitchLabelsOnState(true);
			if (isPitchLabelStyle(storedPitchStyle)) setPitchLabelStyleState(storedPitchStyle);
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
		writeScrollSpeed(speed);
	}
	function setCountEighths(on: boolean) {
		setCountEighthsState(on);
		writeItem(COUNT_EIGHTHS_KEY, on ? "on" : "off");
	}
	function setPitchLabelsOn(on: boolean) {
		setPitchLabelsOnState(on);
		writeItem(PITCH_LABELS_KEY, on ? "on" : "off");
	}
	function setPitchLabelStyle(style: PitchLabelStyle) {
		setPitchLabelStyleState(style);
		writeItem(PITCH_LABEL_STYLE_KEY, style);
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
		countEighths,
		setCountEighths,
		pitchLabelsOn,
		setPitchLabelsOn,
		pitchLabelStyle,
		setPitchLabelStyle,
	};
}
