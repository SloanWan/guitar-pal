import type {
	BeatSlot,
	Duration,
	FingerpickPattern,
	Measure,
	StringFret,
	Technique,
} from "@/lib/fingerpickTypes";
import type { ValidationIssue } from "./types";
import { isRenderSupported } from "./techniqueSupport";
import { normalizeCapo } from "@/lib/strumProgressions";
import {
	effectsSchema,
	isEffectKind,
	linkSchema,
	percussionSchema,
	spanSchema,
	supportOf,
} from "@/lib/techniqueRegistry";
import { syncTechniqueFields } from "@/lib/fingerpickCompat";
import type { NoteEffects, Percussion, Span, Stroke } from "@/lib/fingerpickTypes";

const ALL_STROKES = new Set<Stroke>(["roll-down", "roll-up", "brush-down", "brush-up"]);

// ─── Duration helpers ─────────────────────────────────────────────────────────

const ALL_DURATIONS = new Set<Duration>([
	"whole", "half", "quarter", "dotted-quarter", "eighth", "dotted-eighth",
	"eighth-triplet", "sixteenth", "sixteenth-triplet", "32nd",
]);

// Legacy patterns encoded a rest as `duration: "rest"` (a fixed quarter-weight value).
// A rest is now a per-slot `isRest` flag over a real duration; the validator converts
// a legacy rest to a quarter-duration slot flagged isRest (matching the old weight).
const LEGACY_REST = "rest";

function isValidDuration(v: unknown): v is Duration {
	return typeof v === "string" && ALL_DURATIONS.has(v as Duration);
}

// Ticks in 32nd-note units for durations with clean integer values.
const DURATION_TICKS: Array<[Duration, number]> = [
	["whole",          32],
	["half",           16],
	["dotted-quarter", 12],
	["quarter",         8],
	["dotted-eighth",   6],
	["eighth",          4],
	["sixteenth",       2],
	["32nd",            1],
];

function measureCapacityTicks(ts: [number, number]): number {
	// Each quarter note = 8 ticks; scale by denominator vs quarter.
	return Math.round((ts[0] * 32) / ts[1]);
}

function computeUniformDuration(slotCount: number, ts: [number, number]): Duration {
	const capacity = measureCapacityTicks(ts);
	const perSlot = capacity / slotCount;
	const match = DURATION_TICKS.find(([, ticks]) => ticks === perSlot);
	return match ? match[0] : "eighth";
}

// ─── Technique helper ─────────────────────────────────────────────────────────

const ALL_TECHNIQUES = new Set<NonNullable<Technique>>([
	"hammer-on", "pull-off", "slide-up", "slide-down", "bend-full", "bend-half",
	"bend-quarter", "bend-release", "pre-bend", "pre-bend-release", "vibrato",
	"vibrato-wide", "vibrato-bar", "tapping", "trill", "harmonic-natural",
	"harmonic-artificial", "whammy-dive", "whammy-pull", "pick-scrape", "grace-note",
]);

function isKnownTechnique(v: unknown): v is NonNullable<Technique> {
	return typeof v === "string" && ALL_TECHNIQUES.has(v as NonNullable<Technique>);
}

// ─── Default constructors ─────────────────────────────────────────────────────

function silentStringFret(): StringFret {
	return { fret: null, technique: null, tied: false, muted: false };
}

function makeDefaultStrings(): BeatSlot["strings"] {
	return [
		silentStringFret(), silentStringFret(), silentStringFret(),
		silentStringFret(), silentStringFret(), silentStringFret(),
	];
}

function makeRestSlot(): BeatSlot {
	return {
		id: crypto.randomUUID(),
		duration: "quarter",
		isRest: true,
		strings: makeDefaultStrings(),
	};
}

// ─── Per-field validators ─────────────────────────────────────────────────────

function validateStringFret(
	raw: unknown,
	path: string,
	warnings: ValidationIssue[],
): StringFret {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return silentStringFret();
	}

	const obj = raw as Record<string, unknown>;

	// Fret
	let fret: number | null = null;
	if (obj.fret !== null && obj.fret !== undefined) {
		if (typeof obj.fret === "number") {
			const clamped = Math.max(0, Math.min(24, obj.fret));
			if (clamped !== obj.fret) {
				warnings.push({
					code: "FRET_CLAMPED",
					path: `${path}.fret`,
					message: `fret ${obj.fret} out of range [0, 24], clamped to ${clamped}`,
					original: obj.fret,
					repairedTo: clamped,
				});
			}
			fret = clamped;
		}
		// non-number, non-null fret → treat as silent (no warning — "malformed → silent default")
	}

	// Technique
	let technique: Technique = null;
	if (obj.technique !== null && obj.technique !== undefined) {
		if (isKnownTechnique(obj.technique)) {
			if (!isRenderSupported(obj.technique)) {
				warnings.push({
					code: "UNSUPPORTED_TECHNIQUE",
					path: `${path}.technique`,
					message: `technique "${obj.technique}" detected but unsupported, dropped to stay renderable`,
					original: obj.technique,
					repairedTo: null,
				});
			} else {
				technique = obj.technique;
			}
		}
		// unknown string or non-string → null, no warning
	}

	const tied   = obj.tied   === true;
	const muted  = obj.muted  === true;

	const result: StringFret = { fret, technique, tied, muted };

	if (typeof obj.bendTarget === "number")        result.bendTarget = obj.bendTarget;
	if (obj.palmMute === true)                     result.palmMute = true;
	if (obj.letRing  === true)                     result.letRing  = true;
	if (obj.staccato === true)                     result.staccato = true;
	if (obj.accent   === true)                     result.accent   = true;
	if (obj.ghostNote === true)                    result.ghostNote = true;
	if (obj.tremoloPickingSpeed === "8th"  ||
	    obj.tremoloPickingSpeed === "16th" ||
	    obj.tremoloPickingSpeed === "32nd")
		result.tremoloPickingSpeed = obj.tremoloPickingSpeed as "8th" | "16th" | "32nd";
	if (obj.pickStroke === "down" || obj.pickStroke === "up")
		result.pickStroke = obj.pickStroke as "down" | "up";

	// ── v2: link + effects, each kind by its registry schema ──────────────
	if (obj.link !== undefined && obj.link !== null) {
		const parsed = linkSchema.safeParse(obj.link);
		if (parsed.success) result.link = parsed.data as StringFret["link"];
		else {
			warnings.push({
				code: "INVALID_LINK",
				path: `${path}.link`,
				message: `link is not one of the known kinds with valid parameters, dropped`,
				original: obj.link,
				repairedTo: null,
			});
		}
	}
	if (typeof obj.effects === "object" && obj.effects !== null && !Array.isArray(obj.effects)) {
		const known: Record<string, unknown> = {};
		for (const [kind, value] of Object.entries(obj.effects as Record<string, unknown>)) {
			if (value === undefined || value === null) continue;
			if (!isEffectKind(kind)) {
				warnings.push({
					code: "UNKNOWN_EFFECT",
					path: `${path}.effects.${kind}`,
					message: `effect "${kind}" is not one this app knows, dropped`,
					original: kind,
					repairedTo: null,
				});
				continue;
			}
			known[kind] = value;
		}
		const parsed = effectsSchema.safeParse(known);
		if (parsed.success) {
			const effects = parsed.data as NoteEffects;
			for (const kind of Object.keys(effects)) {
				if (!supportOf(kind).render) {
					warnings.push({
						code: "UNSUPPORTED_TECHNIQUE",
						path: `${path}.effects.${kind}`,
						message: `effect "${kind}" is kept but not drawn yet`,
						original: kind,
					});
				}
			}
			if (Object.keys(effects).length > 0) result.effects = effects;
		} else {
			// Keep the kinds that parse on their own; drop and name the rest.
			const kept: Record<string, unknown> = {};
			for (const [kind, value] of Object.entries(known)) {
				const one = effectsSchema.safeParse({ [kind]: value });
				if (one.success) kept[kind] = value;
				else {
					warnings.push({
						code: "INVALID_EFFECT",
						path: `${path}.effects.${kind}`,
						message: `effect "${kind}" has invalid parameters, dropped`,
						original: value,
						repairedTo: null,
					});
				}
			}
			if (Object.keys(kept).length > 0) result.effects = kept as NoteEffects;
		}
	}

	return result;
}

function validateStrings(
	raw: unknown,
	path: string,
	warnings: ValidationIssue[],
): BeatSlot["strings"] {
	const arr = Array.isArray(raw) ? raw : [];

	if (!Array.isArray(raw) || raw.length !== 6) {
		if (Array.isArray(raw)) {
			warnings.push({
				code: "INVALID_STRINGS_TUPLE",
				path: `${path}.strings`,
				message: `strings must have exactly 6 entries, got ${raw.length}`,
				original: raw.length,
				repairedTo: 6,
			});
		}
	}

	const result: StringFret[] = [];
	for (let i = 0; i < 6; i++) {
		result.push(validateStringFret(arr[i], `${path}.strings[${i}]`, warnings));
	}
	return result as BeatSlot["strings"];
}

function validateSlot(
	raw: unknown,
	path: string,
	warnings: ValidationIssue[],
	uniformDuration: Duration | null,
): BeatSlot {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		warnings.push({
			code: "INVALID_SLOT",
			path,
			message: "slot entry is not an object, replaced with default slot",
			original: raw,
			repairedTo: "default slot",
		});
		return {
			id: crypto.randomUUID(),
			duration: uniformDuration ?? "eighth",
			strings: makeDefaultStrings(),
		};
	}

	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === "string" && obj.id ? obj.id : crypto.randomUUID();

	// A legacy `duration: "rest"` slot becomes a quarter-duration rest (isRest flag).
	const legacyRest = obj.duration === LEGACY_REST;
	let duration: Duration;
	if (uniformDuration !== null) {
		duration = uniformDuration;
	} else if (legacyRest) {
		duration = "quarter";
	} else if (isValidDuration(obj.duration)) {
		duration = obj.duration;
	} else {
		duration = "eighth";
		warnings.push({
			code: "INVALID_DURATION",
			path: `${path}.duration`,
			message: `Invalid or missing duration "${String(obj.duration)}", defaulted to "eighth"`,
			original: obj.duration,
			repairedTo: "eighth",
		});
	}

	const strings = validateStrings(obj.strings, path, warnings);
	const slot: BeatSlot = { id, duration, strings };
	if (obj.isGraceNote === true) slot.isGraceNote = true;
	if (legacyRest || obj.isRest === true) slot.isRest = true;
	// A chord change marked on the slot: kept when it names a chord, dropped
	// silently otherwise — a mark is a label, and a malformed label is no label.
	const chord = validateChord(obj.chord);
	if (chord) slot.chord = chord;
	// A sweep is kept as written; a stored pattern (a share, a library row)
	// carries them and dropping one would silently flatten a rolled chord.
	if (typeof obj.stroke === "string" && ALL_STROKES.has(obj.stroke as Stroke)) slot.stroke = obj.stroke as Stroke;
	if (obj.percussion !== undefined && obj.percussion !== null) {
		const parsed = percussionSchema.safeParse(obj.percussion);
		if (!parsed.success) {
			warnings.push({
				code: "INVALID_PERCUSSION",
				path: `${path}.percussion`,
				message: "percussion is not a known hit with valid parameters, dropped",
				original: obj.percussion,
				repairedTo: null,
			});
		} else if (slot.stroke) {
			warnings.push({
				code: "PERCUSSION_WITH_STROKE",
				path: `${path}.percussion`,
				message: "a slot is either swept or hit, not both; the hit was dropped",
				original: obj.percussion,
				repairedTo: null,
			});
		} else {
			slot.percussion = parsed.data as Percussion;
		}
	}
	return slot;
}

/** Duplicate slot ids get fresh ones: spans anchor on them, so two slots sharing one is ambiguous. */
function uniqueSlotIds(measures: Measure[], warnings: ValidationIssue[]): void {
	const seen = new Set<string>();
	measures.forEach((measure, m) => {
		measure.slots.forEach((slot, i) => {
			if (seen.has(slot.id)) {
				const fresh = crypto.randomUUID();
				warnings.push({
					code: "DUPLICATE_SLOT_ID",
					path: `measures[${m}].slots[${i}].id`,
					message: `slot id "${slot.id}" is used twice, the later slot was given a new id`,
					original: slot.id,
					repairedTo: fresh,
				});
				measure.slots[i] = { ...slot, id: fresh };
			}
			seen.add(measure.slots[i].id);
		});
	});
}

/** Spans whose anchors exist, in order; the rest are dropped with a reason. */
function validateSpans(raw: unknown, measures: Measure[], warnings: ValidationIssue[]): Span[] | undefined {
	if (raw === undefined || raw === null) return undefined;
	if (!Array.isArray(raw)) {
		warnings.push({ code: "INVALID_SPANS", path: "spans", message: "spans is not an array, dropped", original: raw });
		return undefined;
	}
	const order = new Map<string, number>();
	measures.forEach((measure) => measure.slots.forEach((slot) => order.set(slot.id, order.size)));
	const spans: Span[] = [];
	const ids = new Set<string>();
	raw.forEach((entry, i) => {
		const parsed = spanSchema.safeParse(entry);
		if (!parsed.success) {
			warnings.push({ code: "INVALID_SPAN", path: `spans[${i}]`, message: "span is malformed, dropped", original: entry });
			return;
		}
		const span = parsed.data as Span;
		const from = order.get(span.from);
		const to = order.get(span.to);
		if (from === undefined || to === undefined) {
			warnings.push({
				code: "INVALID_SPAN",
				path: `spans[${i}]`,
				message: `span "${span.id}" anchors on a slot that does not exist, dropped`,
				original: entry,
			});
			return;
		}
		if (from > to) {
			warnings.push({
				code: "INVALID_SPAN",
				path: `spans[${i}]`,
				message: `span "${span.id}" ends before it starts, dropped`,
				original: entry,
			});
			return;
		}
		if (ids.has(span.id)) span.id = crypto.randomUUID();
		ids.add(span.id);
		spans.push(span);
	});
	return spans;
}

function validateChord(raw: unknown): BeatSlot["chord"] | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const obj = raw as Record<string, unknown>;
	if (typeof obj.root !== "string" || obj.root === "" || typeof obj.suffix !== "string") return null;
	const voicingId = typeof obj.voicingId === "string" ? obj.voicingId : null;
	return { root: obj.root, suffix: obj.suffix, voicingId };
}

function validateMeasure(
	raw: unknown,
	measureIdx: number,
	timeSignature: [number, number],
	warnings: ValidationIssue[],
): Measure {
	const path = `measures[${measureIdx}]`;

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		warnings.push({
			code: "INVALID_MEASURE",
			path,
			message: "measure entry is not an object, replaced with rest measure",
			original: raw,
		});
		return { id: crypto.randomUUID(), slots: [makeRestSlot()] };
	}

	const obj = raw as Record<string, unknown>;
	const id = typeof obj.id === "string" && obj.id ? obj.id : crypto.randomUUID();

	if (!Array.isArray(obj.slots) || obj.slots.length === 0) {
		warnings.push({
			code: "EMPTY_SLOTS",
			path: `${path}.slots`,
			message: "slots missing or empty, inserted rest slot",
		});
		return { id, slots: [makeRestSlot()] };
	}

	// Determine if ALL slots lack a valid duration (type-a image case). A legacy
	// "rest" counts as carrying a duration so an all-rest measure is not treated as
	// the no-durations image case.
	const allLackDuration = obj.slots.every((s) => {
		const d = (s as Record<string, unknown>)?.duration;
		return !isValidDuration(d) && d !== LEGACY_REST;
	});

	let uniformDur: Duration | null = null;
	if (allLackDuration) {
		uniformDur = computeUniformDuration(obj.slots.length, timeSignature);
		warnings.push({
			code: "UNIFORM_DURATION_ASSIGNED",
			path: `${path}.slots`,
			message: `All slots lack duration; assigned uniform "${uniformDur}" for ${obj.slots.length} slots in ${timeSignature[0]}/${timeSignature[1]}`,
			repairedTo: uniformDur,
		});
	}

	const slots = obj.slots.map((rawSlot, slotIdx) =>
		validateSlot(rawSlot, `${path}.slots[${slotIdx}]`, warnings, uniformDur),
	);

	// Repeat barlines are kept as written — a stored pattern (a share, a
	// handoff) carries them, and dropping them would silently shorten the
	// piece. Anything but the well-typed flag is treated as absent.
	const measure: Measure = { id, slots };
	if (obj.repeatStart === true) measure.repeatStart = true;
	if (obj.repeatEnd === true) {
		measure.repeatEnd = true;
		const times = obj.repeatTimes;
		if (typeof times === "number" && Number.isInteger(times) && times >= 2) {
			measure.repeatTimes = times;
		}
	}
	return measure;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function validateFingerpickPattern(raw: unknown): {
	pattern: FingerpickPattern | null;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
} {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		errors.push({
			code: "NOT_AN_OBJECT",
			path: "",
			message: "Input is not an object",
			original: raw,
		});
		return { pattern: null, errors, warnings };
	}

	const obj = raw as Record<string, unknown>;

	if (!Array.isArray(obj.measures)) {
		errors.push({
			code: "MEASURES_NOT_ARRAY",
			path: "measures",
			message: "measures field is not an array",
			original: obj.measures,
		});
		return { pattern: null, errors, warnings };
	}

	if (obj.measures.length === 0) {
		errors.push({
			code: "ZERO_MEASURES",
			path: "measures",
			message: "measures array is empty",
		});
		return { pattern: null, errors, warnings };
	}

	const id = typeof obj.id === "string" && obj.id ? obj.id : crypto.randomUUID();
	const name = typeof obj.name === "string" && obj.name ? obj.name : "Imported Pattern";
	const description =
		typeof obj.description === "string" ? obj.description : undefined;

	// An absent tempo is not a defect. ASCII tab carries no bpm at all, so a
	// draft parsed from one arrives without the field and is given the default
	// in silence. A bpm that is *present* and unusable is a repair, and says so.
	let bpm: number;
	if (typeof obj.bpm === "number" && obj.bpm > 0 && Number.isFinite(obj.bpm)) {
		bpm = obj.bpm;
	} else {
		bpm = 80;
		if (obj.bpm !== undefined && obj.bpm !== null) {
			warnings.push({
				code: "INVALID_BPM",
				path: "bpm",
				message: "bpm is not a usable tempo, defaulted to 80",
				original: obj.bpm,
				repairedTo: 80,
			});
		}
	}

	let timeSignature: [number, number];
	const ts = obj.timeSignature;
	if (
		Array.isArray(ts) &&
		ts.length >= 2 &&
		typeof ts[0] === "number" && ts[0] > 0 &&
		typeof ts[1] === "number" && ts[1] > 0
	) {
		timeSignature = [ts[0], ts[1]];
	} else {
		timeSignature = [4, 4];
		warnings.push({
			code: "INVALID_TIME_SIGNATURE",
			path: "timeSignature",
			message: "timeSignature missing or invalid, defaulted to [4, 4]",
			original: ts,
			repairedTo: [4, 4],
		});
	}

	// MUST preserve measure count so repeat directives stay valid.
	const measures = (obj.measures as unknown[]).map((rawMeasure, i) =>
		validateMeasure(rawMeasure, i, timeSignature, warnings),
	);

	uniqueSlotIds(measures, warnings);

	const pattern: FingerpickPattern = { id, name, description, bpm, timeSignature, measures };
	// Same fold as `normalizeLoadedPattern`: a capo is kept only when it is a
	// real fret, so no pattern leaves here with one the UI cannot show.
	const capo = normalizeCapo(obj.capo);
	if (capo > 0) pattern.capo = capo;
	const spans = validateSpans(obj.spans, measures, warnings);
	if (spans !== undefined) pattern.spans = spans;
	// Both technique representations in step, whichever the input wrote.
	return { pattern: syncTechniqueFields(pattern), errors, warnings };
}
