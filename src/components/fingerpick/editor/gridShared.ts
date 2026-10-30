// What the measure grid's cells show, and whether the pointer hovers. Nothing
// here holds state of its own.

import { useSyncExternalStore } from "react";
import {
	isBrush,
	strokeDirection,
	type Duration,
	type NoteEffects,
	type StringFret,
	type Stroke,
} from "@/lib/fingerpickTypes";
import { EFFECT_STACK_ORDER, techniqueDef } from "@/lib/techniqueRegistry";
import { BEND_HEIGHT_LABEL } from "@/lib/techniqueEditDefaults";

// Short names under each slot column, so its note value reads at a glance. A
// rest keeps its real duration, so it shows the value it stands in for.
export const DURATION_ABBREV: Record<Duration, string> = {
	whole: "W",
	half: "H",
	quarter: "Q",
	"dotted-quarter": "Q.",
	eighth: "E",
	"dotted-eighth": "E.",
	"eighth-triplet": "E³",
	sixteenth: "S",
	"sixteenth-triplet": "S³",
	"32nd": "T",
};

// A swept slot's wash runs from a faint alpha at the string the sweep starts on
// to a deeper one at the string it ends on, so the column shows the direction.
// Rolls wash amber and brushes green, so the two kinds read apart at a glance.
const SWEEP_WASH_MIN = 0.08;
const SWEEP_WASH_MAX = 0.34;
export function sweepWashBg(stroke: Stroke, stringIndex: number): string {
	// stringIndex 0 = high e. A down sweep travels low → high, so the high e is deepest.
	const progress = strokeDirection(stroke) === "up" ? stringIndex / 5 : (5 - stringIndex) / 5;
	const alpha = SWEEP_WASH_MIN + (SWEEP_WASH_MAX - SWEEP_WASH_MIN) * progress;
	// The hues and a dark theme's damping are the page's (`--te-brush`, `--te-roll`, `--te-sweep-k` in tabEdit.css).
	const pct = `calc(${Math.round(alpha * 100)}% * var(--te-sweep-k, 1))`;
	return `color-mix(in srgb, var(${isBrush(stroke) ? "--te-brush, #22c55e" : "--te-roll, #f59e0b"}) ${pct}, transparent)`;
}

// Fine-pointer (mouse/trackpad) capability, read via useSyncExternalStore so it
// tracks the device without a setState-in-effect.
function subscribeFinePointer(callback: () => void): () => void {
	if (typeof window === "undefined" || !window.matchMedia) return () => {};
	const mq = window.matchMedia("(pointer: fine)");
	mq.addEventListener("change", callback);
	return () => mq.removeEventListener("change", callback);
}
const getFinePointerSnapshot = (): boolean =>
	typeof window !== "undefined" && !!window.matchMedia ? window.matchMedia("(pointer: fine)").matches : true;
// SSR/first paint assumes desktop; hydration corrects it from the real media query.
const getFinePointerServerSnapshot = (): boolean => true;

/** True when the pointer hovers: the shape's hints and the row controls then wait for a hover. */
export function useHasFinePointer(): boolean {
	return useSyncExternalStore(subscribeFinePointer, getFinePointerSnapshot, getFinePointerServerSnapshot);
}

export function cellDisplay(sf: StringFret): string {
	if (sf.muted) return "x";
	if (sf.fret !== null) return String(sf.fret);
	return "–";
}

function bendGlyph(bend: NonNullable<NoteEffects["bend"]>): string {
	const height = bend.semitones === 2 ? "" : (BEND_HEIGHT_LABEL[bend.semitones] ?? String(bend.semitones));
	const up = bend.pre ? "PB" : `${height}⤴`;
	return bend.release ? `${up}⤵` : up;
}

/**
 * The marks a cell shows in its corner: the link's glyph (a tie is drawn as
 * an arc instead), then each effect's, in stacking order. From the registry,
 * except a bend's height and a wide vibrato, which are the parameters' own.
 */
export function cellGlyph(sf: StringFret): string {
	const parts: string[] = [];
	if (sf.link && sf.link.kind !== "tie") parts.push(techniqueDef(sf.link.kind)?.glyph ?? "");
	const effects = sf.effects;
	if (effects) {
		for (const kind of EFFECT_STACK_ORDER) {
			if (kind === "bend" && effects.bend) parts.push(bendGlyph(effects.bend));
			else if (kind === "vibrato" && effects.vibrato) parts.push(effects.vibrato.wide ? "≈" : "~");
			else if (effects[kind]) parts.push(techniqueDef(kind)?.glyph ?? "");
		}
	}
	return parts.filter(Boolean).join("");
}
