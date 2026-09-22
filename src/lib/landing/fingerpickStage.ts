import type { BeatSlot, Measure, StringFret, Technique } from "@/lib/fingerpickTypes";
import { seg } from "./progress";

/**
 * The fingerpick chapter's story: two bars of Travis-style picking over Am
 * and C appear note by note, the cursor plays through them, then the second
 * bar is looped and slowed down.
 */

const rest = (): StringFret => ({ fret: null, technique: null, tied: false, muted: false });
const note = (fret: number, technique: Technique = null): StringFret => ({
	fret,
	technique,
	tied: false,
	muted: false,
});

/** Strings are written high e first (index 0) in the fingerpick model. */
type Pick = { string: number; fret: number; technique?: Technique };

function slot(id: string, pick: Pick, chord?: BeatSlot["chord"]): BeatSlot {
	const strings = [rest(), rest(), rest(), rest(), rest(), rest()] as BeatSlot["strings"];
	strings[pick.string] = note(pick.fret, pick.technique ?? null);
	return { id, duration: "eighth", strings, ...(chord ? { chord } : {}) };
}

const E = 0, B = 1, G = 2, D = 3, A = 4;

export const FINGERPICK_DEMO_MEASURES: readonly Measure[] = [
	{
		id: "landing-m1",
		slots: [
			slot("landing-m1-1", { string: A, fret: 0 }, { root: "A", suffix: "minor" }),
			slot("landing-m1-2", { string: B, fret: 1 }),
			slot("landing-m1-3", { string: D, fret: 2 }),
			slot("landing-m1-4", { string: E, fret: 0 }),
			slot("landing-m1-5", { string: A, fret: 0 }),
			slot("landing-m1-6", { string: B, fret: 1 }),
			slot("landing-m1-7", { string: B, fret: 3, technique: "hammer-on" }),
			slot("landing-m1-8", { string: G, fret: 2 }),
		],
	},
	{
		id: "landing-m2",
		slots: [
			slot("landing-m2-1", { string: A, fret: 3 }, { root: "C", suffix: "major" }),
			slot("landing-m2-2", { string: B, fret: 1 }),
			slot("landing-m2-3", { string: D, fret: 2 }),
			slot("landing-m2-4", { string: D, fret: 4, technique: "slide-up" }),
			slot("landing-m2-5", { string: 5, fret: 3 }),
			slot("landing-m2-6", { string: G, fret: 2 }),
			slot("landing-m2-7", { string: G, fret: 0, technique: "pull-off" }),
			slot("landing-m2-8", { string: E, fret: 0 }),
		],
	},
];

export const FINGERPICK_DEMO_BPM_FROM = 90;
export const FINGERPICK_DEMO_BPM_TO = 60;
/** The measure the story loops, 0-indexed. */
export const FINGERPICK_DEMO_LOOP_MEASURE = 1;

const PHASE = {
	reveal: [0, 0.3],
	play: [0.3, 0.7],
	loopAt: 0.72,
	tempo: [0.76, 0.92],
} as const;

export interface FingerpickCursor {
	measureIndex: number;
	slotIndex: number;
	/** How far past the slot's note the cursor is, towards the next one. */
	within: number;
}

export interface FingerpickStage {
	/** How many slots, counted across the measures, have been written. */
	revealedSlots: number;
	cursor: FingerpickCursor | null;
	/** The measure the story is about right now: under the cursor, looped, or being written. */
	focusMeasure: number;
	/** Whether the loop is set on `FINGERPICK_DEMO_LOOP_MEASURE`. */
	loop: boolean;
	bpm: number;
	position: string;
}

export const FINGERPICK_DEMO_SLOT_COUNT = FINGERPICK_DEMO_MEASURES.reduce(
	(n, m) => n + m.slots.length,
	0,
);

/** Which measure a slot index counted across the measures lands in. */
export function measureOfSlot(flat: number): number {
	let i = flat;
	for (let m = 0; m < FINGERPICK_DEMO_MEASURES.length; m++) {
		if (i < FINGERPICK_DEMO_MEASURES[m].slots.length) return m;
		i -= FINGERPICK_DEMO_MEASURES[m].slots.length;
	}
	return FINGERPICK_DEMO_MEASURES.length - 1;
}

export function fingerpickStage(p: number): FingerpickStage {
	const total = FINGERPICK_DEMO_SLOT_COUNT;
	const revealedSlots = Math.round(seg(p, ...PHASE.reveal) * total);

	const playing = p > PHASE.play[0] && p < PHASE.play[1] + 0.02;
	const t = seg(p, ...PHASE.play) * total;
	const flat = Math.min(total - 1, Math.floor(t + 1e-9));
	const within = Math.min(1, t - flat);
	let measureIndex = 0;
	let slotIndex = flat;
	for (const m of FINGERPICK_DEMO_MEASURES) {
		if (slotIndex < m.slots.length) break;
		slotIndex -= m.slots.length;
		measureIndex++;
	}
	const cursor = playing ? { measureIndex, slotIndex, within } : null;

	const loop = p >= PHASE.loopAt;
	const bpm = Math.round(
		FINGERPICK_DEMO_BPM_FROM + (FINGERPICK_DEMO_BPM_TO - FINGERPICK_DEMO_BPM_FROM) * seg(p, ...PHASE.tempo),
	);

	const focusMeasure = cursor
		? cursor.measureIndex
		: loop
			? FINGERPICK_DEMO_LOOP_MEASURE
			: measureOfSlot(Math.max(0, revealedSlots - 1));

	const bar = String((cursor ? cursor.measureIndex : loop ? FINGERPICK_DEMO_LOOP_MEASURE : 0) + 1).padStart(2, "0");
	const beat = cursor ? Math.floor(cursor.slotIndex / 2) + 1 : 1;
	return {
		revealedSlots,
		cursor,
		focusMeasure,
		loop,
		bpm,
		position: loop ? `LOOP · BAR ${bar}` : `BAR ${bar} · BEAT ${beat} · PASS 01`,
	};
}
