/**
 * Which of the fretboard page's optional cards are shown: the piano and the circle of
 * fifths. A device-local choice, like the sound switch; the neck itself is never hidden.
 */
export const PANELS_STORAGE_KEY = "fretboardPanels";

export interface FretboardPanels {
	piano: boolean;
	circle: boolean;
}

export const DEFAULT_PANELS: FretboardPanels = { piano: true, circle: true };

/** A stored choice read back; anything missing or malformed falls back to shown. */
export function parsePanels(raw: string | null): FretboardPanels {
	if (!raw) return DEFAULT_PANELS;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) return DEFAULT_PANELS;
		const stored = value as Record<string, unknown>;
		return {
			piano: typeof stored.piano === "boolean" ? stored.piano : DEFAULT_PANELS.piano,
			circle: typeof stored.circle === "boolean" ? stored.circle : DEFAULT_PANELS.circle,
		};
	} catch {
		return DEFAULT_PANELS;
	}
}
