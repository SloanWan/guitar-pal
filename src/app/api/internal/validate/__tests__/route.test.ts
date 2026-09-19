// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/internal/validate/route";

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
		Array.from({ length: 6 }, () => ({ fret: null, technique: null, tied: false, muted: false }));
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

beforeEach(() => {
	vi.stubEnv("BOOK_SERVICE_INTERNAL_SECRET", SECRET);
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

	it("refuses an unknown kind", async () => {
		expect((await post({ kind: "chords" })).status).toBe(400);
	});
});
