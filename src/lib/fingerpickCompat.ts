import type {
	BeatSlot,
	FingerpickPattern,
	Link,
	Measure,
	NoteEffects,
	Span,
	SpanKind,
	StringFret,
	Technique,
} from "@/lib/fingerpickTypes";
import { FINGERPICK_SCHEMA_VERSION } from "@/lib/fingerpickTypes";
import { indexPattern } from "@/lib/fingerpickIndex";

/**
 * The bridge between the v1 technique fields (`technique`, `tied`,
 * `bendTarget`, the flags) and the v2 model (`link`, `effects`, `spans`).
 *
 * While the readers and writers move to v2 one at a time, a pattern carries
 * BOTH representations and this module keeps them in step: a v2-authored
 * note (one with `link` or `effects` set) is the source for its v1 fields, a
 * v1-only note is the source for its v2 fields, and `spans` versus the
 * `palmMute` / `letRing` flags likewise. Everything here is pure and
 * idempotent. The module goes away with the v1 fields.
 */

// ─── Single notes ────────────────────────────────────────────────────────────

/** `link` + `effects` as a v1 note writes them. Absent when the note has neither. */
export function noteToV2(sf: StringFret): { link?: Link; effects?: NoteEffects } {
	const out: { link?: Link; effects?: NoteEffects } = {};
	if (sf.tied) out.link = { kind: "tie" };
	else {
		switch (sf.technique) {
			case "hammer-on":
				out.link = { kind: "hammer" };
				break;
			case "pull-off":
				out.link = { kind: "pull" };
				break;
			case "slide-up":
			case "slide-down":
				out.link = { kind: "slide" };
				break;
		}
	}

	const effects: NoteEffects = {};
	const height = sf.bendTarget !== undefined && sf.bendTarget > 0 ? sf.bendTarget : 2;
	switch (sf.technique) {
		case "bend-full":
			effects.bend = { semitones: 2 };
			break;
		case "bend-half":
			effects.bend = { semitones: 1 };
			break;
		case "bend-quarter":
			effects.bend = { semitones: 0.5 };
			break;
		case "bend-release":
			effects.bend = { semitones: height, release: true };
			break;
		case "pre-bend":
			effects.bend = { semitones: height, pre: true };
			break;
		case "pre-bend-release":
			effects.bend = { semitones: height, pre: true, release: true };
			break;
		case "vibrato":
			effects.vibrato = {};
			break;
		case "vibrato-wide":
			effects.vibrato = { wide: true };
			break;
		case "vibrato-bar":
			effects.vibrato = { bar: true };
			break;
		case "tapping":
			effects.tap = true;
			break;
		case "trill":
			effects.trill = {};
			break;
		case "harmonic-natural":
			effects.harmonic = { type: "natural" };
			break;
		case "harmonic-artificial":
			effects.harmonic = { type: "artificial" };
			break;
		case "whammy-dive":
			effects.whammy = { kind: "dive" };
			break;
		case "whammy-pull":
			effects.whammy = { kind: "pull" };
			break;
		case "pick-scrape":
			effects.scrape = true;
			break;
		// "grace-note": a slot flag, not a note mark — dropped.
	}
	if (sf.staccato) effects.staccato = true;
	if (sf.accent) effects.accent = true;
	if (sf.ghostNote) effects.ghost = true;
	if (sf.tremoloPickingSpeed) effects.tremolo = { speed: sf.tremoloPickingSpeed };
	if (sf.pickStroke) effects.pick = { direction: sf.pickStroke };
	if (Object.keys(effects).length > 0) out.effects = effects;
	return out;
}

/** The v1 `technique` a bend writes, from its parameters. */
function bendTechnique(bend: NonNullable<NoteEffects["bend"]>): NonNullable<Technique> {
	if (bend.pre) return bend.release ? "pre-bend-release" : "pre-bend";
	if (bend.release) return "bend-release";
	if (bend.semitones === 0.5) return "bend-quarter";
	if (bend.semitones === 1) return "bend-half";
	return "bend-full";
}

/**
 * The v1 fields a v2 note writes. v1 holds one technique, so when a note
 * carries a link AND an effect the link wins, and among effects the first in
 * `bend > vibrato > harmonic > tap > trill > whammy > scrape` wins — the v1
 * readers never saw more than that anyway. `prevFret` tells a slide its
 * direction.
 */
export function noteFromV2(
	sf: StringFret,
	prevFret: number | null | undefined,
): Pick<StringFret, "technique" | "tied" | "bendTarget" | "staccato" | "accent" | "ghostNote" | "tremoloPickingSpeed" | "pickStroke"> {
	const out: ReturnType<typeof noteFromV2> = { technique: null, tied: false };
	const e = sf.effects ?? {};
	const link = sf.link;
	if (link?.kind === "tie") out.tied = true;
	else if (link?.kind === "hammer") out.technique = "hammer-on";
	else if (link?.kind === "pull") out.technique = "pull-off";
	else if (link?.kind === "slide") {
		const down = prevFret !== null && prevFret !== undefined && sf.fret !== null && sf.fret < prevFret;
		out.technique = down ? "slide-down" : "slide-up";
	} else if (e.bend) out.technique = bendTechnique(e.bend);
	else if (e.vibrato) out.technique = e.vibrato.bar ? "vibrato-bar" : e.vibrato.wide ? "vibrato-wide" : "vibrato";
	else if (e.harmonic) out.technique = e.harmonic.type === "natural" ? "harmonic-natural" : "harmonic-artificial";
	else if (e.tap) out.technique = "tapping";
	else if (e.trill) out.technique = "trill";
	else if (e.whammy) out.technique = e.whammy.kind === "dive" ? "whammy-dive" : "whammy-pull";
	else if (e.scrape) out.technique = "pick-scrape";

	if (e.bend) out.bendTarget = e.bend.semitones;
	if (e.staccato) out.staccato = true;
	if (e.accent) out.accent = true;
	if (e.ghost) out.ghostNote = true;
	if (e.tremolo) out.tremoloPickingSpeed = e.tremolo.speed;
	if (e.pick) out.pickStroke = e.pick.direction;
	return out;
}

/** A note has been written in v2 terms when either v2 field is present. */
export function isV2Note(sf: StringFret): boolean {
	return sf.link !== undefined || sf.effects !== undefined;
}

const V1_FIELDS = ["technique", "tied", "bendTarget", "staccato", "accent", "ghostNote", "tremoloPickingSpeed", "pickStroke"] as const;

function withoutV1Marks(sf: StringFret): StringFret {
	const copy: Record<string, unknown> = { ...sf };
	for (const k of V1_FIELDS) delete copy[k];
	return copy as unknown as StringFret;
}

/**
 * The v1 fields rewritten from the v2 ones, whatever the note held before —
 * what a v2 writer calls after changing `link` or `effects` (a note with
 * neither becomes a plain note). `prevFret` for a slide's direction.
 */
export function syncNoteFromV2(sf: StringFret, prevFret: number | null | undefined): StringFret {
	const v1 = noteFromV2(sf, prevFret);
	const base = withoutV1Marks(sf);
	const out: StringFret = { ...base, technique: v1.technique, tied: v1.tied };
	if (v1.bendTarget !== undefined) out.bendTarget = v1.bendTarget;
	if (v1.staccato) out.staccato = true;
	if (v1.accent) out.accent = true;
	if (v1.ghostNote) out.ghostNote = true;
	if (v1.tremoloPickingSpeed) out.tremoloPickingSpeed = v1.tremoloPickingSpeed;
	if (v1.pickStroke) out.pickStroke = v1.pickStroke;
	// An empty effects map means "no effects", same as absent; keep absent for tidiness.
	if (out.effects && Object.keys(out.effects).length === 0) delete out.effects;
	if (out.link === undefined) delete out.link;
	return out;
}

/** The v2 fields rewritten from the v1 ones — what a v1 writer calls after changing `technique` or `tied`. */
export function syncNoteFromV1(sf: StringFret): StringFret {
	const copy: StringFret = { ...sf };
	delete copy.link;
	delete copy.effects;
	const v2 = noteToV2(copy);
	if (v2.link) copy.link = v2.link;
	if (v2.effects) copy.effects = v2.effects;
	return copy;
}

/** One note with both representations in step; `prevFret` for a slide's direction. */
export function syncNote(sf: StringFret, prevFret: number | null | undefined): StringFret {
	if (isV2Note(sf)) return syncNoteFromV2(sf, prevFret);
	const v2 = noteToV2(sf);
	const out: StringFret = { ...sf };
	if (v2.link) out.link = v2.link;
	if (v2.effects) out.effects = v2.effects;
	return out;
}

/** Structural equality for the small plain objects notes and marks are made of. */
function same(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
	const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
	if (ka.length !== kb.length) return false;
	return ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** A span's id from what it is: deterministic, so a migration is reproducible. */
export function spanIdFor(kind: SpanKind, fromSlotId: string): string {
	return `${kind}:${fromSlotId}`;
}

// ─── Spans ↔ flags ───────────────────────────────────────────────────────────

const SPAN_FLAGS: { kind: SpanKind; flag: "palmMute" | "letRing" }[] = [
	{ kind: "palmMute", flag: "palmMute" },
	{ kind: "letRing", flag: "letRing" },
];

const played = (sf: StringFret) => sf.fret !== null || sf.muted;

function sameSet(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The spans a pattern's `palmMute` / `letRing` flags describe: one span per
 * run of consecutive slots whose flagged strings are the same set. A rest or
 * an unflagged slot ends a run; a grace slot is transparent. `strings` is
 * written only when the flagged strings are not every sounding string of
 * every slot in the run, so the common case stays small.
 */
export function spansFromFlags(pattern: FingerpickPattern): Span[] {
	const spans: Span[] = [];
	const slots: BeatSlot[] = pattern.measures.flatMap((m) => m.slots);
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
			const flagged = slot.isRest
				? []
				: slot.strings.flatMap((sf, i) => (played(sf) && sf[flag] === true ? [i] : []));
			if (flagged.length === 0) {
				close();
				continue;
			}
			const playedAll = slot.strings.flatMap((sf, i) => (played(sf) ? [i] : []));
			const coversAll = sameSet(flagged, playedAll);
			if (run && sameSet(run.set, flagged)) {
				run.to = slot.id;
				run.allPlayed = run.allPlayed && coversAll;
			} else {
				close();
				run = { from: slot.id, to: slot.id, set: flagged, allPlayed: coversAll };
			}
		}
		close();
	}
	return spans;
}

/** The pattern with its `palmMute` / `letRing` flags rewritten from `spans` (cleared where no span covers). */
export function flagsFromSpans(pattern: FingerpickPattern): FingerpickPattern {
	const index = indexPattern(pattern);
	let changed = false;
	const measures: Measure[] = pattern.measures.map((measure) => {
		let measureChanged = false;
		const slots = measure.slots.map((slot) => {
			const spans = index.spansAtSlot.get(slot.id) ?? [];
			let slotChanged = false;
			const strings = slot.strings.map((sf, i) => {
				const next: StringFret = { ...sf };
				delete next.palmMute;
				delete next.letRing;
				if (played(sf) && !slot.isRest) {
					for (const { kind, flag } of SPAN_FLAGS) {
						if (spans.some((s) => s.kind === kind && (s.strings === undefined || s.strings.includes(i)))) {
							next[flag] = true;
						}
					}
				}
				if (same(next, sf)) return sf;
				slotChanged = true;
				return next;
			}) as BeatSlot["strings"];
			if (!slotChanged) return slot;
			measureChanged = true;
			return { ...slot, strings };
		});
		if (!measureChanged) return measure;
		changed = true;
		return { ...measure, slots };
	});
	return changed ? { ...pattern, measures } : pattern;
}

// ─── Whole pattern ───────────────────────────────────────────────────────────

/**
 * Both representations in step across the pattern. Notes written in v2 drive
 * their v1 fields; v1-only notes get v2 fields. A pattern with `spans` drives
 * the flags; one without gets spans from its flags. Stamps `schemaVersion`.
 */
export function syncTechniqueFields(pattern: FingerpickPattern): FingerpickPattern {
	// Previous fret per string, for a slide's v1 direction.
	const prev: (number | null)[] = [null, null, null, null, null, null];
	let changed = false;
	const measures: Measure[] = pattern.measures.map((measure) => {
		let measureChanged = false;
		const slots = measure.slots.map((slot) => {
			let slotChanged = false;
			const strings = slot.strings.map((sf, i) => {
				const synced = syncNote(sf, prev[i]);
				if (!slot.isRest && !slot.isGraceNote && played(synced)) prev[i] = synced.fret;
				if (same(synced, sf)) return sf;
				slotChanged = true;
				return synced;
			}) as BeatSlot["strings"];
			if (!slotChanged) return slot;
			measureChanged = true;
			return { ...slot, strings };
		});
		if (!measureChanged) return measure;
		changed = true;
		return { ...measure, slots };
	});

	let out: FingerpickPattern = changed ? { ...pattern, measures } : pattern;
	if (out.spans === undefined) {
		// Flags are the source: derive the spans they describe.
		const spans = spansFromFlags(out);
		if (spans.length > 0) out = { ...out, spans };
	} else {
		// Spans are the source: the flags follow them.
		out = flagsFromSpans(out);
	}
	if (out.schemaVersion !== FINGERPICK_SCHEMA_VERSION) out = { ...out, schemaVersion: FINGERPICK_SCHEMA_VERSION };
	return out;
}

/** The pattern with every v1 technique field removed — what a v2-only reader sees. */
export function stripV1(pattern: FingerpickPattern): FingerpickPattern {
	return {
		...pattern,
		measures: pattern.measures.map((measure) => ({
			...measure,
			slots: measure.slots.map((slot) => ({
				...slot,
				strings: slot.strings.map((sf) => {
					const copy: Record<string, unknown> = { ...withoutV1Marks(sf) };
					delete copy.palmMute;
					delete copy.letRing;
					return copy as unknown as StringFret;
				}) as BeatSlot["strings"],
			})),
		})),
	};
}

/** The pattern with every v2 field removed — what the v1 readers see. */
export function stripV2(pattern: FingerpickPattern): FingerpickPattern {
	const out: FingerpickPattern = {
		...pattern,
		measures: pattern.measures.map((measure) => ({
			...measure,
			slots: measure.slots.map((slot) => {
				const next: BeatSlot = {
					...slot,
					strings: slot.strings.map((sf) => {
						const copy: StringFret = { ...sf };
						delete copy.link;
						delete copy.effects;
						return copy;
					}) as BeatSlot["strings"],
				};
				delete next.percussion;
				return next;
			}),
		})),
	};
	delete out.spans;
	delete out.schemaVersion;
	return out;
}
