import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Book } from "@/lib/books/types";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { toSharePayload } from "@/lib/sharedItems";
import { PRESET_STRUM_PATTERNS } from "@/lib/strumPatterns";
import { loadHome } from "../loadHome";

const books = vi.hoisted(() => ({ list: vi.fn<() => Promise<Book[]>>() }));
const tabs = vi.hoisted(() => ({ load: vi.fn<() => Promise<FingerpickPattern[]>>() }));
vi.mock("@/lib/books/api", () => ({ listBooks: books.list }));
vi.mock("@/lib/fingerpickPatternSync", () => ({ loadUserFingerpickPatterns: tabs.load }));

type Rows = Record<string, unknown[]>;

/** A client that answers every query on a table with its rows, whatever the filters. */
function fakeClient(rows: Rows, failing?: string): SupabaseClient {
	return {
		from(table: string) {
			const result = failing === table ? { data: null, error: { message: `${table} is down` } } : { data: rows[table] ?? [], error: null };
			const query = {
				select: () => query,
				eq: () => query,
				order: () => query,
				limit: () => query,
				then: <T>(resolve: (r: typeof result) => T, reject?: (e: unknown) => T) => Promise.resolve(result).then(resolve, reject),
			};
			return query;
		},
	} as unknown as SupabaseClient;
}

const USER = { id: "u1" } as User;
// Thursday 29 October 2026, 21:40; the week began Monday the 26th.
const NOW = new Date(2026, 9, 29, 21, 40);
const THIS_WEEK = new Date(2026, 9, 27, 10).toISOString();
const LAST_WEEK = new Date(2026, 9, 20, 10).toISOString();

const PRESET = PRESET_STRUM_PATTERNS[2];
const TAB_PRESET = PRESET_FINGERPICK_PATTERNS[0];
const progressionRow = (id: string, patternId: string, created_at: string, name: string | null = null) => ({
	id,
	pattern_id: patternId,
	bars: [{ beats: [["D"]], chord: { root: "C", suffix: "major" } }],
	order_index: 0,
	name,
	bpm: null,
	capo: 2,
	created_at,
});

beforeEach(() => {
	books.list.mockReset().mockResolvedValue([]);
	tabs.load.mockReset().mockResolvedValue([]);
});

describe("loadHome", () => {
	it("continues the pattern last opened, with the progression this device left open on it", async () => {
		const client = fakeClient({
			user_last_pattern: [{ tool: "strum", pattern_id: PRESET.id, updated_at: THIS_WEEK }],
			user_pattern_progressions: [progressionRow("p1", PRESET.id, LAST_WEEK, "Song"), progressionRow("p2", "elsewhere", LAST_WEEK)],
		});
		const data = await loadHome(client, USER, "p1", NOW);
		expect(data.continued?.pattern.id).toBe(PRESET.id);
		expect(data.continued?.progression?.id).toBe("p1");
		expect(data.continued?.progression?.capo).toBe(2);
		expect(data.continued?.openedAt).toBe(THIS_WEEK);
	});

	it("plays the rhythm alone when the open progression belongs to another pattern", async () => {
		const client = fakeClient({
			user_last_pattern: [{ tool: "strum", pattern_id: PRESET.id, updated_at: THIS_WEEK }],
			user_pattern_progressions: [progressionRow("p2", "elsewhere", LAST_WEEK)],
		});
		const data = await loadHome(client, USER, "p2", NOW);
		expect(data.continued?.progression).toBeNull();
	});

	it("has nothing to continue when the last pattern is gone", async () => {
		const client = fakeClient({ user_last_pattern: [{ tool: "strum", pattern_id: "deleted", updated_at: THIS_WEEK }] });
		expect((await loadHome(client, USER, null, NOW)).continued).toBeNull();
	});

	it("finds the last tab among presets and the player's own", async () => {
		const own: FingerpickPattern = { ...TAB_PRESET, id: "mine", name: "Mine", createdAt: LAST_WEEK };
		tabs.load.mockResolvedValue([own]);
		const client = fakeClient({ user_last_pattern: [{ tool: "fingerpick", pattern_id: "mine", updated_at: THIS_WEEK }] });
		const data = await loadHome(client, USER, null, NOW);
		expect(data.tab).toMatchObject({ custom: true, openedAt: THIS_WEEK });
		expect(data.tab?.pattern.name).toBe("Mine");
	});

	it("lists what was kept and saved, newest first, kept tabs without a date last", async () => {
		const client = fakeClient({
			user_strum_patterns: [{ pattern_id: "late", name: "Late train", beats: [["D"]], created_at: LAST_WEEK }],
			user_favourite_patterns: [{ pattern_id: PRESET.id, created_at: THIS_WEEK }],
			user_pattern_progressions: [progressionRow("p1", "late", "2026-10-28T09:00:00Z")],
			user_favourite_fingerpick_patterns: [{ pattern_id: TAB_PRESET.id }],
			user_favourite_chords: [{ root: "A", suffix: "m7", created_at: "2026-10-29T08:00:00Z" }],
			user_chord_voicings: [{ id: "v1", root: "F", suffix: "maj7", label: "thumb over", frets: "1x3210", created_at: "2026-10-01T08:00:00Z" }],
		});
		const { kept } = await loadHome(client, USER, null, NOW);
		expect(kept.map((k) => k.key)).toEqual([
			"chord:A|m7",
			"progression:p1",
			`strum:${PRESET.id}`,
			"strum:late",
			"shape:v1",
			`tab:${TAB_PRESET.id}`,
		]);
		const byKey = Object.fromEntries(kept.map((k) => [k.key, k]));
		expect(byKey[`strum:${PRESET.id}`]).toMatchObject({ subline: "Pattern · Preset · 4/4", keep: { kept: true } });
		expect(byKey["strum:late"]).toMatchObject({ subline: "Pattern · Yours · 4/4", keep: { kept: false } });
		expect(byKey["progression:p1"]).toMatchObject({
			title: "C",
			subline: "Progression · on Late train",
			href: "/strum?pattern=late",
			progressionId: "p1",
		});
		expect(byKey["chord:A|m7"]).toMatchObject({ title: "Am7", keep: { target: { kind: "chord", root: "A", suffix: "m7" }, kept: true } });
		expect(byKey["shape:v1"]).toMatchObject({ title: "Fmaj7 · thumb over", subline: "Your shape · 1x3210" });
		expect(byKey["shape:v1"].keep).toBeUndefined();
	});

	it("counts the week from Monday and leaves expired links out", async () => {
		const shared = toSharePayload({
			kind: "strum",
			pattern: { ...PRESET, beats: PRESET.beats },
			progressions: [],
			openIndex: 0,
		});
		const client = fakeClient({
			user_pattern_progressions: [progressionRow("p1", PRESET.id, THIS_WEEK), progressionRow("p2", PRESET.id, LAST_WEEK)],
			user_favourite_chords: [{ root: "C", suffix: "major", created_at: THIS_WEEK }],
			shared_items: [
				{ id: "AAAAAAAAAA", kind: "strum", payload: shared, created_at: THIS_WEEK, expires_at: null },
				{ id: "BBBBBBBBBB", kind: "strum", payload: shared, created_at: THIS_WEEK, expires_at: LAST_WEEK },
			],
		});
		const data = await loadHome(client, USER, null, NOW);
		expect(data.week).toEqual({ progressions: 1, chords: 1, links: 1 });
		expect(data.links).toEqual([{ id: "AAAAAAAAAA", kind: "strum", title: PRESET.name, createdAt: THIS_WEEK }]);
	});

	it("lists the most opened, placing each among the player's things and skipping what is gone", async () => {
		books.list.mockResolvedValue([
			{ id: "bk", title: "Folk Book", page_count: 10, storage_path: "", status: "ready", toc_source: null, error: null, scanned_pages: 10, created_at: LAST_WEEK },
		]);
		const client = fakeClient({
			user_strum_patterns: [{ pattern_id: "late", name: "Late train", beats: [["D"]], created_at: LAST_WEEK }],
			user_visits: [
				{ kind: "strum", target: "late", count: 9, last_at: THIS_WEEK },
				{ kind: "strum", target: "deleted", count: 8, last_at: THIS_WEEK },
				{ kind: "tab", target: TAB_PRESET.id, count: 4, last_at: THIS_WEEK },
				{ kind: "chord", target: "A|m7", count: 3, last_at: THIS_WEEK },
				{ kind: "book", target: "bk", count: 2, last_at: THIS_WEEK },
				{ kind: "book", target: "unlisted", count: 2, last_at: THIS_WEEK },
			],
		});
		const { opened } = await loadHome(client, USER, null, NOW);
		expect(opened.map((o) => [o.module, o.title, o.href])).toEqual([
			["strum", "Late train", "/strum?pattern=late"],
			["tab", TAB_PRESET.name, `/fingerpick?pattern=${encodeURIComponent(TAB_PRESET.id)}`],
			["chords", "Am7", "/chords/a/m7"],
			["books", "Folk Book", "/books/bk"],
		]);
		expect(opened[0].subline).toBe("Pattern · Yours · opened 9 times");
	});

	it("shows the newest book, and goes on without the book service", async () => {
		const book = (id: string, created_at: string): Book => ({
			id,
			title: id,
			page_count: 10,
			storage_path: "",
			status: "ready",
			toc_source: null,
			error: null,
			scanned_pages: 10,
			created_at,
		});
		books.list.mockResolvedValue([book("old", LAST_WEEK), book("new", THIS_WEEK)]);
		expect((await loadHome(fakeClient({}), USER, null, NOW)).book?.id).toBe("new");
		books.list.mockRejectedValue(new Error("service down"));
		expect((await loadHome(fakeClient({}), USER, null, NOW)).book).toBeNull();
	});

	it("throws when a table cannot be read", async () => {
		await expect(loadHome(fakeClient({}, "user_favourite_chords"), USER, null, NOW)).rejects.toThrow("user_favourite_chords is down");
	});
});
