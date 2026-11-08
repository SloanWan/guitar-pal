import type { ChordVoicing } from "@/lib/chordVoicing";
import {
	chordParam,
	MAX_CHORDS_PER_REQUEST,
	voicingCacheKey,
	VOICINGS_ENDPOINT,
	VOICINGS_TIMEOUT_MS,
	type ChordKey,
} from "@/lib/chordVoicingsApi";

// One client-side cache for `chord_voicings` reads, shared by everything that
// resolves a `ChordRef`: the strum engine's pitch lookup and the chord-diagram
// view both go through it, so whichever asks first pays for the round trip and
// the other is served from memory.
//
// Voicings are public reference data that only changes with a migration, so the
// cache also persists to localStorage: a reload, or tomorrow's practice
// session, redraws the same chords without touching the network.
//
// They come from our own origin (#463), not from Supabase: the server answers
// from its cached copy of the library, so a visitor whose link to Supabase is
// slow or blocked still sees them, and the chords asked for at once go out as
// one request.

/** Bump when the stored shape changes; old entries are then simply ignored. */
const STORAGE_VERSION = "v3";
const STORAGE_PREFIX = `chordVoicings:${STORAGE_VERSION}:`;

export { voicingCacheKey };

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

/** Several chords' voicings in one go, keyed by `voicingCacheKey`. */
export type VoicingBatchFetcher = (chords: readonly ChordKey[]) => Promise<Record<string, ChordVoicing[]>>;

/**
 * A one-chord fetcher over a many-chord one: the chords asked for in the same
 * tick (a search's dropdown drawing ten shapes) go out together, at most
 * `maxPerBatch` to a request. A chord missing from the answer is one the
 * library lacks; a failed request fails every chord in it.
 */
export function batchVoicingFetches(fetchMany: VoicingBatchFetcher, maxPerBatch = MAX_CHORDS_PER_REQUEST): VoicingFetcher {
	type Waiter = { resolve: (voicings: ChordVoicing[]) => void; reject: (err: unknown) => void };
	let queue = new Map<string, { chord: ChordKey; waiters: Waiter[] }>();

	function flush() {
		const entries = [...queue.entries()];
		queue = new Map();
		for (let i = 0; i < entries.length; i += maxPerBatch) {
			const batch = entries.slice(i, i + maxPerBatch);
			fetchMany(batch.map(([, entry]) => entry.chord)).then(
				(answer) => {
					for (const [key, entry] of batch) for (const waiter of entry.waiters) waiter.resolve(answer[key] ?? []);
				},
				(err: unknown) => {
					for (const [, entry] of batch) for (const waiter of entry.waiters) waiter.reject(err);
				},
			);
		}
	}

	return (root, suffix) =>
		new Promise<ChordVoicing[]>((resolve, reject) => {
			if (queue.size === 0) queueMicrotask(flush);
			const key = voicingCacheKey(root, suffix);
			const entry = queue.get(key) ?? { chord: { root, suffix }, waiters: [] };
			entry.waiters.push({ resolve, reject });
			queue.set(key, entry);
		});
}

/**
 * The live batch fetcher: our own route. It gives up after `VOICINGS_TIMEOUT_MS`,
 * so a request stuck on a bad link fails (and can be retried) instead of
 * leaving a shape loading for good.
 */
const fetchFromServer: VoicingBatchFetcher = async (chords) => {
	const query = new URLSearchParams(chords.map((chord) => ["c", chordParam(chord)]));
	const res = await fetch(`${VOICINGS_ENDPOINT}?${query}`, { signal: AbortSignal.timeout(VOICINGS_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`chord shapes: HTTP ${res.status}`);
	const body: unknown = await res.json();
	const voicings = (body as { voicings?: unknown } | null)?.voicings;
	if (typeof voicings !== "object" || voicings === null) throw new Error("chord shapes: unexpected answer");
	return voicings as Record<string, ChordVoicing[]>;
};

const browserStorage: VoicingStorage | undefined =
	typeof window === "undefined" ? undefined : window.localStorage;

/** The app-wide instance. Module-level, so it survives component remounts. */
export const voicingCache = createVoicingCache(batchVoicingFetches(fetchFromServer), browserStorage);

export const peekVoicings = voicingCache.peek;
export const loadVoicings = voicingCache.load;
