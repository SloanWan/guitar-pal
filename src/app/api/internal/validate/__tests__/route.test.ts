// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST, validateTab } from "@/app/api/internal/validate/route";

const chordIndex = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/chordsData", async () => {
	const { INDEX } = await import("@/lib/assistant/tab/__tests__/fixtures");
	return {
		getChordIndex: async () => {
			chordIndex.calls += 1;
			return INDEX;
		},
	};
});

/**
 * The validator the book service calls: the secret gate, and that each kind
 * answers in the one shape with the real validators' errors and warnings.
 */

const SECRET = "test-secret-for-the-book-service";

function post(body: unknown, secret: string | null = SECRET): Promise<Response> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (secret !== null) headers["x-internal-secret"] = secret;
	return POST(new Request("http://localhost/api/internal/validate", { method: "POST", headers, body: JSON.stringify(body) }));
}

/** A one-measure tab draft in the editor's shape. */
function tabDraft(): unknown {
	const strings = () =>
		Array.from({ length: 6 }, () => ({ fret: null, muted: false }));
	return {
		name: "Read from p3",
		bpm: 80,
		timeSignature: [4, 4],
		measures: [
			{
				id: "m1",
				slots: [
					{ id: "s1", duration: "quarter", strings: strings() },
					{ id: "s2", duration: "quarter", strings: strings() },
					{ id: "s3", duration: "quarter", strings: strings() },
					{ id: "s4", duration: "quarter", strings: strings() },
				],
			},
		],
	};
}

/** The draft with a printed chord name on some of its slots, as the book service sends it. */
function namedDraft(...names: (string | undefined)[]): unknown {
	const draft = tabDraft() as { measures: { slots: Record<string, unknown>[] }[] };
	names.forEach((name, i) => {
		if (name !== undefined) draft.measures[0].slots[i].chordName = name;
	});
	return draft;
}

beforeEach(() => {
	vi.stubEnv("BOOK_SERVICE_INTERNAL_SECRET", SECRET);
	chordIndex.calls = 0;
});

describe("POST /api/internal/validate", () => {
	it("rejects a missing or wrong secret and never validates", async () => {
		expect((await post({ kind: "strum", rhythm: "D DU" }, null)).status).toBe(401);
		expect((await post({ kind: "strum", rhythm: "D DU" }, "wrong")).status).toBe(401);
	});

	it("is a 503 when no secret is configured", async () => {
		vi.stubEnv("BOOK_SERVICE_INTERNAL_SECRET", "");
		expect((await post({ kind: "strum", rhythm: "D DU" })).status).toBe(503);
	});

	it("validates a strum rhythm through parseRhythm", async () => {
		const ok = await (await post({ kind: "strum", rhythm: "D DU UDU" })).json();
		expect(ok).toEqual({ ok: true, errors: [], warnings: [] });

		const padded = await (await post({ kind: "strum", rhythm: "D U" })).json();
		expect(padded.ok).toBe(true);
		expect(padded.warnings.map((w: { code: string }) => w.code)).toEqual(["RHYTHM_PADDED"]);

		const bad = await (await post({ kind: "strum", rhythm: "D Q U" })).json();
		expect(bad.ok).toBe(false);
		expect(bad.errors[0]).toMatchObject({ code: "invalid-character", path: "rhythm[2]" });
	});

	it("validates a tab draft through the tabImport chain", async () => {
		const response = await post({ kind: "tab", draft: tabDraft() });
		const body = await response.json();
		expect(body.ok).toBe(true);
		expect(body.errors).toEqual([]);
		expect(body.pattern.measures).toHaveLength(1);

		const broken = await (await post({ kind: "tab", draft: { measures: "nope" } })).json();
		expect(broken.ok).toBe(false);
		expect(broken.errors[0].code).toBe("MEASURES_NOT_ARRAY");
		expect(broken.pattern).toBeUndefined();
	});

	it("expands repeats and reports the warnings the chain raises", async () => {
		const body = await (
			await post({ kind: "tab", draft: tabDraft(), repeats: [{ range: [0, 0], times: 3 }] })
		).json();
		expect(body.ok).toBe(true);
		expect(body.pattern.measures).toHaveLength(3);
	});

	it("puts a printed chord name on its slot, and says which names it could not (#427)", async () => {
		const body = await (await post({ kind: "tab", draft: namedDraft("Am", undefined, "Zm", "N.C.") })).json();
		expect(body.ok).toBe(true);
		const slots = body.pattern.measures[0].slots;
		expect(slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
		expect(slots[2].chord).toBeUndefined();
		expect(slots[3].chord).toEqual({ root: "N.C.", suffix: "", voicingId: null });
		expect(slots.some((s: Record<string, unknown>) => "chordName" in s)).toBe(false);
		expect(body.warnings).toContainEqual(
			expect.objectContaining({ code: "UNKNOWN_CHORD", path: "measures[0].slots[2].chordName", original: "Zm" }),
		);
	});

	it("reads the chord library only for a draft that names a chord", async () => {
		await post({ kind: "tab", draft: tabDraft() });
		expect(chordIndex.calls).toBe(0);
		await post({ kind: "tab", draft: namedDraft("C") });
		expect(chordIndex.calls).toBe(1);
	});

	it("still validates the tab when the chord library cannot be read", async () => {
		const down = async () => {
			throw new Error("supabase down");
		};
		const body = await validateTab({ kind: "tab", draft: namedDraft("Am", "Zm") }, down);
		expect(body.ok).toBe(true);
		expect(body.warnings.map((w) => w.code)).toEqual(["CHORDS_UNAVAILABLE", "UNKNOWN_CHORD"]);
		// A name spelled as a chord of a known kind still lands; the rest wait in the description.
		const slots = (body.pattern as { measures: { slots: { chord?: unknown }[] }[] }).measures[0].slots;
		expect(slots[0].chord).toEqual({ root: "A", suffix: "minor", voicingId: null });
		expect(slots[1].chord).toBeUndefined();
	});

	it("keeps a note's v2 marks and folds per-note palm-mute flags into a span", async () => {
		const draft = tabDraft() as { measures: { slots: { id?: string; strings: Record<string, unknown>[] }[] }[] };
		for (const s of draft.measures[0].slots) delete s.id;
		draft.measures[0].slots[0].strings[5] = { fret: 0, muted: false, palmMute: true };
		draft.measures[0].slots[1].strings[5] = { fret: 2, muted: false, palmMute: true, link: { kind: "hammer" } };
		const body = await (await post({ kind: "tab", draft })).json();
		expect(body.ok).toBe(true);
		expect(body.pattern.measures[0].slots[1].strings[5].link).toEqual({ kind: "hammer" });
		expect(body.pattern.spans).toEqual([expect.objectContaining({ kind: "palmMute" })]);
	});

	it("refuses an unknown kind", async () => {
		expect((await post({ kind: "chords" })).status).toBe(400);
	});
});
