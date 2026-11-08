import { timingSafeEqual } from "node:crypto";
import { parseRhythm } from "@/lib/assistant/strum/parseRhythm";
import { getChord, getChordIndex } from "@/lib/chordsData";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import type { ChordVoicing } from "@/lib/chordVoicing";
import { chordFretHints, type FretHint } from "@/lib/fingerpickChords";
import type { ChordRef } from "@/lib/strumPatterns";
import { selectRefVoicing } from "@/lib/strumBars";
import {
	chordToneChords,
	hasChordNames,
	normalizeImportedPattern,
	resolveDraftChordNames,
	resolveDraftChordTones,
} from "@/lib/tabImport";
import type { RepeatDirective, ValidationIssue } from "@/lib/tabImport";

/**
 * The one validator, reachable by the book service (#202, decision 4).
 *
 * The errors/warnings contract for drafts is implemented in TypeScript —
 * `parseRhythm` for strum rhythms, the `tabImport` chain for tabs — and the
 * Python service calls it here rather than carrying a second copy that would
 * drift. Internal: only the compose network reaches it, and every request
 * has to carry `BOOK_SERVICE_INTERNAL_SECRET`. No session, no user data.
 */

export const dynamic = "force-dynamic";

export interface ValidateStrumRequest {
	kind: "strum";
	rhythm: string;
	beatsPerBar?: number;
}

export interface ValidateTabRequest {
	kind: "tab";
	/**
	 * The draft as the importers write it. A slot may name its chord as the
	 * page prints it (`chordName: "Am"`, #427): it is resolved here, and a name
	 * the library does not hold comes back as an `UNKNOWN_CHORD` warning with
	 * the word as its `original`. A string may be a rhythm pattern's ×
	 * (`{ fret: null, chordTone: true }`, #439): it is fretted here from the
	 * chord in effect at its slot.
	 */
	draft: unknown;
	repeats?: RepeatDirective[];
}

export type ValidateRequest = ValidateStrumRequest | ValidateTabRequest;

/** Both kinds answer in one shape, so the service's repair loop reads one thing. */
export interface ValidateResponse {
	ok: boolean;
	errors: ValidationIssue[];
	warnings: ValidationIssue[];
	/** The tab as the editor will hold it, when it validated; absent for strum. */
	pattern?: unknown;
}

function json(body: unknown, status: number): Response {
	return Response.json(body, { status });
}

function secretMatches(given: string | null): boolean {
	const expected = process.env.BOOK_SERVICE_INTERNAL_SECRET;
	if (!expected || !given) return false;
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

function isRepeat(value: unknown): value is RepeatDirective {
	if (typeof value !== "object" || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		Array.isArray(r.range) &&
		r.range.length === 2 &&
		r.range.every((n) => Number.isInteger(n)) &&
		Number.isInteger(r.times)
	);
}

export function validateStrum(request: ValidateStrumRequest): ValidateResponse {
	const result = parseRhythm(request.rhythm, { beatsPerBar: request.beatsPerBar });
	if (!result.ok) {
		return {
			ok: false,
			errors: result.errors.map((e) => ({
				code: e.code,
				path: e.index === undefined ? "rhythm" : `rhythm[${e.index}]`,
				message: e.message,
			})),
			warnings: [],
		};
	}
	const warnings: ValidationIssue[] = [];
	if (result.value.padded) {
		warnings.push({
			code: "RHYTHM_PADDED",
			path: "rhythm",
			message: "The rhythm did not fill its bar; the rest of the bar is silent.",
		});
	}
	return { ok: true, errors: [], warnings };
}

/** What `validateTab` reads from the chord library; the tests stand in for it. */
export interface ChordLibrary {
	index: () => Promise<readonly ChordIndexEntry[]>;
	/** A chord's voicings, null when the library has no such chord. */
	voicings: (root: string, suffix: string) => Promise<readonly ChordVoicing[] | null>;
}

const CHORD_LIBRARY: ChordLibrary = {
	index: getChordIndex,
	voicings: async (root, suffix) => (await getChord(root, suffix))?.chord_voicings ?? null,
};

const chordKey = (chord: ChordRef) => `${chord.root} ${chord.suffix} ${chord.voicingId ?? ""}`;

/** The shape each chord the draft's × stand under holds; a chord the library cannot give is left out. */
async function chordToneShapes(chords: ChordRef[], library: ChordLibrary): Promise<Map<string, FretHint[]>> {
	const shapes = new Map<string, FretHint[]>();
	await Promise.all(
		chords.map(async (chord) => {
			try {
				const voicings = await library.voicings(chord.root, chord.suffix);
				const voicing = voicings ? selectRefVoicing(chord, [...voicings]) : null;
				if (voicing) shapes.set(chordKey(chord), chordFretHints(voicing));
			} catch {
				// No shape: the × under it are written open, each with a warning.
			}
		}),
	);
	return shapes;
}

export async function validateTab(
	request: ValidateTabRequest,
	library: ChordLibrary = CHORD_LIBRARY,
): Promise<ValidateResponse> {
	const repeats = Array.isArray(request.repeats) ? request.repeats.filter(isRepeat) : [];
	const named: ValidationIssue[] = [];
	let draft = request.draft;
	if (hasChordNames(draft)) {
		// The chords are labels: with the library out of reach the tab still
		// validates, and every name comes back unplaced rather than the draft failing.
		let index: readonly ChordIndexEntry[] = [];
		try {
			index = await library.index();
		} catch {
			named.push({
				code: "CHORDS_UNAVAILABLE",
				path: "measures",
				message: "The chord library could not be read; the chord names were left off the slots.",
			});
		}
		const resolved = resolveDraftChordNames(draft, index);
		draft = resolved.draft;
		named.push(...resolved.warnings);
	}
	// After the names, so a × reads the chord the page printed over it; before
	// the repeats, so a repeated bar keeps the chord it was printed under.
	const toneChords = chordToneChords(draft);
	const shapes = await chordToneShapes(toneChords, library);
	const toned = resolveDraftChordTones(draft, (chord) => shapes.get(chordKey(chord)) ?? null);
	if (toned.draft !== draft && named.some((w) => w.code === "UNKNOWN_CHORD" || w.code === "CHORDS_UNAVAILABLE")) {
		named.push({
			code: "TAB_CHORD_TONE",
			path: "measures",
			message: "Some chord names were not placed, so the × under them were fretted from the chord before them, or open.",
		});
	}
	draft = toned.draft;
	named.push(...toned.warnings);
	const { pattern, errors, warnings } = normalizeImportedPattern(draft, repeats);
	return { ok: pattern !== null, errors, warnings: [...named, ...warnings], ...(pattern ? { pattern } : {}) };
}

export async function POST(request: Request): Promise<Response> {
	if (!process.env.BOOK_SERVICE_INTERNAL_SECRET) {
		return json({ error: "BOOK_SERVICE_INTERNAL_SECRET is unset on this deployment." }, 503);
	}
	if (!secretMatches(request.headers.get("x-internal-secret"))) {
		return json({ error: "Not authorized." }, 401);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Body was not valid JSON." }, 400);
	}
	if (typeof body !== "object" || body === null) return json({ error: "Expected a JSON object." }, 400);
	const req = body as Record<string, unknown>;

	if (req.kind === "strum" && typeof req.rhythm === "string") {
		const beatsPerBar = typeof req.beatsPerBar === "number" ? req.beatsPerBar : undefined;
		return json(validateStrum({ kind: "strum", rhythm: req.rhythm, beatsPerBar }), 200);
	}
	if (req.kind === "tab" && "draft" in req) {
		return json(
			await validateTab({ kind: "tab", draft: req.draft, repeats: req.repeats as RepeatDirective[] }),
			200,
		);
	}
	return json({ error: "kind must be strum (with rhythm) or tab (with draft)." }, 400);
}
