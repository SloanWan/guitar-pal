import type { SupabaseClient, User } from "@supabase/supabase-js";
import { listBooks } from "@/lib/books/api";
import type { Book } from "@/lib/books/types";
import { withGlyphs } from "@/lib/chordFormulas";
import { chordHref } from "@/lib/chordSlug";
import { chordSymbol } from "@/lib/chordSuffixes";
import { PRESET_FINGERPICK_PATTERNS } from "@/lib/fingerpickPatterns";
import { loadUserFingerpickPatterns } from "@/lib/fingerpickPatternSync";
import type { FingerpickPattern } from "@/lib/fingerpickTypes";
import { readSharedItem, isExpired, type SharedItemKind } from "@/lib/sharedItems";
import { patternMeter } from "@/lib/strumBars";
import { meterLabel } from "@/lib/strumMeter";
import { PRESET_STRUM_PATTERNS, type ChordProgression, type StrumPattern } from "@/lib/strumPatterns";
import { progressionDisplayName } from "@/lib/strumProgressions";
import { patternFromRow, progressionFromRow, type ProgressionRow, type StrumPatternRow } from "@/lib/strumStorage";
import { addAccountFavourites, removeAccountFavourite } from "@/lib/favouriteChordStore";
import { readChordVisitTarget } from "@/lib/visits";
import {
	countSince,
	sortKept,
	topOpened,
	weekStart,
	type KeepTarget,
	type KeptItem,
	type OpenedItem,
	type OpenedThing,
	type VisitRow,
	type WeekCounts,
} from "./home";

export interface HomeContinue {
	pattern: StrumPattern;
	/** The sequence open on it, when this device left one open; else the rhythm alone. */
	progression: ChordProgression | null;
	/** When the pattern was last opened (ISO), on any device. */
	openedAt: string | null;
}

export interface HomeTab {
	pattern: FingerpickPattern;
	custom: boolean;
	openedAt: string | null;
}

export interface KeptChord {
	root: string;
	suffix: string;
	createdAt: string;
}

export interface SharedLink {
	id: string;
	kind: SharedItemKind;
	title: string;
	createdAt: string;
}

export interface HomeData {
	continued: HomeContinue | null;
	tab: HomeTab | null;
	/** Kept chords, newest first. */
	chords: KeptChord[];
	/** How many shapes of their own the player has drawn. */
	shapes: number;
	/** The newest book, when the book service answers. */
	book: Book | null;
	kept: KeptItem[];
	/** The things opened most, most first. */
	opened: OpenedItem[];
	links: SharedLink[];
	week: WeekCounts;
}

/** "Most opened" lists five; a few more are read in case some are gone. */
const OPENED_SHOWN = 5;
const OPENED_READ = 20;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
	if (res.error) throw new Error(res.error.message);
	return res.data as T;
}

/**
 * Everything /home shows, read in one go. `openProgressionId` is the sequence
 * this device last left open on the Strum page (it is kept on the device, not
 * the account), so the card plays what Strum would open.
 */
export async function loadHome(
	supabase: SupabaseClient,
	user: User,
	openProgressionId: string | null,
	now: Date,
): Promise<HomeData> {
	const uid = user.id;
	const [last, strumRows, progressionRows, strumFavs, tabCustoms, tabFavs, chordRows, shapeRows, shareRows, visitRows, books] =
		await Promise.all([
			supabase.from("user_last_pattern").select("tool, pattern_id, updated_at").eq("user_id", uid).then(check),
			supabase.from("user_strum_patterns").select("*").eq("user_id", uid).then(check),
			supabase.from("user_pattern_progressions").select("*").eq("user_id", uid).then(check),
			supabase.from("user_favourite_patterns").select("pattern_id, created_at").eq("user_id", uid).then(check),
			loadUserFingerpickPatterns(supabase, user),
			supabase.from("user_favourite_fingerpick_patterns").select("pattern_id").eq("user_id", uid).then(check),
			supabase.from("user_favourite_chords").select("root, suffix, created_at").eq("user_id", uid).then(check),
			supabase.from("user_chord_voicings").select("id, root, suffix, label, frets, created_at").eq("user_id", uid).then(check),
			supabase
				.from("shared_items")
				.select("id, kind, payload, created_at, expires_at")
				.eq("owner_id", uid)
				.order("created_at", { ascending: false })
				.then(check),
			// More than are shown: rows for things since deleted are skipped.
			supabase
				.from("user_visits")
				.select("kind, target, count, last_at")
				.eq("user_id", uid)
				.order("count", { ascending: false })
				.order("last_at", { ascending: false })
				.limit(OPENED_READ)
				.then(check),
			// The book service is its own process and may be away; Home goes on without it.
			listBooks().catch((): Book[] => []),
		]);

	const book = [...books].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;

	const lastRows = (last ?? []) as { tool: string; pattern_id: string; updated_at: string }[];
	const lastOf = (tool: string) => lastRows.find((r) => r.tool === tool) ?? null;

	const strumCustoms = ((strumRows ?? []) as StrumPatternRow[]).map(patternFromRow);
	const strumAll = [...PRESET_STRUM_PATTERNS, ...strumCustoms];
	const strumById = new Map(strumAll.map((p) => [p.id, p]));
	const isCustomStrum = new Set(strumCustoms.map((p) => p.id));

	const progressionData = ((progressionRows ?? []) as ProgressionRow[]).flatMap((row) => {
		const progression = progressionFromRow(row);
		return progression ? [{ progression, createdAt: row.created_at ?? null }] : [];
	});

	const tabAll = [...PRESET_FINGERPICK_PATTERNS, ...tabCustoms];
	const tabById = new Map(tabAll.map((p) => [p.id, p]));
	const isCustomTab = new Set(tabCustoms.map((p) => p.id));

	// The pattern last opened on Strum, with what this device had open on it.
	const lastStrum = lastOf("strum");
	const strumPattern = lastStrum ? strumById.get(lastStrum.pattern_id) : undefined;
	const continued: HomeContinue | null = strumPattern
		? {
				pattern: strumPattern,
				progression:
					progressionData.find((d) => d.progression.id === openProgressionId && d.progression.patternId === strumPattern.id)
						?.progression ?? null,
				openedAt: lastStrum?.updated_at ?? null,
			}
		: null;

	const lastTab = lastOf("fingerpick");
	const tabPattern = lastTab ? tabById.get(lastTab.pattern_id) : undefined;
	const tab: HomeTab | null = tabPattern
		? { pattern: tabPattern, custom: isCustomTab.has(tabPattern.id), openedAt: lastTab?.updated_at ?? null }
		: null;

	const chords = ((chordRows ?? []) as { root: string; suffix: string; created_at: string }[])
		.map((r) => ({ root: r.root, suffix: r.suffix, createdAt: r.created_at }))
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
	const shapes = (shapeRows ?? []) as { id: string; root: string; suffix: string; label: string | null; frets: string; created_at: string }[];

	// Kept and saved: favourites and the player's own things, in one list.
	const favStrum = (strumFavs ?? []) as { pattern_id: string; created_at: string }[];
	const favStrumIds = new Set(favStrum.map((f) => f.pattern_id));
	const favTabIds = new Set(((tabFavs ?? []) as { pattern_id: string }[]).map((f) => f.pattern_id));
	const strumItem = (p: StrumPattern, createdAt: string | null): KeptItem => ({
		key: `strum:${p.id}`,
		module: "strum",
		title: p.name,
		subline: `Pattern · ${isCustomStrum.has(p.id) ? "Yours" : "Preset"} · ${meterLabel(patternMeter(p))}`,
		href: `/strum?pattern=${encodeURIComponent(p.id)}`,
		createdAt,
		keep: { target: { kind: "strum", id: p.id }, kept: favStrumIds.has(p.id) },
	});
	const tabItem = (p: FingerpickPattern, createdAt: string | null): KeptItem => ({
		key: `tab:${p.id}`,
		module: "tab",
		title: p.name,
		subline: `Tab · ${isCustomTab.has(p.id) ? "Yours" : "Preset"} · ${p.timeSignature[0]}/${p.timeSignature[1]}`,
		href: `/fingerpick?pattern=${encodeURIComponent(p.id)}`,
		createdAt,
		keep: { target: { kind: "tab", id: p.id }, kept: favTabIds.has(p.id) },
	});
	const kept = sortKept([
		...favStrum.flatMap((f) => {
			const p = strumById.get(f.pattern_id);
			return p ? [strumItem(p, f.created_at)] : [];
		}),
		...strumCustoms.filter((p) => !favStrumIds.has(p.id)).map((p) => strumItem(p, p.createdAt ?? null)),
		...progressionData.flatMap(({ progression, createdAt }) => {
			const on = strumById.get(progression.patternId);
			if (!on) return [];
			return [
				{
					key: `progression:${progression.id}`,
					module: "strum" as const,
					title: progressionDisplayName(progression),
					subline: `Progression · on ${on.name}`,
					href: `/strum?pattern=${encodeURIComponent(on.id)}`,
					createdAt,
					progressionId: progression.id,
				},
			];
		}),
		...tabCustoms.map((p) => tabItem(p, p.createdAt ?? null)),
		// The favourites table keeps no date: kept presets list after everything dated.
		...[...favTabIds].flatMap((id) => {
			const p = tabById.get(id);
			return p && !isCustomTab.has(id) ? [tabItem(p, null)] : [];
		}),
		...chords.map((c) => ({
			key: `chord:${c.root}|${c.suffix}`,
			module: "chords" as const,
			title: withGlyphs(chordSymbol(c.root, c.suffix)),
			subline: "Chord · kept",
			href: chordHref(c.root, c.suffix),
			createdAt: c.createdAt,
			keep: { target: { kind: "chord" as const, root: c.root, suffix: c.suffix }, kept: true },
		})),
		...shapes.map((s) => {
			const name = withGlyphs(chordSymbol(s.root, s.suffix));
			return {
				key: `shape:${s.id}`,
				module: "chords" as const,
				title: s.label ? `${name} · ${s.label}` : name,
				subline: `Your shape · ${s.frets}`,
				href: chordHref(s.root, s.suffix),
				createdAt: s.created_at,
			};
		}),
	]);

	const bookById = new Map(books.map((b) => [b.id, b]));
	const opened = topOpened(
		(visitRows ?? []) as VisitRow[],
		(row): OpenedThing | null => {
			const href = (path: string, id: string) => `${path}?pattern=${encodeURIComponent(id)}`;
			switch (row.kind) {
				case "strum": {
					const p = strumById.get(row.target);
					return p
						? { module: "strum", title: p.name, label: `Pattern · ${isCustomStrum.has(p.id) ? "Yours" : "Preset"}`, href: href("/strum", p.id) }
						: null;
				}
				case "tab": {
					const p = tabById.get(row.target);
					return p
						? { module: "tab", title: p.name, label: `Tab · ${isCustomTab.has(p.id) ? "Yours" : "Preset"}`, href: href("/fingerpick", p.id) }
						: null;
				}
				case "chord": {
					const c = readChordVisitTarget(row.target);
					return c ? { module: "chords", title: withGlyphs(chordSymbol(c.root, c.suffix)), label: "Chord", href: chordHref(c.root, c.suffix) } : null;
				}
				case "book": {
					const b = bookById.get(row.target);
					return b ? { module: "books", title: b.title, label: "Book", href: `/books/${b.id}` } : null;
				}
				default:
					return null;
			}
		},
		OPENED_SHOWN,
	);

	const live = ((shareRows ?? []) as { id: string; kind: string; payload: unknown; created_at: string; expires_at: string | null }[]).filter(
		(r) => !isExpired(r.expires_at, now),
	);
	const links = live.flatMap((row): SharedLink[] => {
		const item = readSharedItem(row);
		if (!item) return [];
		const open = item.kind === "strum" ? item.progressions[item.openIndex] : undefined;
		const title = open ? progressionDisplayName(open) : item.pattern.name;
		return [{ id: row.id, kind: item.kind, title, createdAt: row.created_at }];
	});

	const since = weekStart(now);
	const week: WeekCounts = {
		progressions: countSince(
			progressionData.map((d) => d.createdAt),
			since,
		),
		chords: countSince(
			chords.map((c) => c.createdAt),
			since,
		),
		links: countSince(
			live.map((r) => r.created_at),
			since,
		),
	};

	return { continued, tab, chords, shapes: shapes.length, book, kept, opened, links, week };
}

const FAVOURITE_TABLE = { strum: "user_favourite_patterns", tab: "user_favourite_fingerpick_patterns" } as const;

/** Keep something as a favourite, or let it go — the same rows the Strum, Tab and Chords pages write. */
export async function setKept(supabase: SupabaseClient, user: User, target: KeepTarget, kept: boolean): Promise<void> {
	if (target.kind === "chord") {
		const chord = { root: target.root, suffix: target.suffix };
		if (kept) await addAccountFavourites([chord], user.id);
		else await removeAccountFavourite(chord, user.id);
		return;
	}
	const table = supabase.from(FAVOURITE_TABLE[target.kind]);
	const { error } = kept
		? await table.insert({ user_id: user.id, pattern_id: target.id })
		: await table.delete().eq("user_id", user.id).eq("pattern_id", target.id);
	if (error) throw new Error(error.message);
}
