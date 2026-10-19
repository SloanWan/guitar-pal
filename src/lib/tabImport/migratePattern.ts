import type { FingerpickPattern, Link, NoteEffects, Span, SpanKind } from "@/lib/fingerpickTypes";
import { FINGERPICK_SCHEMA_VERSION } from "@/lib/fingerpickTypes";
import { spanIdFor } from "@/lib/fingerpickIndex";

/**
 * A stored pattern of any schema version as the current one. Runs before the
 * validator on every read path — Supabase rows, localStorage, shares,
 * every importer — so nothing downstream sees a v1 shape.
 *
 * v1 (no `schemaVersion`) wrote one `technique` per note, `tied`,
 * `bendTarget` and per-note flags (`palmMute`, `letRing`, `staccato`,
 * `accent`, `ghostNote`, `tremoloPickingSpeed`, `pickStroke`). Those become
 * `link`, `effects` and `spans`: a palm-mute / let-ring run of consecutive
 * flagged notes is one span, across barlines. A note already written with
 * `link` or `effects` keeps them; its v1 fields are dropped. Slide direction
 * is dropped — the frets say it. A column of `x` stays x's: each is a slap on
 * its string already. An import draft may still mark `palmMute` /
 * `letRing` on its notes (a model has no slot ids to anchor a span on); they
 * are folded the same way.
 *
 * Tolerant and total: anything that is not shaped like a pattern is returned
 * as it came, for the validator to describe.
 */
export function migratePattern(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
	const obj = raw as Record<string, unknown>;
	if (!Array.isArray(obj.measures)) return raw;
	if (obj.schemaVersion === FINGERPICK_SCHEMA_VERSION) return raw;
	if (!obj.measures.every(isMeasureLike)) return raw;

	// A draft's slots may have no ids yet; a span has to anchor on one, so they get theirs here.
	const withIds = (obj.measures as LegacyMeasure[]).map((measure) => ({
		...measure,
		slots: measure.slots.map((slot) => (typeof slot.id === "string" && slot.id ? slot : { ...slot, id: crypto.randomUUID() })),
	}));
	const measures = withIds.map((measure) => ({
		...measure,
		slots: measure.slots.map((slot) => ({ ...slot, strings: slot.strings.map(migrateNote) })),
	}));
	const spans: Span[] = [...(Array.isArray(obj.spans) ? (obj.spans as Span[]) : []), ...spansFromFlags(withIds)];
	const out: Record<string, unknown> = { ...obj, schemaVersion: FINGERPICK_SCHEMA_VERSION, measures };
	if (spans.length > 0) out.spans = spans;
	return out;
}

// ─── The v1 shape, as far as the migration reads it ──────────────────────────

interface LegacyNote {
	fret?: unknown;
	muted?: unknown;
	link?: unknown;
	effects?: unknown;
	technique?: unknown;
	tied?: unknown;
	bendTarget?: unknown;
	palmMute?: unknown;
	letRing?: unknown;
	staccato?: unknown;
	accent?: unknown;
	ghostNote?: unknown;
	tremoloPickingSpeed?: unknown;
	pickStroke?: unknown;
}

interface LegacySlot {
	id?: unknown;
	isRest?: boolean;
	isGraceNote?: boolean;
	strings: LegacyNote[];
	[key: string]: unknown;
}

interface LegacyMeasure {
	slots: LegacySlot[];
	[key: string]: unknown;
}

function isMeasureLike(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false;
	const slots = (value as { slots?: unknown }).slots;
	return (
		Array.isArray(slots) &&
		slots.every(
			(slot) =>
				typeof slot === "object" &&
				slot !== null &&
				Array.isArray((slot as { strings?: unknown }).strings) &&
				(slot as { strings: unknown[] }).strings.length === 6 &&
				(slot as { strings: unknown[] }).strings.every((sf) => typeof sf === "object" && sf !== null),
		)
	);
}

/** The height a v1 bend technique names, or the written `bendTarget` for the variants that take one. */
function bendSemitones(technique: string, bendTarget: unknown): number {
	if (technique === "bend-quarter") return 0.5;
	if (technique === "bend-half") return 1;
	if (technique === "bend-full") return 2;
	return typeof bendTarget === "number" && bendTarget > 0 ? bendTarget : 2;
}

/** A v1 note's `link` and `effects`. */
export function legacyNoteMarks(note: LegacyNote): { link?: Link; effects?: NoteEffects } {
	const out: { link?: Link; effects?: NoteEffects } = {};
	const effects: NoteEffects = {};
	const technique = typeof note.technique === "string" ? note.technique : null;
	if (note.tied === true) out.link = { kind: "tie" };
	else if (technique === "hammer-on") out.link = { kind: "hammer" };
	else if (technique === "pull-off") out.link = { kind: "pull" };
	else if (technique === "slide-up" || technique === "slide-down") out.link = { kind: "slide" };
	else if (technique !== null) {
		if (technique.startsWith("bend") || technique.startsWith("pre-bend")) {
			const bend: NonNullable<NoteEffects["bend"]> = { semitones: bendSemitones(technique, note.bendTarget) };
			if (technique.startsWith("pre-bend")) bend.pre = true;
			if (technique.endsWith("release")) bend.release = true;
			effects.bend = bend;
		} else if (technique === "vibrato") effects.vibrato = {};
		else if (technique === "vibrato-wide") effects.vibrato = { wide: true };
		else if (technique === "vibrato-bar") effects.vibrato = { bar: true };
		else if (technique === "tapping") effects.tap = true;
		else if (technique === "trill") effects.trill = {};
		else if (technique === "harmonic-natural") effects.harmonic = { type: "natural" };
		else if (technique === "harmonic-artificial") effects.harmonic = { type: "artificial" };
		else if (technique === "whammy-dive") effects.whammy = { kind: "dive" };
		else if (technique === "whammy-pull") effects.whammy = { kind: "pull" };
		else if (technique === "pick-scrape") effects.scrape = true;
		// grace-note: a slot flag now, nothing on the note.
	}
	if (note.staccato === true) effects.staccato = true;
	if (note.accent === true) effects.accent = true;
	if (note.ghostNote === true) effects.ghost = true;
	if (note.tremoloPickingSpeed === "8th" || note.tremoloPickingSpeed === "16th" || note.tremoloPickingSpeed === "32nd") {
		effects.tremolo = { speed: note.tremoloPickingSpeed };
	}
	if (note.pickStroke === "down" || note.pickStroke === "up") effects.pick = { direction: note.pickStroke };
	if (Object.keys(effects).length > 0) out.effects = effects;
	return out;
}

/** The note with only its v2 fields: a note written in v2 keeps them, a v1 note gets them from its marks. */
function migrateNote(note: LegacyNote): Record<string, unknown> {
	const out: Record<string, unknown> = { fret: note.fret ?? null, muted: note.muted === true };
	const written = note.link !== undefined || note.effects !== undefined;
	const marks = written ? { link: note.link, effects: note.effects } : legacyNoteMarks(note);
	if (marks.link !== undefined && marks.link !== null) out.link = marks.link;
	if (marks.effects !== undefined && marks.effects !== null) out.effects = marks.effects;
	return out;
}

const SPAN_FLAGS: { kind: SpanKind; flag: "palmMute" | "letRing" }[] = [
	{ kind: "palmMute", flag: "palmMute" },
	{ kind: "letRing", flag: "letRing" },
];

const played = (sf: LegacyNote) => (typeof sf.fret === "number") || sf.muted === true;

function sameSet(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The spans a pattern's `palmMute` / `letRing` flags describe: one span per
 * run of consecutive slots the flag covers. A run whose every slot is flagged
 * on all its sounding strings goes on through any slot flagged the same way,
 * whatever strings those are (a bracket over a melody that moves between
 * strings); a run flagged on some strings only goes on while the set stays
 * the same, and writes `strings`. A rest or an unflagged slot ends a run; a
 * grace slot is transparent.
 */
export function spansFromFlags(measures: readonly LegacyMeasure[]): Span[] {
	const spans: Span[] = [];
	const slots = measures.flatMap((m) => m.slots);
	for (const { kind, flag } of SPAN_FLAGS) {
		let run: { from: string; to: string; set: number[]; allPlayed: boolean } | null = null;
		const close = () => {
			if (!run) return;
			const span: Span = { id: spanIdFor(kind, run.from), kind, from: run.from, to: run.to };
			if (!run.allPlayed) span.strings = run.set;
			spans.push(span);
			run = null;
		};
		for (const slot of slots) {
			if (slot.isGraceNote) continue;
			const flagged = slot.isRest ? [] : slot.strings.flatMap((sf, i) => (played(sf) && sf[flag] === true ? [i] : []));
			if (flagged.length === 0) {
				close();
				continue;
			}
			const playedAll = slot.strings.flatMap((sf, i) => (played(sf) ? [i] : []));
			const coversAll = sameSet(flagged, playedAll);
			const extend = run !== null && (run.allPlayed ? coversAll : sameSet(run.set, flagged));
			const id = String(slot.id);
			if (run && extend) {
				run.to = id;
				run.set = flagged;
			} else {
				close();
				run = { from: id, to: id, set: flagged, allPlayed: coversAll };
			}
		}
		close();
	}
	return spans;
}

/** `migratePattern` typed for a caller that already holds a pattern object. */
export function migrateLoadedPattern(pattern: FingerpickPattern): FingerpickPattern {
	return migratePattern(pattern) as FingerpickPattern;
}
