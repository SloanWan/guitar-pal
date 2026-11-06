import { timingSafeEqual } from "node:crypto";
import { parseRhythm } from "@/lib/assistant/strum/parseRhythm";
import { getChordIndex } from "@/lib/chordsData";
import type { ChordIndexEntry } from "@/lib/chordSearch";
import { hasChordNames, normalizeImportedPattern, resolveDraftChordNames } from "@/lib/tabImport";
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
	 * the word as its `original`.
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

export async function validateTab(
	request: ValidateTabRequest,
	chordIndex: () => Promise<readonly ChordIndexEntry[]> = getChordIndex,
): Promise<ValidateResponse> {
	const repeats = Array.isArray(request.repeats) ? request.repeats.filter(isRepeat) : [];
	const named: ValidationIssue[] = [];
	let draft = request.draft;
	if (hasChordNames(draft)) {
		// The chords are labels: with the library out of reach the tab still
		// validates, and every name comes back unplaced rather than the draft failing.
		let index: readonly ChordIndexEntry[] = [];
		try {
			index = await chordIndex();
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
