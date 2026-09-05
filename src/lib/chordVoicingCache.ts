import { createClient } from "@/lib/supabase";
import type { ChordVoicing } from "@/lib/chordVoicingToVexChords";

// One client-side cache for `chord_voicings` reads, shared by everything that
// resolves a `ChordRef`: the strum engine's pitch lookup and the chord-diagram
// view both go through it, so whichever asks first pays for the round trip and
// the other is served from memory.
//
// Voicings are public reference data that only changes with a migration, so the
// cache also persists to localStorage: a reload, or tomorrow's practice
// session, redraws the same chords without touching the network.

/** Bump when the stored shape changes; old entries are then simply ignored. */
const STORAGE_VERSION = "v1";
const STORAGE_PREFIX = `chordVoicings:${STORAGE_VERSION}:`;

export function voicingCacheKey(root: string, suffix: string): string {
	return `${root} ${suffix}`;
}

/** The slice of `Storage` the cache uses; injected so tests can fake it. */
export interface VoicingStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export type VoicingFetcher = (root: string, suffix: string) => Promise<ChordVoicing[]>;

export interface VoicingCache {
	/**
	 * Cached voicings, or null when they have to be fetched. Synchronous, so a
	 * component can render the real thing on its first paint instead of
	 * flashing a placeholder for data it already has.
	 */
	peek(root: string, suffix: string): ChordVoicing[] | null;
	/**
	 * Voicings for a chord, fetched at most once: a second call made while the
	 * first is still in flight joins it rather than starting another request.
	 * A failed fetch is not cached, so the next call retries.
	 */
	load(root: string, suffix: string): Promise<ChordVoicing[]>;
}

export function createVoicingCache(
	fetchVoicings: VoicingFetcher,
	storage?: VoicingStorage,
): VoicingCache {
	const memory = new Map<string, ChordVoicing[]>();
	const inFlight = new Map<string, Promise<ChordVoicing[]>>();

	// Storage is best-effort throughout: Safari's private mode throws on both
	// reads and writes, and a corrupt entry must never take the page down.
	function readStored(key: string): ChordVoicing[] | null {
		if (!storage) return null;
		try {
			const raw = storage.getItem(STORAGE_PREFIX + key);
			if (!raw) return null;
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? (parsed as ChordVoicing[]) : null;
		} catch {
			return null;
		}
	}

	function writeStored(key: string, voicings: ChordVoicing[]): void {
		if (!storage) return;
		try {
			storage.setItem(STORAGE_PREFIX + key, JSON.stringify(voicings));
		} catch {
			// Quota or a locked-down browser: memory alone still does the job.
		}
	}

	function peek(root: string, suffix: string): ChordVoicing[] | null {
		const key = voicingCacheKey(root, suffix);
		const cached = memory.get(key);
		if (cached) return cached;
		const stored = readStored(key);
		if (stored) memory.set(key, stored);
		return stored;
	}

	function load(root: string, suffix: string): Promise<ChordVoicing[]> {
		const key = voicingCacheKey(root, suffix);
		const cached = peek(root, suffix);
		if (cached) return Promise.resolve(cached);

		const pending = inFlight.get(key);
		if (pending) return pending;

		const request = fetchVoicings(root, suffix)
			.then((voicings) => {
				memory.set(key, voicings);
				writeStored(key, voicings);
				return voicings;
			})
			.finally(() => {
				inFlight.delete(key);
			});
		inFlight.set(key, request);
		return request;
	}

	return { peek, load };
}

/** The live fetcher: one chord's voicings, straight from Supabase. */
const fetchFromDatabase: VoicingFetcher = async (root, suffix) => {
	const { data, error } = await createClient()
		.from("chords")
		.select("chord_voicings(id, label, start_fret, barre_fret, capo, frets, fingers)")
		.eq("root", root)
		.eq("suffix", suffix)
		// maybeSingle, not single: a chord the library does not carry is an empty
		// answer to cache, not an error to retry forever.
		.maybeSingle();
	if (error) throw new Error(error.message);
	return (data as { chord_voicings: ChordVoicing[] } | null)?.chord_voicings ?? [];
};

const browserStorage: VoicingStorage | undefined =
	typeof window === "undefined" ? undefined : window.localStorage;

/** The app-wide instance. Module-level, so it survives component remounts. */
export const voicingCache = createVoicingCache(fetchFromDatabase, browserStorage);

export const peekVoicings = voicingCache.peek;
export const loadVoicings = voicingCache.load;
