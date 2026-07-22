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

// ─── Duration helpers ─────────────────────────────────────────────────────────

const ALL_DURATIONS = new Set<Duration>([
	"whole", "half", "quarter", "dotted-quarter", "eighth", "dotted-eighth",
	"eighth-triplet", "sixteenth", "sixteenth-triplet", "32nd", "rest",
]);

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

// ─── Measure-capacity check ─────────────────────────────────────────────────────

// Tick values scaled ×3 so triplet durations (8/3 and 4/3 ticks in raw 32nd-note
// units) sum as exact integers, sidestepping floating-point drift. Reuses
// DURATION_TICKS for the eight integer-clean durations — the same single tick
// scale — and only supplies the three durations DURATION_TICKS structurally
// omits (the two triplets, which are non-integer, and "rest").
const TICKS_SCALE = 3;

function durationTicksX3(d: Duration): number {
	switch (d) {
		case "eighth-triplet":    return 8;  // 1/3 beat = 8/3 ticks → 8 at ×3
		case "sixteenth-triplet": return 4;  // 1/6 beat = 4/3 ticks → 4 at ×3
		case "rest":              return 24; // 1 beat = 8 ticks → 24 at ×3
		default: {
			const clean = DURATION_TICKS.find(([dur]) => dur === d);
			return clean ? clean[1] * TICKS_SCALE : 0;
		}
	}
}

const fmtTicks = (n: number): number => Number(n.toFixed(3));

/**
 * Emit a WARNING (never an error) when a measure's slot durations do not sum to
 * the bar capacity implied by the time signature — both under- and over-full.
 * Purely advisory: it never nulls the pattern. Run AFTER uniform-duration
 * assignment so it sees final durations. Grace-note slots are excluded because
 * they carry a nominal duration but do not consume bar time (see
 * fingerpickScheduler: grace notes do not advance currentTime).
 */
function checkMeasureCapacity(
	slots: BeatSlot[],
	measureIdx: number,
	timeSignature: [number, number],
	warnings: ValidationIssue[],
): void {
	const filledX3 = slots.reduce(
		(sum, slot) => (slot.isGraceNote ? sum : sum + durationTicksX3(slot.duration)),
		0,
	);
	const capacityX3 = measureCapacityTicks(timeSignature) * TICKS_SCALE;
	if (filledX3 === capacityX3) return;

	const observed = fmtTicks(filledX3 / TICKS_SCALE);
	const expected = fmtTicks(capacityX3 / TICKS_SCALE);
	const short = filledX3 < capacityX3;
	const delta = fmtTicks(Math.abs(capacityX3 - filledX3) / TICKS_SCALE);

	let message =
		`Measure durations sum to ${observed} of ${expected} 32nd-note units ` +
		`(${short ? "short" : "long"} by ${delta}) for ${timeSignature[0]}/${timeSignature[1]}`;
	if (measureIdx === 0 && short) {
		message += "; a short first measure may be an intentional pickup (anacrusis)";
	}

	warnings.push({
		code: "MEASURE_CAPACITY_MISMATCH",
		path: `measures[${measureIdx}]`,
		message,
	});
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
	return { id: crypto.randomUUID(), duration: "rest", strings: makeDefaultStrings() };
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

	let duration: Duration;
	if (uniformDuration !== null) {
		duration = uniformDuration;
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
	return slot;
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

	// Determine if ALL slots lack a valid duration (type-a image case).
	const allLackDuration = obj.slots.every(
		(s) => !isValidDuration((s as Record<string, unknown>)?.duration),
	);

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

	// Advisory only — runs after uniform-duration assignment so it sees final
	// durations. Never nulls the pattern.
	checkMeasureCapacity(slots, measureIdx, timeSignature, warnings);

	return { id, slots };
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

	let bpm: number;
	if (typeof obj.bpm === "number" && obj.bpm > 0 && Number.isFinite(obj.bpm)) {
		bpm = obj.bpm;
	} else {
		bpm = 80;
		warnings.push({
			code: "INVALID_BPM",
			path: "bpm",
			message: "bpm missing or invalid, defaulted to 80",
			original: obj.bpm,
			repairedTo: 80,
		});
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

	const pattern: FingerpickPattern = { id, name, description, bpm, timeSignature, measures };
	return { pattern, errors, warnings };
}
