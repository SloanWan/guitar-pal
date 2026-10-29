import { isPitchLabelStyle, type PitchLabelStyle } from "@/lib/fingerpickPitch";
import { isDockLabelStyle, type DockLabelStyle } from "@/lib/fretboardDock";
import { useStoredState, type StoredCodec } from "@/components/useStoredState";

// Device-local preferences for the fingerpick pages — not synced to the account.
// The keys and their stored forms are the ones the page has always written, so a
// preference set before survives.

/** Whether the chord line shows names or the shapes to hold. */
export type ChordLineView = "name" | "diagram";

const LAST_PATTERN_KEY = "lastFingerpickPatternId";
export const PITCH_LABEL_STYLE_DEFAULT: PitchLabelStyle = "scientific";

/** Width range of the shape strip over a chord symbol, in px. */
export const CHORD_SHAPE_WIDTH_MIN = 40;
export const CHORD_SHAPE_WIDTH_MAX = 140;
export const CHORD_SHAPE_WIDTH_DEFAULT = 64;
export function clampShapeWidth(raw: number): number {
	if (!Number.isFinite(raw)) return CHORD_SHAPE_WIDTH_DEFAULT;
	return Math.min(CHORD_SHAPE_WIDTH_MAX, Math.max(CHORD_SHAPE_WIDTH_MIN, Math.round(raw)));
}

/** Auto-scroll's creep speed, in px/s. */
export const SCROLL_SPEED_MIN = 4;
export const SCROLL_SPEED_MAX = 60;
export const SCROLL_SPEED_DEFAULT = 16;
export function clampScrollSpeed(raw: number): number {
	if (!Number.isFinite(raw)) return SCROLL_SPEED_DEFAULT;
	return Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, Math.round(raw)));
}

const ON_OFF: StoredCodec<boolean> = {
	parse: (raw) => (raw === "on" ? true : raw === "off" ? false : null),
	format: (on) => (on ? "on" : "off"),
};
const CHORD_VIEW: StoredCodec<ChordLineView> = {
	parse: (raw) => (raw === "name" || raw === "diagram" ? raw : null),
	format: (view) => view,
};
const PITCH_STYLE: StoredCodec<PitchLabelStyle> = {
	parse: (raw) => (isPitchLabelStyle(raw) ? raw : null),
	format: (style) => style,
};
function clamped(clamp: (raw: number) => number): StoredCodec<number> {
	return { parse: (raw) => clamp(Number(raw)), format: String };
}
/** Unset (null) until the player chooses: the device's own default then. */
const CHOSEN_ON_OFF: StoredCodec<boolean | null> = {
	parse: ON_OFF.parse,
	format: (on) => (on ? "on" : "off"),
};
const DOCK_LABELS: StoredCodec<DockLabelStyle> = {
	parse: (raw) => (isDockLabelStyle(raw) ? raw : null),
	format: (style) => style,
};
const SHAPE_WIDTH = clamped(clampShapeWidth);
const SCROLL_SPEED = clamped(clampScrollSpeed);

/**
 * The pattern to reopen: a `?pattern=<id>` deep link (e.g. from /home) takes
 * priority over the device-local last-viewed id. Null when neither is there or
 * storage is unavailable. Called from effects only, so the window is there.
 */
export function readLastPatternId(): string | null {
	try {
		return new URLSearchParams(window.location.search).get("pattern") ?? localStorage.getItem(LAST_PATTERN_KEY);
	} catch {
		return null;
	}
}

export function writeLastPatternId(id: string): void {
	try {
		localStorage.setItem(LAST_PATTERN_KEY, id);
	} catch {
		// remembered for this visit only
	}
}

export interface FingerpickPrefs {
	chordView: ChordLineView;
	setChordView: (view: ChordLineView) => void;
	chordShapeWidth: number;
	setChordShapeWidth: (raw: number) => void;
	/** Shape view: colour the fret numbers that are not part of the chord shape. */
	offShapeOn: boolean;
	setOffShapeOn: (on: boolean) => void;
	/** Shape view: write the chord's tones (C E G) beside each shape. */
	chordTonesOn: boolean;
	setChordTonesOn: (on: boolean) => void;
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
	/**
	 * The editor moves the cursor on a slot after a note is written. Null until
	 * the player sets it: on for a phone, off for a desktop (`autoAdvanceOn`).
	 */
	autoAdvance: boolean | null;
	setAutoAdvance: (on: boolean) => void;
	/** What the editor's fretboard writes on its frets: the numbers, or the notes they sound. */
	dockLabels: DockLabelStyle;
	setDockLabels: (style: DockLabelStyle) => void;
	/** The editor's fretboard is open (not folded to its header). */
	dockOpen: boolean;
	setDockOpen: (open: boolean) => void;
}

/** Whether the editor advances after a note: the player's choice, else on for a phone. */
export function autoAdvanceOn(choice: boolean | null, phone: boolean): boolean {
	return choice ?? phone;
}

/** The remembered view settings; every setter clamps, applies and stores. */
export function useFingerpickPrefs(): FingerpickPrefs {
	const [chordView, setChordView] = useStoredState("fingerpickChordView", "name", CHORD_VIEW);
	const [chordShapeWidth, setWidth] = useStoredState("fingerpickChordShapeWidth", CHORD_SHAPE_WIDTH_DEFAULT, SHAPE_WIDTH);
	const [offShapeOn, setOffShapeOn] = useStoredState("fingerpickOffShape", true, ON_OFF);
	const [chordTonesOn, setChordTonesOn] = useStoredState("fingerpickChordTones", false, ON_OFF);
	const [scrollSpeed, setSpeed] = useStoredState("fingerpickScrollSpeed", SCROLL_SPEED_DEFAULT, SCROLL_SPEED);
	const [countEighths, setCountEighths] = useStoredState("fingerpickCountEighths", false, ON_OFF);
	const [pitchLabelsOn, setPitchLabelsOn] = useStoredState("fingerpickPitchLabels", false, ON_OFF);
	const [pitchLabelStyle, setPitchLabelStyle] = useStoredState("fingerpickPitchLabelStyle", PITCH_LABEL_STYLE_DEFAULT, PITCH_STYLE);
	const [autoAdvance, setAutoAdvance] = useStoredState<boolean | null>("fingerpickAutoAdvance", null, CHOSEN_ON_OFF);
	const [dockLabels, setDockLabels] = useStoredState<DockLabelStyle>("fingerpickDockLabels", "fret", DOCK_LABELS);
	const [dockOpen, setDockOpen] = useStoredState("fingerpickDockOpen", true, ON_OFF);
	return {
		chordView,
		setChordView,
		chordShapeWidth,
		setChordShapeWidth: (raw) => setWidth(clampShapeWidth(raw)),
		offShapeOn,
		setOffShapeOn,
		chordTonesOn,
		setChordTonesOn,
		scrollSpeed,
		setScrollSpeed: (raw) => setSpeed(clampScrollSpeed(raw)),
		countEighths,
		setCountEighths,
		pitchLabelsOn,
		setPitchLabelsOn,
		pitchLabelStyle,
		setPitchLabelStyle,
		autoAdvance,
		setAutoAdvance,
		dockLabels,
		setDockLabels,
		dockOpen,
		setDockOpen,
	};
}
