/**
 * Tuning the whole guitar down (#396): every string by the same amount, so every interval
 * between strings stays and every shape is held as before. It is a capo below the nut —
 * what sounds moves down by the tuning as a capo moves it up — so pitch reads through
 * `capo + tune` while the neck's positions read through the capo alone.
 *
 * Only whole-guitar tunings live here; a tuning that changes one string (Drop D) changes
 * the shapes themselves and is out of scope.
 */
import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";

export type Tuning = "standard" | "halfDown" | "wholeDown";

export const TUNINGS: readonly Tuning[] = ["standard", "halfDown", "wholeDown"];

/** Semitones every string sits from standard. */
export const TUNING_OFFSET: Readonly<Record<Tuning, number>> = { standard: 0, halfDown: -1, wholeDown: -2 };

export const TUNING_LABELS: Readonly<Record<Tuning, string>> = {
	standard: "Standard",
	halfDown: "Half step down",
	wholeDown: "Whole step down",
};

/** Device-local memory of the fretboard page's tuning; absent means standard. */
export const TUNING_STORAGE_KEY = "fretboardTuning";

/** A stored tuning read back; anything unknown is standard. */
export function parseTuning(raw: string | null): Tuning {
	return TUNINGS.find((t) => t === raw) ?? "standard";
}

// A tuning down is written with flats: E♭ A♭ D♭ G♭ B♭ e♭, never D♯ G♯.
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The open strings' names, low to high, the top one in lower case as the board writes e. */
export function stringNames(tuning: Tuning): string[] {
	return GUITAR_OPEN_MIDI.map((midi, i) => {
		const name = FLAT_NAMES[(((midi + TUNING_OFFSET[tuning]) % 12) + 12) % 12];
		return i === GUITAR_OPEN_MIDI.length - 1 ? name.toLowerCase() : name;
	});
}
