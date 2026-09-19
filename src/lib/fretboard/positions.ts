/**
 * Position-only pitch facts about the neck: what a slot sounds, and where else
 * on the board the same note lives. No scale or chord knowledge — the board's
 * hover ring uses this for every slot, lit or dormant, so it must not depend
 * on what is drawn.
 */
import { GUITAR_OPEN_MIDI } from "@/lib/chordVoicingToMidi";

import { STRING_COUNT, type FretWindow } from "./types";

export interface SlotPosition {
	/** 0..5, low E to high e. */
	string: number;
	/** 0 = open string. */
	fret: number;
}

/** What a slot sounds: `{ string, fret }` plus its MIDI pitch. */
export interface SlotNote extends SlotPosition {
	midi: number;
}

/** MIDI pitch of a string/fret slot in standard tuning. */
export function slotMidi(string: number, fret: number): number {
	return GUITAR_OPEN_MIDI[string] + fret;
}

export interface RelatedSlots {
	/** Every other slot on the board that sounds exactly this pitch. */
	unison: readonly SlotPosition[];
	/** Every slot that sounds this pitch class in another octave. */
	octave: readonly SlotPosition[];
}

/**
 * Every slot on the board that sounds exactly `midi`, low string to high:
 * the positions to strike when that pitch is played elsewhere (the piano).
 */
export function slotsSounding(midi: number, window: FretWindow): SlotPosition[] {
	const slots: SlotPosition[] = [];
	for (let string = 0; string < STRING_COUNT; string++) {
		const fret = midi - GUITAR_OPEN_MIDI[string];
		if (fret >= window.fromFret && fret <= window.toFret) slots.push({ string, fret });
	}
	return slots;
}

/**
 * The slots a hover should ring: unisons (same pitch, another position) and
 * octaves (same pitch class, another octave), within the frets the board shows.
 * The slot itself is in neither list. Ordered low string to high, low fret to
 * high, so the result is stable for tests and for the DOM walk.
 */
export function relatedSlots(string: number, fret: number, window: FretWindow): RelatedSlots {
	const midi = slotMidi(string, fret);
	const pitchClass = ((midi % 12) + 12) % 12;
	const unison: SlotPosition[] = [];
	const octave: SlotPosition[] = [];
	for (let s = 0; s < STRING_COUNT; s++) {
		for (let f = window.fromFret; f <= window.toFret; f++) {
			if (s === string && f === fret) continue;
			const other = slotMidi(s, f);
			if (other === midi) unison.push({ string: s, fret: f });
			else if (((other % 12) + 12) % 12 === pitchClass) octave.push({ string: s, fret: f });
		}
	}
	return { unison, octave };
}
