// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChordWithVoicings } from "@/lib/chordsData";

/** The shared chord shapes route, with the server's library cache faked. */

const library = vi.hoisted(() => ({ read: vi.fn<() => Promise<ChordWithVoicings[]>>() }));
vi.mock("@/lib/chordsData", () => ({ getAllChordsWithVoicings: library.read }));

import { GET } from "@/app/api/chords/voicings/route";

const C_MAJOR = { id: "c1", label: null, start_fret: 1, barre_fret: null, capo: false, frets: "x32010", fingers: "032010" };
const get = (query: string) => GET(new Request(`https://guitarpal.test/api/chords/voicings?${query}`));

beforeEach(() => {
	library.read.mockReset().mockResolvedValue([{ id: "1", root: "C", suffix: "major", chord_voicings: [C_MAJOR] }]);
});

describe("GET /api/chords/voicings", () => {
	it("answers the chords asked for from the library, cacheable for an hour", async () => {
		const res = await get("c=C:major&c=G:add11");
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
		expect(await res.json()).toEqual({ voicings: { "C major": [C_MAJOR], "G add11": [] } });
	});

	it("refuses a malformed ask without reading the library", async () => {
		expect((await get("c=nonsense")).status).toBe(400);
		expect((await get("")).status).toBe(400);
		expect(library.read).not.toHaveBeenCalled();
	});

	it("answers 503, and nothing cacheable, when the library cannot be read", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		library.read.mockRejectedValue(new Error("supabase down"));
		const res = await get("c=C:major");
		expect(res.status).toBe(503);
		expect(res.headers.get("cache-control")).toBeNull();
	});
});
