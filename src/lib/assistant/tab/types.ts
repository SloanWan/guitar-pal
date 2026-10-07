import type { Duration, FingerpickPattern } from "@/lib/fingerpickTypes";
import type { ChordRef } from "@/lib/strumPatterns";
import type { ValidationIssue } from "@/lib/tabImport";

/**
 * What the tab assistant offers, before anything is written. The fingerpick
 * counterpart of `AssistantProposal`: a whole pattern rather than a bar of
 * strokes, because a tab is frets on six strings and a rhythm, and the honest
 * thing is to open it in the editor for the player to check.
 */
export interface TabProposal {
	name: string;
	pattern: FingerpickPattern;
	/** The tempo the player named; null when the pattern's is a default. */
	bpm: number | null;
	/** The chords the bars were fretted from, in order. Unresolved words are not here. */
	chords: ChordRef[];
	/**
	 * What could not be carried over as asked — the same object a pasted or
	 * scanned tab reports through, so the editor shows every source alike.
	 */
	warnings: ValidationIssue[];
}

/**
 * One beat of a bar as planned: the strings to pluck (fingerpick order,
 * 0 = high e), or a rest, and how long it lasts. Both sentence forms — a pick
 * order and a style word — reduce to a list of these before any fret is chosen.
 */
export type PlanSlot = {
	strings: number[] | null;
	/** The thumb on the chord's root string as well — `根` in the order — decided per bar, from the chord. */
	root?: true;
	/** A hold as typed (`_` or `^`): the slot before it goes on. Folded away before a bar is written. */
	hold?: true;
	/** This slot carries the slot before it on rather than striking it again: written as a tied note. */
	tied?: true;
	/**
	 * Frets written in the sentence, one per entry of `strings`. Present only
	 * for notes typed as string-and-fret pairs; every other plan takes its
	 * frets from the chord.
	 */
	frets?: (number | "x")[];
	duration: Duration;
};

/** A chord word as the player wrote it, and what the library made of it. */
export interface ChordWord {
	text: string;
	/** Null when the library has nothing for the word: its bar keeps its place and sounds nothing. */
	chord: ChordRef | null;
}
